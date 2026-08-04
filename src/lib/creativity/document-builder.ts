import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { createAdminClient } from '@/lib/supabase/admin';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF, ProposalPDF } from '@/lib/pdf/doc';
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
  // brandKitFromAgent takes (agentObject, orgObject?) — build from agent param.
  // Org branding (colors, footer) is best-effort: try to fetch from organizations,
  // but fall back gracefully if the chain isn't available (e.g. in tests).
  const agentObj: Record<string, unknown> = {
    business_name: agent.agent_name ?? '',
    logo_url:      null,
    phone_number:  null,
  };

  const brand = brandKitFromAgent(agentObj, null);

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
  } else {
    // Path B: built-in React PDF
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
