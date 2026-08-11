import type { createAdminClient } from '@/lib/supabase/admin';
import { getConnector, type IntegrationRow, type Attachment } from '@/lib/connectors';
import { sendEmail } from '@/lib/email/send';
import { SUPPORT_EMAIL, SUPPORT_WA } from '@/lib/constants';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface ToolResult {
  ok:       boolean;
  message?: string;
  error?:   string;
  [key: string]: unknown;
}

export interface SendEmailInput {
  agentId:      string;
  to:           string;
  subject:      string;
  body:         string;
  businessName: string;
  cc?:          string;
  replyTo?:     string;
  attFileId?:   string;
  attFileName?: string;
  attMimeType?: string;
}

export interface OrganizeFilesInput {
  action:       string;
  folderId?:    string;
  fileId?:      string;
  destination?: string;
  newName?:     string;
  folderName?:  string;
}

const NO_DRIVE_ERROR = `No tienes Google Drive ni OneDrive conectado. Conéctalo desde el portal en Integraciones → Correo. Si necesitas ayuda para configurar la integración, contacta a Centinelia: ${SUPPORT_EMAIL} o WhatsApp ${SUPPORT_WA}.`;

async function getFileConnector(agentId: string, supabase: SupabaseClient) {
  // 1. Legacy path — email_integrations per-agent
  const { data } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agentId)
    .single();
  if (data) {
    const conn = await getConnector(data as IntegrationRow, supabase);
    return { integration: data as IntegrationRow, conn };
  }

  // 2. Fallback org-level — cualquier agente hereda el email conectado por su portal
  const { data: agentRow } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agentId)
    .single();
  const portalEmail = agentRow?.portal_email as string | null | undefined;
  if (!portalEmail) return null;

  const { data: orgAcct } = await supabase
    .from('integration_accounts')
    .select('provider, account_label, access_token, refresh_token, expires_at, status')
    .eq('portal_email', portalEmail)
    .eq('capability', 'email')
    .neq('status', 'disconnected')
    .maybeSingle();
  if (!orgAcct) return null;

  // Adapta shape de integration_accounts a IntegrationRow para reusar getConnector.
  // El refresh path escribe a email_integrations por id — este synthetic row no
  // tiene id real, así que si el token expira aquí, el refresh graba en un lugar
  // que nadie relee. Aceptable temporalmente; TODO migrar refresh a leer/escribir
  // integration_accounts cuando venga de esta rama.
  const synthetic: IntegrationRow = {
    id:                 `org:${portalEmail}:${orgAcct.provider}` as string,
    agent_id:           agentId,
    provider:           orgAcct.provider as 'gmail' | 'outlook',
    email:              (orgAcct.account_label as string | null) ?? '',
    access_token:       (orgAcct.access_token as string | null) ?? '',
    refresh_token:      (orgAcct.refresh_token as string | null) ?? null,
    token_expires_at:   (orgAcct.expires_at as string | null) ?? null,
    last_sync_at:       null,
    needs_reauth:       orgAcct.status === 'needs_reauth',
    reauth_notified_at: null,
  };
  const conn = await getConnector(synthetic, supabase);
  return { integration: synthetic, conn };
}

export async function executeSendEmail(
  input:    SendEmailInput,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const { agentId, to, subject, body, businessName, cc, replyTo, attFileId, attFileName, attMimeType } = input;

  // Convertir markdown básico a HTML — meerkats escriben con **bold**, *italic*,
  // [text](url) natural y sin conversión los caracteres salen literal en el
  // correo (bug UX 2026-08-10: Niva mandó "**Detalles de la reunión:**" y el
  // destinatario vio los asteriscos crudos). Orden: escape HTML → links →
  // bold → italic → auto-link URLs sueltas.
  const escapeHtml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const mdToHtml = (s: string) => {
    let out = escapeHtml(s);
    // [text](url) — enlaces explícitos
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" style="color:#1a73e8;text-decoration:underline">$1</a>');
    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic* (evita conflicto con **bold** — ya fueron reemplazados)
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // Auto-link URLs sueltas (no dentro de <a> ya)
    out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" style="color:#1a73e8;text-decoration:underline">$2</a>');
    return out;
  };

  const htmlBody = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
    ${body.split('\n').map(p => p.trim() ? `<p style="margin:0 0 12px">${mdToHtml(p)}</p>` : '<br>').join('')}
    <p style="color:#666;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">— ${escapeHtml(businessName)}</p>
  </body></html>`;

  let attachment: Attachment | undefined;
  let sent = false;

  const ic = await getFileConnector(agentId, supabase);
  const sendFrom = ic ? ((ic.integration as unknown as Record<string, unknown>).send_as_email as string | null | undefined) ?? undefined : undefined;

  if (ic) {
    if (attFileId) {
      const dl = await ic.conn.files.download(attFileId, attMimeType ?? '');
      if (dl) attachment = { filename: attFileName ?? 'adjunto', content: dl.buffer, mimeType: dl.contentType };
    }
    try {
      await ic.conn.email.send(to, subject, body, attachment, sendFrom);
      if (cc) await ic.conn.email.send(cc, subject, body, undefined, sendFrom);
      sent = true;
    } catch { /* fall through to Resend */ }
  }

  if (!sent) {
    const resendAtts = attachment
      ? [{ filename: attachment.filename, content: attachment.content.toString('base64') }]
      : undefined;
    const fromAddr = sendFrom ? sendFrom : `notificaciones@centinelia.mx`;
    const fromHeader = `${businessName} <${fromAddr}>`;
    const ok = await sendEmail({ to, subject, html: htmlBody, from: fromHeader, replyTo, attachments: resendAtts });
    if (ok && cc) await sendEmail({ to: cc, subject, html: htmlBody, from: fromHeader, replyTo });
    sent = ok;
  }

  const attNote = attachment ? ` con adjunto "${attachment.filename}"` : '';

  // Log a outbound_emails para que otros meerkats puedan buscar en histórico
  // vía buscar_correo_enviado y para el UI Bandeja tab Enviados. Fire-and-forget:
  // no bloquea el response ni propaga error si la escritura falla.
  void (async () => {
    try {
      const { data: agentRow } = await supabase
        .from('voice_agents')
        .select('portal_email')
        .eq('id', agentId)
        .maybeSingle();
      const portalEmail = (agentRow?.portal_email as string | null) ?? null;
      if (!portalEmail) return;
      await supabase.from('outbound_emails').insert({
        agent_id:        agentId,
        portal_email:    portalEmail,
        to_email:        to,
        cc_email:        cc ?? null,
        reply_to:        replyTo ?? null,
        subject,
        body,
        attachment_name: attachment?.filename ?? null,
        provider:        ic ? (ic.integration.provider === 'outlook' ? 'outlook' : 'gmail') : 'resend',
        ok:              sent,
        error:           sent ? null : 'Error al enviar el correo (fallback también falló).',
      });
    } catch { /* best-effort */ }
  })();

  return sent
    ? { ok: true,  message: `Correo enviado a ${to}${cc ? ` (CC: ${cc})` : ''}${attNote} con asunto "${subject}".` }
    : { ok: false, error:   'Error al enviar el correo. Verifica la dirección e intenta de nuevo.' };
}

export async function executeSaveToDrive(
  agentId:     string,
  storagePath: string,
  filename:    string,
  folderName:  string | undefined,
  supabase:    SupabaseClient,
): Promise<ToolResult> {
  const ic = await getFileConnector(agentId, supabase);
  if (!ic) return { ok: false, error: NO_DRIVE_ERROR };

  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from('agent-documents')
    .download(storagePath);

  if (dlErr || !fileBlob)
    return { ok: false, error: 'No se pudo descargar el documento desde almacenamiento. Verifica que fue generado correctamente.' };

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  try {
    const result = await ic.conn.files.upload(filename, buffer, 'application/pdf', folderName);
    if (!result)
      return { ok: false, error: 'Permisos insuficientes en Drive. El dueño debe reconectar su correo desde Integraciones → Correo para otorgar permisos de escritura.' };
    const provider = ic.integration.provider === 'gmail' ? 'Google Drive' : 'OneDrive';
    return { ok: true, id: result.id, name: result.name, link: result.link, message: `Documento "${result.name}" guardado en ${provider}${folderName ? ` (carpeta: ${folderName})` : ''}. Ver: ${result.link}` };
  } catch (err) {
    return { ok: false, error: `Error al subir a Drive: ${String(err)}` };
  }
}

export async function executeOrganizeFiles(
  agentId:  string,
  input:    OrganizeFilesInput,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const ic = await getFileConnector(agentId, supabase);
  if (!ic) return { ok: false, error: NO_DRIVE_ERROR };

  const { conn } = ic;
  const { action, folderId, fileId, destination, newName, folderName } = input;

  try {
    if (action === 'list') {
      const items = await conn.files.list(folderId);
      if (!items.length) return { ok: true, items: [], message: 'La carpeta está vacía.' };
      const lines = items.map(f =>
        `- ${f.isFolder ? '[carpeta]' : '[archivo]'} ${f.name} (id: ${f.id}${f.isFolder ? '' : `, tipo: ${f.mimeType}`})`
      ).join('\n');
      return { ok: true, items, message: `Encontré ${items.length} elemento(s):\n${lines}` };

    } else if (action === 'move') {
      if (!fileId || !destination) return { ok: false, error: 'Se requieren file_id y destination para mover.' };
      const ok = await conn.files.move(fileId, destination);
      return ok
        ? { ok: true,  message: `Archivo movido a la carpeta "${destination}" correctamente.` }
        : { ok: false, error:   'No se pudo mover el archivo. Verifica que el ID sea correcto y que tengas permisos.' };

    } else if (action === 'rename') {
      if (!fileId || !newName) return { ok: false, error: 'Se requieren file_id y new_name para renombrar.' };
      const ok = await conn.files.rename(fileId, newName);
      return ok
        ? { ok: true,  message: `Elemento renombrado a "${newName}" correctamente.` }
        : { ok: false, error:   'No se pudo renombrar. Verifica que el ID sea correcto y que tengas permisos.' };

    } else if (action === 'create_folder') {
      if (!folderName) return { ok: false, error: 'Se requiere folder_name para crear una carpeta.' };
      const result = await conn.files.createFolder(folderName);
      return result
        ? { ok: true, id: result.id, name: result.name, message: `Carpeta "${result.name}" creada correctamente.` }
        : { ok: false, error: 'No se pudo crear la carpeta.' };

    } else {
      return { ok: false, error: `Acción desconocida: ${action}` };
    }
  } catch (err) {
    return { ok: false, error: `Error al organizar archivos: ${String(err)}` };
  }
}

export async function executeSearchFiles(
  agentId:  string,
  query:    string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const ic = await getFileConnector(agentId, supabase);
  if (!ic) return { ok: false, error: NO_DRIVE_ERROR };

  // Estrategia progresiva — la transcripción de Deepgram puede corromper nombres
  // propios (Pneuma → Number, Centinelia → Ventanilla). Si la búsqueda inicial
  // falla, probamos con cada palabra individual >3 chars y también los pares
  // consecutivos. Devolvemos el primer conjunto no vacío.
  let files = await ic.conn.files.search(query);
  const attempts: string[] = [query];

  if (files.length === 0) {
    const words = query.split(/\s+/).filter(w => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()));
    // 1. cada palabra sola (más largas primero, más específicas)
    const singles = [...new Set(words)].sort((a, b) => b.length - a.length);
    for (const w of singles) {
      attempts.push(w);
      files = await ic.conn.files.search(w);
      if (files.length) break;
    }
  }

  if (files.length === 0) {
    return { ok: true, files: [], message: `No encontré archivos. Probé con: ${attempts.join(', ')}. Si el archivo tiene un nombre distinto al que buscaste, pide al usuario el nombre exacto o palabras clave diferentes.` };
  }

  return { ok: true, files, message: `Encontré ${files.length} archivo(s) con "${attempts[attempts.length-1]}": ${files.map(f => `${f.name} (id: ${f.id}, tipo: ${f.mimeType})`).join(', ')}` };
}

const STOPWORDS = new Set([
  'el','la','los','las','un','una','unos','unas','de','del','al','a','en','y','o','u','que','con','por','para','sin',
  'este','esta','ese','esa','aquel','aquella','esos','esas','mi','tu','su','sus','nos','les','se','lo',
  'como','pero','ya','muy','más','menos','solo','sólo','tan','todo','toda','todos','todas',
]);

export async function executeReadFile(
  agentId:  string,
  fileId:   string,
  fileName: string,
  mimeType: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  if (!fileId || fileId.length > 500 || /[<>"'`\\]/.test(fileId))
    return { ok: false, error: 'ID de archivo inválido.' };

  const ic = await getFileConnector(agentId, supabase);
  if (!ic) return { ok: false, error: NO_DRIVE_ERROR };

  const content = await ic.conn.files.read(fileId, mimeType);
  const preview = content.slice(0, 8000);
  return content
    ? { ok: true, file_name: fileName, content: preview, truncated: content.length > 8000 }
    : { ok: false, error: `No se pudo leer el archivo "${fileName}". Verifica que sea un documento de texto.` };
}

const NO_CALENDAR_ERROR = `No tienes Google Calendar ni Outlook Calendar conectado. Conéctalo desde el portal en Integraciones → Correo. Si necesitas ayuda, contacta a Centinelia: ${SUPPORT_EMAIL} o WhatsApp ${SUPPORT_WA}.`;

export async function executeListCalendarEvents(
  agentId:  string,
  from:     Date,
  to:       Date,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const ic = await getFileConnector(agentId, supabase);
  if (!ic?.conn.calendar) return { ok: false, error: NO_CALENDAR_ERROR };

  const events = await ic.conn.calendar.listEvents(from, to);
  if (!events.length) return { ok: true, events: [], message: 'No hay eventos en ese rango de fechas.' };

  const lines = events.map(e => {
    const start = new Date(e.start).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
    const end   = new Date(e.end).toLocaleString('es-MX', { timeStyle: 'short' });
    const atts  = e.attendees.length ? ` | Invitados: ${e.attendees.join(', ')}` : '';
    const loc   = e.location ? ` | ${e.location}` : '';
    return `- [${e.id}] ${e.title} — ${start} a ${end}${loc}${atts}`;
  }).join('\n');

  return { ok: true, events, message: `${events.length} evento(s) encontrado(s):\n${lines}` };
}

export async function executeCreateCalendarEvent(
  agentId: string,
  input:   { title: string; start: string; end: string; description?: string; location?: string; attendees?: string[]; generate_meet_link?: boolean },
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const ic = await getFileConnector(agentId, supabase);
  if (!ic?.conn.calendar) return { ok: false, error: NO_CALENDAR_ERROR };

  const event = await ic.conn.calendar.createEvent(input);
  if (!event) return { ok: false, error: 'No se pudo crear el evento. Verifica los permisos de calendario.' };

  const start = new Date(event.start).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' });
  const provider = ic.integration.provider === 'gmail' ? 'Google Calendar' : 'Outlook Calendar';
  const meetLine = event.meet_link ? ` Link Meet: ${event.meet_link}` : '';
  return { ok: true, event, message: `Evento "${event.title}" creado en ${provider} para el ${start}.${meetLine}` };
}

export async function executeDeleteCalendarEvent(
  agentId:  string,
  eventId:  string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const ic = await getFileConnector(agentId, supabase);
  if (!ic?.conn.calendar) return { ok: false, error: NO_CALENDAR_ERROR };

  const ok = await ic.conn.calendar.deleteEvent(eventId);
  return ok
    ? { ok: true,  message: 'Evento eliminado del calendario.' }
    : { ok: false, error:   'No se pudo eliminar el evento. Verifica que el ID sea correcto.' };
}
