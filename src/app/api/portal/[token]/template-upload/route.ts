import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { updateOrgFeatureConfig } from '@/lib/portal/features';
import Anthropic from '@anthropic-ai/sdk';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { scanPlaceholders, TEMPLATE_SPECS } from '@/lib/documents/template-spec';
import { autoTemplatize, type DocType } from '@/lib/documents/auto-templatize';
import { generatePreviewPdf } from '@/lib/documents/template-preview';
import { logLlmCall } from '@/lib/observability/llm-log';

const AUTO_TEMPLATIZE_DOCTYPES: Set<string> = new Set(['factura', 'orden', 'cotizacion', 'nota_venta']);

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

  const __t = Date.now();
  const __m = 'claude-haiku-4-5-20251001';
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const { value: text } = await mammoth.extractRawText({ buffer });
    const content = `DOCUMENTO:\n${text.slice(0, 6000)}\n\n${prompt}`;

    const res = await client.messages.create({
      model:      __m,
      max_tokens: 300,
      messages:   [{ role: 'user', content }],
    });
    void logLlmCall({ source: 'template_upload_extract', model: __m, usage: res.usage, latencyMs: Date.now() - __t, meta: { docType } });

    const raw   = res.content[0]?.type === 'text' ? res.content[0].text.trim() : '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'string' && (v as string).trim() !== '')
    );
  } catch (err) {
    void logLlmCall({ source: 'template_upload_extract', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err), meta: { docType } });
    return {};
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, features, portal_email', supabase);
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

  const ext          = 'docx';
  const samplePath   = `plantillas/${agent.id}/${docType}_sample.${ext}`;
  const templatePath = `plantillas/${agent.id}/${docType}.${ext}`;
  const buffer       = Buffer.from(await file.arrayBuffer());

  // Check if the user already added their own {{placeholders}} — skip auto-templatize if so.
  const rawScan = scanPlaceholders(docxToPlainXml(buffer));
  const userAlreadyTemplated = rawScan.simple.length > 0 || rawScan.loops.length > 0;

  // Decide path:
  //   A. User pre-templated → save as-is at templatePath, skip auto-templatize.
  //   B. User uploaded a raw sample AND docType is auto-templatize-able → run LLM + save both.
  //   C. Contrato/otros → save as-is (contrato tiene su propio flujo con cláusulas).
  const canAutoTemplatize = !userAlreadyTemplated && AUTO_TEMPLATIZE_DOCTYPES.has(docType);

  let finalBuffer         = buffer;
  let autoResult:         Awaited<ReturnType<typeof autoTemplatize>> | null = null;
  let previewPdfUrl:      string | null = null;

  if (canAutoTemplatize) {
    // Save raw sample first (para poder ver el original si Nazre lo pide)
    await supabase.storage.from('agent-documents').upload(samplePath, buffer, { upsert: true, contentType: file.type });

    // Run auto-templatize
    autoResult = await autoTemplatize(buffer, docType as DocType);
    if (autoResult.ok) {
      finalBuffer = Buffer.from(autoResult.docxBuffer);

      // Generate a preview PDF with dummy data (best-effort — no bloqueamos si falla)
      try {
        const pdfBuf = await generatePreviewPdf(finalBuffer, docType as DocType);
        const previewPath = `plantillas/${agent.id}/${docType}_preview.pdf`;
        await supabase.storage.from('agent-documents').upload(previewPath, pdfBuf, { upsert: true, contentType: 'application/pdf' });
        const { data: previewSigned } = await supabase.storage.from('agent-documents').createSignedUrl(previewPath, 3600);
        previewPdfUrl = previewSigned?.signedUrl ?? null;
      } catch (err) {
        console.error('[template-upload] preview PDF failed:', err);
      }
    } else {
      console.warn('[template-upload] auto-templatize failed, falling back to raw upload:', autoResult.error);
    }
  }

  const { error: uploadErr } = await supabase.storage
    .from('agent-documents')
    .upload(templatePath, finalBuffer, { upsert: true, contentType: file.type });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Scan final buffer for placeholders (después de auto-templatize)
  const spec       = TEMPLATE_SPECS[docType];
  const finalXml   = docxToPlainXml(finalBuffer);
  const found      = scanPlaceholders(finalXml);
  const foundSet   = new Set([...found.simple, ...found.loops]);
  const validation = spec ? {
    all_placeholders:      spec.placeholders.map(p => p.key),
    required_placeholders: spec.placeholders.filter(p => p.required).map(p => p.key),
    found_placeholders:    Array.from(foundSet),
    missing_required:      spec.placeholders.filter(p => p.required && !foundSet.has(p.key)).map(p => p.key),
    missing_loop_fields:   spec.placeholders
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
      template_path:       templatePath,
      template_sample_path: canAutoTemplatize ? samplePath : null,
      template_name:       file.name,
      template_ext:        ext,
      template_validation: validation,
      auto_templatized:    canAutoTemplatize && autoResult?.ok === true,
    },
  };

  // Templates son compartidos org-level: propagar a todos los meerkats.
  // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  await updateOrgFeatureConfig(supabase, agent.portal_email, agent.id, configKey, {
    template_path:       templatePath,
    template_sample_path: canAutoTemplatize ? samplePath : null,
    template_name:       file.name,
    template_ext:        ext,
    template_validation: validation,
    auto_templatized:    canAutoTemplatize && autoResult?.ok === true,
  });

  const { data: signed } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(templatePath, 3600);

  // Legacy extract (RFC/dirección/etc) — sigue útil para autofill del form config
  const extracted = await extractFields(buffer, docType);

  return NextResponse.json({
    ok:            true,
    path:          templatePath,
    name:          file.name,
    ext,
    url:           signed?.signedUrl ?? null,
    extracted,
    validation,
    auto_templatized: canAutoTemplatize && autoResult?.ok === true,
    preview_pdf_url: previewPdfUrl,
    identified_fields: autoResult?.identifiedFields ?? null,
    auto_templatize_error: autoResult && !autoResult.ok ? autoResult.error : null,
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token }  = await params;
  const { doc_type: docType } = await req.json() as { doc_type: string };
  const supabase   = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ id: string; features: Record<string, unknown> | null; portal_email: string | null }>(token, 'id, features, portal_email', supabase);
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

  // DELETE: quitar los campos template_* del sub-config. Propagar a todos
  // los peers del org (templates son compartidos).
  // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
  const { template_path: _p, template_name: _n, template_ext: _e, ...restCfg } = prevCfg;
  if (agent.portal_email) {
    const { data: agents } = await supabase
      .from('voice_agents').select('id, features').eq('portal_email', agent.portal_email);
    if (agents?.length) {
      for (const a of agents) {
        const aExisting = (a.features as Record<string, unknown>) ?? {};
        const aMerged   = { ...aExisting, [configKey]: restCfg };
        await supabase.from('voice_agents').update({ features: aMerged }).eq('id', a.id);
      }
    }
  } else {
    const merged = { ...existing, [configKey]: restCfg };
    await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);
  }

  return NextResponse.json({ ok: true });
}
