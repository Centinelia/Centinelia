import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { scanPlaceholders, TEMPLATE_SPECS } from '@/lib/documents/template-spec';

interface Params { params: Promise<{ token: string }> }

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Extract raw text from all XML parts of a .docx so scanPlaceholders sees tokens inside tables/headers. */
function docxToPlainXml(buffer: Buffer): string {
  try {
    const zip = new PizZip(buffer);
    const parts: string[] = [];
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith('.xml')) continue;
      const file = zip.files[name];
      if (file.dir) continue;
      parts.push(file.asText());
    }
    return parts.join('\n');
  } catch { return ''; }
}

const EXTRACT_PROMPTS: Record<string, string> = {
  factura: `Extrae del documento los datos del emisor de la factura:
- rfc: RFC del emisor (formato XAXX010101000)
- direccion: direccion fiscal completa
- condiciones_pago: condiciones de pago (ej. "30 dias netos")
- folio_prefix: prefijo del numero de factura (ej. "FAC", "INV", "F")

Responde SOLO con JSON valido, sin texto adicional. Omite campos que no encuentres.
Ejemplo: {"rfc":"ABC123456789","direccion":"Av. Ejemplo 123, Monterrey, NL","condiciones_pago":"30 dias netos","folio_prefix":"FAC"}`,

  orden: `Extrae del documento los siguientes datos:
- condiciones_pago: condiciones de pago (ej. "Pago a 30 dias")
- terminos_entrega: terminos de entrega (ej. "5 dias habiles")
- folio_prefix: prefijo del numero de orden (ej. "OC", "PO", "ORD")

Responde SOLO con JSON valido, sin texto adicional. Omite campos que no encuentres.
Ejemplo: {"condiciones_pago":"30 dias netos","terminos_entrega":"5 dias habiles","folio_prefix":"OC"}`,

  cotizacion: `Extrae del documento los siguientes datos:
- folio_prefix: prefijo del numero de cotizacion (ej. "COT", "Q", "PROP")
- vigencia_dias: dias de vigencia por defecto (ej. "15", "30")
- condiciones_pago: condiciones o esquema de pago sugerido

Responde SOLO con JSON valido, sin texto adicional. Omite campos que no encuentres.
Ejemplo: {"folio_prefix":"COT","vigencia_dias":"15","condiciones_pago":"50% anticipo"}`,

  nota_venta: `Extrae del documento los siguientes datos:
- folio_prefix: prefijo del numero de nota de venta (ej. "NV", "RC", "VTA")
- forma_pago: forma de pago comun (ej. "Efectivo", "Transferencia", "Tarjeta")

Responde SOLO con JSON valido, sin texto adicional. Omite campos que no encuentres.
Ejemplo: {"folio_prefix":"NV","forma_pago":"Efectivo"}`,

  contrato: `Extrae del documento:
- condiciones_pago: condiciones o terminos de pago si aparecen

Responde SOLO con JSON valido, sin texto adicional.
Ejemplo: {"condiciones_pago":"Pago mensual"}`,
};

async function extractFields(buffer: Buffer, docType: string): Promise<Record<string, unknown>> {
  if (!process.env.ANTHROPIC_API_KEY) return {};
  const prompt = EXTRACT_PROMPTS[docType] ?? EXTRACT_PROMPTS.factura;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { value: text } = await mammoth.extractRawText({ buffer });
    const content = `DOCUMENTO:\n${text.slice(0, 6000)}\n\n${prompt}`;

    const res = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages:   [{ role: 'user', content }],
    });

    const raw   = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'string' && (v as string).trim() !== '')
    );
  } catch { return {}; }
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const formData  = await req.formData();
  const file      = formData.get('file') as File | null;
  const docType   = (formData.get('doc_type') as string | null) ?? 'factura';

  if (!file) return NextResponse.json({ error: 'No se recibio archivo' }, { status: 400 });
  if (file.type !== DOCX_MIME) {
    return NextResponse.json({
      error: 'Solo aceptamos archivos .docx (Word). Los archivos .pdf ya no se soportan porque no podemos rellenar los placeholders. Abre tu plantilla en Word, agrega los marcadores como {{cliente_nombre}}, y guarda como .docx.',
    }, { status: 400 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo no puede superar 10 MB' }, { status: 400 });

  const ext    = 'docx';
  const path   = `plantillas/${agent.id}/${docType}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from('agent-documents')
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Scan for placeholders — only relevant for factura/orden which use docxtemplater
  const spec         = TEMPLATE_SPECS[docType];
  const xml          = docxToPlainXml(buffer);
  const found        = scanPlaceholders(xml);
  const foundSet     = new Set([...found.simple, ...found.loops]);
  const validation   = spec ? {
    all_placeholders:     spec.placeholders.map(p => p.key),
    required_placeholders: spec.placeholders.filter(p => p.required).map(p => p.key),
    found_placeholders:   Array.from(foundSet),
    missing_required:     spec.placeholders.filter(p => p.required && !foundSet.has(p.key)).map(p => p.key),
    missing_loop_fields:  spec.placeholders
      .filter(p => p.isLoop && foundSet.has(p.key) && p.loopFields)
      .flatMap(p => (p.loopFields ?? []).filter(sub => sub.required && !foundSet.has(sub.key)).map(sub => `${p.key}.${sub.key}`)),
  } : null;

  // Store reference in features
  const existing  = (agent.features as Record<string, unknown>) ?? {};
  const configKey = `${docType}_config`;
  const prevCfg   = (existing[configKey] as Record<string, unknown>) ?? {};
  const merged    = {
    ...existing,
    [configKey]: {
      ...prevCfg,
      template_path: path,
      template_name: file.name,
      template_ext:  ext,
      template_validation: validation,
    },
  };

  await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);

  const { data: signed } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(path, 3600);

  const extracted = await extractFields(buffer, docType);

  return NextResponse.json({ ok: true, path, name: file.name, ext, url: signed?.signedUrl ?? null, extracted, validation });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token }  = await params;
  const { doc_type: docType } = await req.json() as { doc_type: string };
  const supabase   = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features, portal_email').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const existing  = (agent.features as Record<string, unknown>) ?? {};
  const configKey = `${docType}_config`;
  const prevCfg   = (existing[configKey] as Record<string, unknown>) ?? {};
  const path      = prevCfg.template_path as string | undefined;

  if (path) {
    await supabase.storage.from('agent-documents').remove([path]);
  }

  const { template_path: _p, template_name: _n, template_ext: _e, ...restCfg } = prevCfg;
  const merged = { ...existing, [configKey]: restCfg };
  await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);

  return NextResponse.json({ ok: true });
}
