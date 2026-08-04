import type { createAdminClient } from '@/lib/supabase/admin';
import { generateExcel, type ExcelSheet, type ExcelBrand } from '@/lib/documents/excel';
import { brandKitFromAgent } from '@/lib/brand/kit';

type SupabaseClient = ReturnType<typeof createAdminClient>;

export interface ReportBuildResult {
  ok:          true;
  url:         string;
  file_id:     string;
  filename:    string;
  mime_type:   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  document_id: string;
  sheets:      string[];
}
export interface ReportBuildError { ok: false; error: string }

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      timeZone: 'America/Monterrey',
      day:      '2-digit',
      month:    'short',
      hour:     '2-digit',
      minute:   '2-digit',
      hour12:   false,
    });
  } catch {
    return iso;
  }
}

async function fetchOrgAgentIds(
  portalEmail: string,
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', portalEmail);
  return ((data ?? []) as { id: string }[]).map(r => r.id);
}

async function buildNoahSheets(
  orgAgentIds: string[],
  sinceISO: string,
  supabase: SupabaseClient,
): Promise<ExcelSheet[]> {
  // Leads viven en voice_calls (outcome='lead_created') — no existe tabla contact_lead.
  // Citas viven en appointments_voice con status en español ('confirmada', 'cancelada').
  const [leadsRes, apptsRes] = await Promise.all([
    supabase
      .from('voice_calls')
      .select('id, caller_number, summary, nivel_interes, duration_seconds, created_at')
      .in('agent_id', orgAgentIds)
      .eq('outcome', 'lead_created')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('appointments_voice')
      .select('id, nombre, telefono, servicio, fecha, hora, status, created_at')
      .in('agent_id', orgAgentIds)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const leadRows = (leadsRes.data ?? []) as Record<string, unknown>[];
  const apptRows = (apptsRes.data ?? []) as Record<string, unknown>[];

  const leadsSheet: ExcelSheet = {
    name:    'Leads',
    headers: ['Fecha', 'Teléfono', 'Duración (min)', 'Interés', 'Resumen'],
    rows:    leadRows.map(l => [
      fmtDate(l.created_at as string),
      (l.caller_number     as string) ?? '',
      Math.round(((l.duration_seconds as number | null) ?? 0) / 60 * 10) / 10,
      (l.nivel_interes     as string) ?? '',
      (l.summary           as string) ?? '',
    ]),
  };

  const citasSheet: ExcelSheet = {
    name:    'Citas',
    headers: ['Creada', 'Cliente', 'Teléfono', 'Servicio', 'Fecha cita', 'Hora', 'Estado'],
    rows:    apptRows.map(a => [
      fmtDate(a.created_at as string),
      (a.nombre   as string) ?? '',
      (a.telefono as string) ?? '',
      (a.servicio as string) ?? '',
      (a.fecha    as string) ?? '',
      (a.hora     as string) ?? '',
      (a.status   as string) ?? '',
    ]),
  };

  // Status en español en la DB — 'confirmada', 'cancelada'. Aceptamos ambos por si algún dato viejo usa inglés.
  const confirmed = apptRows.filter(a => {
    const s = ((a.status as string) ?? '').toLowerCase();
    return s === 'confirmada' || s === 'confirmed';
  }).length;
  const conversion = leadRows.length > 0
    ? Math.round((apptRows.length / leadRows.length) * 100)
    : 0;

  const convSheet: ExcelSheet = {
    name:    'Conversión',
    headers: ['Métrica', 'Valor'],
    rows:    [
      ['Leads capturados',      leadRows.length],
      ['Citas agendadas',       apptRows.length],
      ['Citas confirmadas',     confirmed],
      ['Tasa lead a cita (%)',  conversion],
    ],
  };

  return [leadsSheet, citasSheet, convSheet];
}

async function buildNaraSheets(
  orgAgentIds: string[],
  sinceISO: string,
  supabase: SupabaseClient,
): Promise<ExcelSheet[]> {
  const { data } = await supabase
    .from('agent_tasks')
    .select('id, title, status, assigned_to, created_at, completed_at')
    .in('assigned_to', orgAgentIds)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as Record<string, unknown>[];

  const tareasSheet: ExcelSheet = {
    name:    'Tareas',
    headers: ['Creada', 'Título', 'Asignada a', 'Estado', 'Completada'],
    rows:    rows.map(t => [
      fmtDate(t.created_at as string),
      (t.title       as string) ?? '',
      (t.assigned_to as string) ?? '',
      (t.status      as string) ?? '',
      t.completed_at ? fmtDate(t.completed_at as string) : '',
    ]),
  };

  const byStatus = new Map<string, number>();
  for (const t of rows) {
    const s = (t.status as string) ?? 'unknown';
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }

  const estatusSheet: ExcelSheet = {
    name:    'Estatus',
    headers: ['Estado', 'Cantidad'],
    rows:    Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => [s, n]),
  };

  return [tareasSheet, estatusSheet];
}

async function buildNeliaSheets(
  orgAgentIds: string[],
  sinceISO: string,
  supabase: SupabaseClient,
): Promise<ExcelSheet[]> {
  const [inboxRes, escalRes] = await Promise.all([
    supabase
      .from('ops_inbox')
      .select('id, email_from, email_subject, category, status, created_at')
      .in('agent_id', orgAgentIds)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(300),
    // human_requests puede no tener resolved_at — se incluye con fallback vacío
    supabase
      .from('human_requests')
      .select('id, title, urgency, status, created_at, resolved_at')
      .in('agent_id', orgAgentIds)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const inboxRows = (inboxRes.data ?? []) as Record<string, unknown>[];
  const escalRows = (escalRes.data ?? []) as Record<string, unknown>[];

  const ticketsSheet: ExcelSheet = {
    name:    'Tickets',
    headers: ['Recibido', 'De', 'Asunto', 'Categoría', 'Estado'],
    rows:    inboxRows.map(i => [
      fmtDate(i.created_at as string),
      (i.email_from    as string) ?? '',
      (i.email_subject as string) ?? '',
      (i.category      as string) ?? '',
      (i.status        as string) ?? '',
    ]),
  };

  const escalSheet: ExcelSheet = {
    name:    'Escalaciones',
    headers: ['Creada', 'Título', 'Urgencia', 'Estado', 'Resuelta'],
    rows:    escalRows.map(e => [
      fmtDate(e.created_at as string),
      (e.title   as string) ?? '',
      (e.urgency as string) ?? '',
      (e.status  as string) ?? '',
      e.resolved_at ? fmtDate(e.resolved_at as string) : '',
    ]),
  };

  return [ticketsSheet, escalSheet];
}

export async function buildReport(
  role: 'noah' | 'nara' | 'nelia',
  windowDays: 7 | 30,
  agent: { id: string; agentName: string | null; portalEmail: string },
  supabase: SupabaseClient,
): Promise<ReportBuildResult | ReportBuildError> {
  const orgAgentIds = await fetchOrgAgentIds(agent.portalEmail, supabase);
  if (orgAgentIds.length === 0) {
    return { ok: false, error: 'No hay agentes en tu organización para consultar.' };
  }

  const sinceISO = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  let sheets: ExcelSheet[];
  if (role === 'noah') {
    sheets = await buildNoahSheets(orgAgentIds, sinceISO, supabase);
  } else if (role === 'nara') {
    sheets = await buildNaraSheets(orgAgentIds, sinceISO, supabase);
  } else if (role === 'nelia') {
    sheets = await buildNeliaSheets(orgAgentIds, sinceISO, supabase);
  } else {
    return { ok: false, error: 'Rol no soportado para reporte.' };
  }

  // Brand kit para header + logo. organizations = source of truth para logo/colores.
  const [agentRow, orgRow] = await Promise.all([
    (supabase as any).from('voice_agents')
      .select('business_name, logo_url, email_logo_url, phone_number')
      .eq('id', agent.id).maybeSingle(),
    (supabase as any).from('organizations')
      .select('logo_url, email_brand_color, brand_color_secondary, brand_website, brand_address, email_footer_text')
      .eq('portal_email', agent.portalEmail).maybeSingle(),
  ]);
  const brandKit = brandKitFromAgent(
    (agentRow.data as Record<string, unknown>) ?? {},
    orgRow.data as Record<string, unknown> | null,
  );

  const roleLabel = role === 'noah' ? 'Comercial' : role === 'nara' ? 'Operaciones' : 'Servicio';
  const brand: ExcelBrand = {
    businessName: brandKit.businessName || 'Reporte',
    accentColor:  brandKit.color,
    title:        `Reporte ${roleLabel} · Últimos ${windowDays} días`,
  };

  const xlsxBuffer = await generateExcel(sheets, brand);

  const timestamp   = Date.now();
  const filename    = `reporte-${role}-${windowDays}d-${timestamp}.xlsx`;
  const storagePath = `${agent.id}/creativity/${filename}`;
  const mimeType    = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;

  const { error: upErr } = await supabase.storage
    .from('agent-documents')
    .upload(storagePath, xlsxBuffer, { contentType: mimeType, upsert: false });
  if (upErr) return { ok: false, error: `Upload falló: ${(upErr as { message?: string }).message ?? 'error'}` };

  const { data: signed } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(storagePath, 3600);

  const title     = `Reporte ${role} ${windowDays}d`;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: doc, error: insErr } = await supabase
    .from('ops_documents')
    .insert({
      agent_id:      agent.id,
      title,
      filename,
      storage_path:  storagePath,
      template_type: 'excel',
      expires_at:    expiresAt,
    })
    .select('id')
    .single();

  if (insErr || !doc) {
    return { ok: false, error: `No se pudo registrar el documento: ${(insErr as { message?: string } | null)?.message ?? 'unknown'}` };
  }

  return {
    ok:          true,
    url:         (signed as { signedUrl?: string } | null)?.signedUrl ?? '',
    file_id:     storagePath,
    filename,
    mime_type:   mimeType,
    document_id: (doc as { id: string }).id,
    sheets:      sheets.map(s => s.name),
  };
}
