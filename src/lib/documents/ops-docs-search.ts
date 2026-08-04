/**
 * Helpers para que los meerkats reutilicen documentos guardados en Oficina
 * (`ops_documents` + Supabase Storage bucket `docs`).
 *
 * Dos operaciones:
 *   - searchOfficeDocuments: lista/filtra por título / tipo / cliente / rango.
 *   - sendOfficeDocumentByEmail: adjunta uno existente a un correo saliente.
 *
 * Scope-aware: siempre limita a `agent_ids` de la misma cuenta (portal_email)
 * — un meerkat no ve/usa documentos de otras cuentas.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { agentInboxAddressFor } from '@/lib/email/inbox';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export const OPS_DOCS_BUCKET = 'agent-documents';

export interface OfficeDocSummary {
  id:            string;
  title:         string;
  filename:      string;
  kind:          string | null;         // template_type: factura / cotizacion / etc.
  created_at:    string;
  expires_at:    string | null;
  folio:         string | null;         // folio del documento cuando aplica (COT-000042)
  signed_url:    string | null;         // URL de descarga firmada (1h de vigencia). Null si falló.
}

export interface SearchArgs {
  supabase:     SupabaseClient;
  portalEmail:  string;
  query?:       string | null;         // fuzzy sobre title / filename
  kind?:        string | null;         // filtro exacto por template_type
  clientName?:  string | null;         // (deprecated — client_name no está en schema)
  limit?:       number;
  includeExpired?: boolean;
}

/** Devuelve los ops_documents que matchean el filtro, más recientes primero.
 *
 *  Schema real (verificado): id, agent_id, title, filename, storage_path,
 *  template_type, created_at, last_accessed_at, expires_at. No hay client_name
 *  ni total_amount ni size_bytes — si en el futuro se agregan columnas, extender
 *  el SELECT + interface. Búsqueda por cliente se hace via title/filename
 *  (fallback) hasta que exista client_name en el schema.
 */
export async function searchOfficeDocuments(args: SearchArgs): Promise<OfficeDocSummary[]> {
  const { supabase, portalEmail } = args;
  const limit = Math.min(args.limit ?? 15, 50);

  const { data: agents } = await supabase
    .from('voice_agents').select('id').eq('portal_email', portalEmail);
  const agentIds = (agents ?? []).map(a => a.id as string);
  if (!agentIds.length) return [];

  let q = supabase
    .from('ops_documents')
    .select('id, title, filename, storage_path, template_type, created_at, expires_at, folio')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.kind?.trim()) q = q.eq('template_type', args.kind.trim());
  if (!args.includeExpired) {
    const nowIso = new Date().toISOString();
    q = q.or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  }

  // Búsqueda fuzzy: title + filename + folio. clientName cae al mismo filtro por ahora.
  const searchTerm = (args.query ?? args.clientName ?? '').trim().replace(/[%_]/g, '');
  if (searchTerm) {
    q = q.or(`title.ilike.%${searchTerm}%,filename.ilike.%${searchTerm}%,folio.ilike.%${searchTerm}%`);
  }

  const { data, error } = await q;
  if (error) { console.error('[searchOfficeDocuments] query error:', error); return []; }

  const rows = data ?? [];
  // Generar signed URLs (1h) para cada doc en paralelo. Sin esto el LLM tiene
  // que fabricar el URL a mano y falla con "signature verification failed".
  const signedUrls = await Promise.all(rows.map(async r => {
    const path = r.storage_path as string | null;
    if (!path) return null;
    try {
      const { data: signed } = await supabase.storage.from(OPS_DOCS_BUCKET).createSignedUrl(path, 3600);
      return (signed as { signedUrl: string } | null)?.signedUrl ?? null;
    } catch (err) {
      console.error('[searchOfficeDocuments] signed URL failed for', path, err);
      return null;
    }
  }));

  return rows.map((r, i) => ({
    id:         r.id as string,
    title:      (r.title as string | null) ?? '(sin título)',
    filename:   (r.filename as string | null) ?? '',
    kind:       (r.template_type as string | null) ?? null,
    created_at: String(r.created_at),
    expires_at: (r.expires_at as string | null) ?? null,
    folio:      (r.folio as string | null) ?? null,
    signed_url: signedUrls[i],
  }));
}

/** Formatea la lista para el LLM (texto compacto por documento). */
export function formatDocsForAgent(docs: OfficeDocSummary[]): string {
  if (!docs.length) return 'No encontré documentos que coincidan.';
  return docs.map((d, i) => {
    const parts = [
      `${i + 1}. "${d.title}"${d.folio ? ` (folio ${d.folio})` : ` (id: ${d.id.slice(0, 8)}…)`}`,
      d.kind ? `tipo: ${d.kind}` : null,
      `creado: ${new Date(d.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      d.expires_at ? `vence: ${new Date(d.expires_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : null,
      d.signed_url ? `enlace de descarga (válido 1h): ${d.signed_url}` : null,
    ].filter(Boolean);
    return parts.join('\n   ');
  }).join('\n\n');
}

export interface SendArgs {
  supabase:      SupabaseClient;
  portalEmail:   string;
  agentId:       string;
  documentId:    string;               // uuid del ops_document
  to:            string;
  subject:       string;
  body:          string;
  cc?:           string | null;
}

export interface SendResult {
  ok:       boolean;
  error?:   string;
  message?: string;
}

/**
 * Adjunta un ops_document existente a un correo saliente. Descarga desde
 * Supabase Storage y usa sendEmail() con attachment inline base64.
 */
export async function sendOfficeDocumentByEmail(args: SendArgs): Promise<SendResult> {
  const { supabase, portalEmail, agentId, documentId, to, subject, body, cc } = args;

  // Scope check: el doc debe pertenecer a un agente de la misma cuenta.
  const { data: doc } = await supabase
    .from('ops_documents')
    .select('id, title, filename, storage_path, template_type, agent_id')
    .eq('id', documentId)
    .maybeSingle();
  if (!doc) return { ok: false, error: 'Documento no encontrado.' };

  const { data: sib } = await supabase
    .from('voice_agents').select('id').eq('portal_email', portalEmail);
  const accountIds = new Set((sib ?? []).map(a => a.id as string));
  if (!accountIds.has(doc.agent_id as string)) {
    return { ok: false, error: 'Documento no pertenece a esta cuenta.' };
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(OPS_DOCS_BUCKET)
    .download(doc.storage_path as string);
  if (dlErr || !blob) {
    return { ok: false, error: `No pude descargar el documento del storage: ${dlErr?.message ?? 'desconocido'}` };
  }
  const buf = Buffer.from(await blob.arrayBuffer());

  try {
    const filename = (doc.filename as string | null) ?? `${doc.title ?? 'documento'}.pdf`;
    // Resend infiere el content_type del filename; solo pasamos filename + base64.
    await sendEmail({
      to,
      subject,
      html:    body.trim().startsWith('<') ? body : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1a0a3b">${body.replace(/\n/g, '<br>')}</div>`,
      replyTo: agentInboxAddressFor(agentId),
      attachments: [{
        filename,
        content:  buf.toString('base64'),
      }],
    });
    // cc no soportado por sendEmail() hoy; si se necesita, extender la firma.
    void cc;
    return { ok: true, message: `Correo enviado a ${to} con "${doc.title}" adjunto.` };
  } catch (err) {
    return { ok: false, error: `Error enviando correo: ${err instanceof Error ? err.message : String(err)}` };
  }
}
