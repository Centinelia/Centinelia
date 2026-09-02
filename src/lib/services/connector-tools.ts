import type { createAdminClient } from '@/lib/supabase/admin';
import { type IntegrationRow, type Attachment } from '@/lib/connectors';
import { getFileConnector, NO_DRIVE_ERROR } from '@/lib/email/agent-connector';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { SUPPORT_EMAIL, SUPPORT_WA } from '@/lib/constants';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface ToolResult {
  ok:       boolean;
  message?: string;
  error?:   string;
  /** For executeSendEmail: número de envíos SMTP/Resend reales que ocurrieron (1 sin CC, 2 con CC). Otras tools lo dejan undefined. */
  count?:   number;
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


// Detecta si un correo menciona Google Meet pero omite o falsifica el link.
// Bloquea el envío para forzar al modelo a incluir el meet_link real que
// devolvió create_calendar_event. Sin este guardrail server-side el modelo
// sigue diciendo "te llegará por separado" o pega URL base sin código.
function detectInvalidMeetReference(body: string): { invalid: boolean; reason?: string } {
  const mentionsMeet = /\b(google\s*meet|meet\.google\.com)\b/i.test(body);
  if (!mentionsMeet) return { invalid: false };
  // URL válida de Meet: meet.google.com/aaa-aaaa-aaa (código real).
  const validMeetRe = /https?:\/\/meet\.google\.com\/[a-z0-9]{3,5}-[a-z0-9]{3,5}-[a-z0-9]{3,5}/i;
  if (validMeetRe.test(body)) return { invalid: false };
  // Aceptamos también el phrasing alternativo: "abre la invitación de Google
  // Calendar y usa el botón Unirse con Meet". En cuentas @gmail.com personales
  // el link crudo del Meet muestra "verifica el código" para invitados externos
  // hasta que el host materializa la sala desde Calendar. La ruta segura para
  // el invitado es abrir el email de invitación que envía Google Calendar (con
  // sendUpdates=all) y hacer click en el botón "Unirse con Google Meet" ahí.
  const validAltPhrasing = /(invitaci[oó]n (?:de|del) (?:google )?calendar|bot[oó]n .{0,20}unirse|abre .{0,50}calendar|(revisa|abre) tu (invitaci[oó]n|calendario))/i.test(body);
  if (validAltPhrasing) return { invalid: false };
  const hasBaseUrl = /meet\.google\.com\/?(?![a-z0-9])/i.test(body);
  if (hasBaseUrl) {
    return {
      invalid: true,
      reason: 'El body incluye "meet.google.com" pero sin código de reunión. Dos opciones válidas: (A) pega el meet_link COMPLETO que devolvió create_calendar_event, ej: "Link: https://meet.google.com/abc-defg-hij"; o (B) usa la ruta segura para invitados: "Recibirás una invitación de Google Calendar por correo — ábrela y usa el botón Unirse con Google Meet". No dejes la URL base sola.',
    };
  }
  return {
    invalid: true,
    reason: 'El body menciona Google Meet pero no incluye ni la URL completa ni la referencia a la invitación de Calendar. Dos opciones válidas: (A) pega el meet_link literal que devolvió create_calendar_event; o (B) escribe: "Recibirás una invitación de Google Calendar — ábrela y usa el botón Unirse con Google Meet ahí".',
  };
}

export async function executeSendEmail(
  input:    SendEmailInput,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const { agentId, to, subject, body, businessName, cc, replyTo, attFileId, attFileName, attMimeType } = input;

  // Guardrail server-side: correos que prometen Meet pero omiten link real
  // se rechazan y devuelven error al modelo para forzar retry con el URL
  // completo. Sin esto el modelo sigue escribiendo "te llegará por separado".
  const meetCheck = detectInvalidMeetReference(body);
  if (meetCheck.invalid) {
    return { ok: false, error: `enviar_correo_invalid_meet_link: ${meetCheck.reason}` };
  }

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

  // Resolvemos el connector una sola vez para (a) descargar el adjunto si el
  // meerkat tiene Gmail/Outlook conectado y (b) pasarlo a sendMeerkatHtmlEmail
  // sin re-query.
  const ic = await getFileConnector(agentId, supabase);
  if (ic && attFileId) {
    const dl = await ic.conn.files.download(attFileId, attMimeType ?? '');
    if (dl) attachment = { filename: attFileName ?? 'adjunto', content: dl.buffer, mimeType: dl.contentType };
  }

  // From header para el fallback Resend cuando no hay OAuth: businessName +
  // send_as_email si existe (dominio del cliente), si no notificaciones@centinelia.mx.
  // sendMeerkatHtmlEmail lo ignora si el path OAuth funciona.
  const sendFrom = ic ? ((ic.integration as unknown as Record<string, unknown>).send_as_email as string | null | undefined) ?? undefined : undefined;
  const fromAddr = sendFrom ?? 'notificaciones@centinelia.mx';
  const fromHeader = `${businessName} <${fromAddr}>`;

  const mainRes = await sendMeerkatHtmlEmail({
    agentId, to, subject, html: htmlBody, from: fromHeader,
    replyTo, attachment,
  }, supabase, ic);
  let sent = mainRes.ok;
  // Track cuántos envíos reales ocurrieron. sendMeerkatHtmlEmail hace 1 send SMTP/Resend.
  // Con CC hacemos 2 sends totales — el caller cobra 2 tareas al pool.
  let sendCount = sent ? 1 : 0;

  // CC en segundo envío separado (mismo comportamiento que antes).
  if (sent && cc) {
    const ccRes = await sendMeerkatHtmlEmail({
      agentId, to: cc, subject, html: htmlBody, from: fromHeader, replyTo,
    }, supabase, ic);
    sent = ccRes.ok;
    if (ccRes.ok) sendCount += 1;
  }

  const attNote = attachment ? ` con adjunto "${attachment.filename}"` : '';

  // El log a outbound_emails ahora vive dentro de sendMeerkatHtmlEmail para
  // que TODO envío (incluidos los que salen de tools operativas directas como
  // registrar_incidencia / bitacora-weekly) quede registrado. En el path CC
  // sendMeerkatHtmlEmail ya se llamó 2 veces arriba, generando 2 filas —
  // cc_email queda null en ambas porque cada envío es lógicamente independiente.

  return sent
    ? { ok: true,  count: sendCount, message: `Correo enviado a ${to}${cc ? ` (CC: ${cc})` : ''}${attNote} con asunto "${subject}".` }
    : { ok: false, count: sendCount, error:   'Error al enviar el correo. Verifica la dirección e intenta de nuevo.' };
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
  // Si el modelo pidió Meet explícito pero el connector NO devolvió link, la
  // creación de la conferencia falló. Devolvemos error para que el meerkat
  // NO envíe correos prometiendo Meet inexistente. Retry: intentar de nuevo
  // sin generate_meet_link (evento ya creado) o pedir Meet fuera de banda.
  if (input.generate_meet_link === true && !event.meet_link) {
    return {
      ok: false,
      event,
      error: `create_calendar_event_meet_failed: El evento "${event.title}" se creó en ${provider} para el ${start}, PERO Google no pudo generar el link de Meet (status pending/failure tras reintentos). NO envíes correos prometiendo Meet. Opciones: (1) informa al usuario que agende el Meet manualmente desde el calendario, (2) elimina el evento con delete_calendar_event event_id="${event.id}" y reintenta, (3) crea el evento sin generate_meet_link y pide a un humano crear la sala.`,
    };
  }
  // Cuando hay meet_link Y attendees, Google envió email de invitación al
  // attendee (sendUpdates=all). En cuentas @gmail.com personales el link
  // crudo del Meet puede mostrar "verifica el código" si el invitado abre
  // antes que el host materialice la sala; el botón "Unirse con Meet" en el
  // email de Calendar SÍ funciona. Guiamos al meerkat a la ruta segura:
  // incluir AMBOS (link crudo por si tiene Workspace + phrasing alterno).
  const meetGuidance = event.meet_link
    ? ` Link Meet: ${event.meet_link} — IMPORTANTE al redactar correos: incluye este link Y agrega también "Recibirás una invitación de Google Calendar por correo, ábrela y usa el botón 'Unirse con Google Meet' si el link no abre directo". Google ya envió el invite al attendee automáticamente.`
    : '';
  return { ok: true, event, message: `Evento "${event.title}" creado en ${provider} para el ${start}.${meetGuidance}` };
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
