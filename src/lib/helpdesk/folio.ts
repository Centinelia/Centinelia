import type { SupabaseClient } from '@supabase/supabase-js';

export async function getNextTicketFolio(_agentId: string, supabase: SupabaseClient): Promise<string> {
  // El constraint UNIQUE de folio es GLOBAL (no per-agente), así que contamos
  // TODOS los tickets del año — no solo los del agente actual. Antes había
  // .eq('agent_id', agentId) → 2 agentes distintos generaban el mismo folio
  // y el INSERT rompía con duplicate key.
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('helpdesk_tickets')
    .select('id', { count: 'exact', head: true })
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
  alias?: string; // Opcional. Solo aplica cuando nombre='otro' — permite al usuario dar un nombre descriptivo (ej: "Impresoras").
  turnos: GuardiaTurno[];
}

export interface GuardiaSchedule {
  areas: GuardiaArea[];
}

// Persona unificada del directorio de la organización. Un solo registro
// puede ser dueño, miembro del equipo, y/o especialista consultable por Neo
// para tickets del helpdesk. Vive en organizations.directory.
export interface DirectoryPerson {
  id:                  string;
  name:                string;
  phone:               string;
  email?:              string;         // correo — usado por pack ciclo_oc_cfdi para escalar OCs
  extension?:          string;
  department?:         string;         // ej: "Sistemas", "RRHH"
  role?:               string;         // ej: "Coordinador de red"
  is_owner?:           boolean;        // dueño de la cuenta (bypass 24/7)
  is_team?:            boolean;        // miembro del equipo interno (identificación de llamadas)
  helpdesk_expertise?: string;         // palabras clave para búsqueda en Neo (ej: "vpn, wifi, switches")
  on_call?:            boolean;        // aparece como candidato en horario de guardia

  // Roles del pack ciclo_oc_cfdi (una persona puede tener varios flags true).
  // Meerkats (Nala/Nox) usan estos flags para saber a quién escalar cada paso
  // del ciclo OC-CFDI por correo. Ver [[project-ciclo-oc-cfdi-pack]].
  is_oc_autorizador?:  boolean;        // recibe OCs que no pasan autofirma
  is_oc_pagos?:        boolean;        // recibe OCs firmadas para hacer transferencia bancaria
}

/** @deprecated usar DirectoryPerson (organizations.directory) */
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
