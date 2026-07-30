// src/lib/ai/activity-window.ts
import { createAdminClient } from '@/lib/supabase/admin';

export interface ActivityCaps {
  calls:  number;
  emails: number;
  docs:   number;
  tasks:  number;
  appts:  number;
  civic:  number;
}

export interface ActivityWindow {
  calls:  Array<{ id: string; caller_name: string | null; outcome: string | null; summary: string | null; created_at: string; duration_seconds: number | null }>;
  emails: Array<{ id: string; email_from: string | null; email_subject: string | null; category: string | null; status: string | null; created_at: string }>;
  docs:   Array<{ id: string; template_type: string | null; title: string | null; created_at: string }>;
  tasks:  Array<{ id: string; title: string | null; result: string | null; status: string | null; completed_at: string | null; created_at: string }>;
  appts:  Array<{ id: string; nombre: string | null; servicio: string | null; fecha: string | null; hora: string | null; status: string | null; created_at: string }>;
  civic:  Array<{ id: string; folio: string | null; category: string | null; created_at: string }>;
}

export interface ActivityOpts {
  includeCivic?: boolean; // only true when vertical === 'gobierno'
}

export async function getAgentActivityWindow(
  agentId: string,
  sinceISO: string,
  caps: ActivityCaps,
  opts: ActivityOpts = {},
): Promise<ActivityWindow> {
  const supabase = createAdminClient();

  const [callsRes, emailsRes, docsRes, tasksRes, apptsRes, civicRes] = await Promise.all([
    supabase.from('voice_calls')
      .select('id, caller_name, outcome, summary, created_at, duration_seconds')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.calls),
    supabase.from('ops_inbox')
      .select('id, email_from, email_subject, category, status, created_at')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.emails),
    supabase.from('ops_documents')
      .select('id, template_type, title, created_at')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.docs),
    supabase.from('agent_tasks')
      .select('id, title, result, status, completed_at, created_at')
      .eq('assigned_to', agentId)
      .eq('status', 'completed')
      .gte('completed_at', sinceISO)
      .order('completed_at', { ascending: false })
      .limit(caps.tasks),
    supabase.from('appointments_voice')
      .select('id, nombre, servicio, fecha, hora, status, created_at')
      .eq('agent_id', agentId)
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(caps.appts),
    opts.includeCivic
      ? supabase.from('civic_reports')
          .select('id, folio, category, created_at')
          .eq('agent_id', agentId)
          .gte('created_at', sinceISO)
          .order('created_at', { ascending: false })
          .limit(caps.civic)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  // I1: surface PostgREST errors so schema bugs don't silently return empty arrays
  const queryResults = { calls: callsRes, emails: emailsRes, docs: docsRes, tasks: tasksRes, appts: apptsRes, civic: civicRes };
  for (const [key, res] of Object.entries(queryResults)) {
    if ((res as any).error) {
      console.error(`[activity-window] ${key} query failed:`, (res as any).error?.message ?? res);
    }
  }

  return {
    calls:  (callsRes.data  ?? []) as any,
    emails: (emailsRes.data ?? []) as any,
    docs:   (docsRes.data   ?? []) as any,
    tasks:  (tasksRes.data  ?? []) as any,
    appts:  (apptsRes.data  ?? []) as any,
    civic:  (civicRes.data  ?? []) as any,
  };
}

// Helper to render window as prompt-friendly Spanish blocks, skipping empty sections
export function renderActivityBlocks(w: ActivityWindow, tz: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: tz, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const blocks: string[] = [];

  if (w.calls.length) {
    blocks.push(`LLAMADAS (${w.calls.length}):\n${w.calls.map(c => `- [${fmt(c.created_at)}] ${c.caller_name ?? 'Llamante'}: outcome=${c.outcome ?? '?'}, resumen=${c.summary?.slice(0, 200) ?? 'sin resumen'}`).join('\n')}`);
  }
  if (w.emails.length) {
    blocks.push(`CORREOS (${w.emails.length}):\n${w.emails.map(e => `- [${fmt(e.created_at)}] ${e.email_from ?? 'remitente'}: asunto=${e.email_subject?.slice(0, 100) ?? '(sin asunto)'}, estado=${e.status ?? '?'}`).join('\n')}`);
  }
  if (w.docs.length) {
    blocks.push(`DOCUMENTOS (${w.docs.length}):\n${w.docs.map(d => `- [${fmt(d.created_at)}] ${d.template_type ?? 'doc'}: ${d.title ?? 'sin título'}`).join('\n')}`);
  }
  if (w.tasks.length) {
    blocks.push(`TAREAS COMPLETADAS (${w.tasks.length}):\n${w.tasks.map(t => `- [${fmt(t.completed_at ?? t.created_at)}] ${t.title ?? 'tarea'}: resultado=${t.result?.slice(0, 100) ?? '?'}`).join('\n')}`);
  }
  if (w.appts.length) {
    blocks.push(`CITAS (${w.appts.length}):\n${w.appts.map(a => `- [${fmt(a.created_at)}] ${a.nombre ?? 'contacto'}: ${a.servicio ?? 'sin servicio'}, ${[a.fecha, a.hora].filter(Boolean).join(' ') || 'sin fecha'}`).join('\n')}`);
  }
  if (w.civic.length) {
    blocks.push(`FOLIOS (${w.civic.length}):\n${w.civic.map(c => `- [${fmt(c.created_at)}] ${c.folio ?? 'sin folio'}: categoría ${c.category ?? 'sin categoría'}`).join('\n')}`);
  }

  return blocks.length ? blocks.join('\n\n') : 'Sin actividad registrada en este período.';
}
