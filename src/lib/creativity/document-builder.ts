import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { createAdminClient } from '@/lib/supabase/admin';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF, ProposalPDF } from '@/lib/pdf/doc';
import { CotizacionPdf } from '@/lib/pdf/cotizacion';
import type { StructuredContent } from './content-generator';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface DocumentBuildResult {
  ok:          true;
  url:         string;
  file_id:     string;
  filename:    string;
  mime_type:   'application/pdf';
  document_id: string;
}

export interface DocumentBuildError { ok: false; error: string }

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function renderContentText(content: StructuredContent): string {
  const parts: string[] = [];
  for (const s of content.sections) {
    if (s.heading) parts.push(`## ${s.heading}`);
    if (s.body)    parts.push(s.body);
    if (s.bullets?.length) parts.push(s.bullets.map(b => `- ${b}`).join('\n'));
    parts.push('');
  }
  if (content.closing) parts.push(content.closing);
  return parts.join('\n');
}

export async function buildDocument(
  kind: 'propuesta' | 'cotizacion' | 'one_pager',
  content: StructuredContent,
  agent: { id: string; agent_name: string | null; portal_email: string },
  supabase: SupabaseClient,
): Promise<DocumentBuildResult | DocumentBuildError> {
  // Fetch agent logo/phone from voice_agents + org branding from organizations.
  // Sin el org, brand kit cae a defaults Centinelia (morado #6C3BFF, sin logo).
  const { data: agentRow } = await (supabase as any)
    .from('voice_agents')
    .select('business_name, logo_url, email_logo_url, phone_number')
    .eq('id', agent.id)
    .maybeSingle();
  const { data: orgRow } = await (supabase as any)
    .from('organizations')
    .select('logo_url, email_brand_color, brand_color_secondary, brand_website, brand_address, email_footer_text')
    .eq('portal_email', agent.portal_email)
    .maybeSingle();

  const brand = brandKitFromAgent(
    (agentRow as Record<string, unknown>) ?? { business_name: agent.agent_name ?? '' },
    orgRow as Record<string, unknown> | null,
  );

  const timestamp = Date.now();
  const filename  = `${slugify(kind)}-${slugify(content.title || 'documento')}-${timestamp}.pdf`;
  const storagePath = `${agent.id}/creativity/${filename}`;

  // Check for custom .docx template
  const { data: customTpl } = await (supabase as any)
    .from('document_templates')
    .select('storage_path, filename')
    .eq('agent_id', agent.id)
    .eq('tipo', kind)
    .maybeSingle();

  let pdfBuffer: Buffer;

  if (customTpl?.storage_path) {
    // Path A: custom .docx template via docxtemplater + CloudConvert
    const { fillDocxTemplate, convertDocxToPdf } = await import('@/lib/documents/template-fill');
    const { data: tplBlob, error: dlErr } = await (supabase as any)
      .storage.from('agent-documents').download(customTpl.storage_path);
    if (dlErr || !tplBlob) return { ok: false, error: 'No se pudo cargar la plantilla personalizada.' };
    const tplBuffer  = Buffer.from(await (tplBlob as Blob).arrayBuffer());
    const docxBuffer = fillDocxTemplate(tplBuffer, {
      title:         content.title,
      sections:      content.sections,
      closing:       content.closing ?? '',
      client_name:   '',
      business_name: brand.businessName,
      date:          new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    });
    pdfBuffer = await convertDocxToPdf(docxBuffer, agent.id, supabase);
  } else if (kind === 'cotizacion' && content.items && content.items.length > 0) {
    // Path B1: cotización con desglose de items → CotizacionPdf con tabla real
    const notesText = content.sections
      .filter(s => !/precio|costo|inversi[óo]n|total/i.test(s.heading))
      .map(s => `${s.heading}: ${s.body}`)
      .join('\n');
    const cotEl = createElement(CotizacionPdf, {
      brand,
      data: {
        clientName:  (content.title.match(/para\s+([^-–:]+)/i)?.[1] ?? '').trim() || null,
        phone:       null,
        email:       null,
        servicio:    null,
        presupuesto: null,
        notas:       (notesText.trim() || content.closing) ?? null,
        items:       content.items.map(it => ({
          descripcion:    it.descripcion,
          cantidad:       it.cantidad,
          precioUnitario: it.precio_unitario,
          unidad:         it.unidad,
        })),
        incluirIVA:  content.incluir_iva ?? false,
      },
    });
    pdfBuffer = await renderToBuffer(cotEl as any);
  } else {
    // Path B: built-in React PDF (propuesta / cotización sin items / one_pager)
    const contentText = renderContentText(content);
    const props = { title: content.title, content: contentText, brand };
    const Component = kind === 'propuesta' || kind === 'cotizacion' ? ProposalPDF : GenericDocPDF;
    pdfBuffer = await renderToBuffer(createElement(Component as any, props) as any);
  }

  // Upload to storage
  const uploadRes = await (supabase as any)
    .storage.from('agent-documents').upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert:      false,
    });
  if (uploadRes.error) {
    return { ok: false, error: `Upload falló: ${(uploadRes.error as Error).message}` };
  }

  // Signed URL (1 hora)
  const { data: signed } = await (supabase as any)
    .storage.from('agent-documents').createSignedUrl(storagePath, 3600);
  const url = (signed as { signedUrl: string } | null)?.signedUrl ?? '';

  // Insert ops_documents con TTL 30 dias
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: doc, error: insErr } = await (supabase as any)
    .from('ops_documents')
    .insert({
      agent_id:      agent.id,
      title:         content.title,
      filename,
      storage_path:  storagePath,
      template_type: kind,
      expires_at:    expiresAt,
    })
    .select('id')
    .single();

  if (insErr || !doc) {
    return { ok: false, error: `No se pudo registrar el documento: ${(insErr as Error | null)?.message ?? 'unknown'}` };
  }

  return {
    ok:          true,
    url,
    file_id:     storagePath,
    filename,
    mime_type:   'application/pdf',
    document_id: (doc as { id: string }).id,
  };
}
