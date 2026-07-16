import type { SupabaseClient } from '@supabase/supabase-js';

export async function getNextTicketFolio(agentId: string, supabase: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('helpdesk_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .gte('created_at', `${year}-01-01T00:00:00`);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  return `TKT-${year}-${seq}`;
}

// ── Shared types ───────────────────────────────────────────────────────────

export interface GuardiaTurno {
  id:          string;
  tecnico:     string;
  telefono:    string;
  dias:        string[]; // 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom'
  hora_inicio: string;   // "08:00"
  hora_fin:    string;   // "18:00"
}

export interface GuardiaArea {
  id:     string;
  nombre: string;
  turnos: GuardiaTurno[];
}

export interface GuardiaSchedule {
  areas: GuardiaArea[];
}

export interface DirectorioContacto {
  id:        string;
  nombre:    string;
  area:      string;
  extension: string;
  telefono:  string;
  atiende:   string;
}

// ── On-call resolution ────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m ?? 0);
}

function isInRange(current: number, inicio: string, fin: string): boolean {
  const s = timeToMin(inicio);
  const e = timeToMin(fin);
  return s <= e ? current >= s && current < e : current >= s || current < e;
}

export function getCurrentOnCall(area: GuardiaArea, timezone: string): GuardiaTurno | null {
  const now    = new Date();
  // 'es-MX' short weekday: 'lun.', 'mar.', etc. → strip dot
  const dayKey = now.toLocaleDateString('es-MX', { weekday: 'short', timeZone: timezone })
    .replace('.', '').toLowerCase().slice(0, 3);
  const timeStr = now.toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });
  const current = timeToMin(timeStr);

  return area.turnos.find(t => t.dias.includes(dayKey) && isInRange(current, t.hora_inicio, t.hora_fin)) ?? null;
}
