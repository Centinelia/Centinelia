/**
 * Detectores de anomalías de consumo de ops/correos — complemento a
 * pool-provisioning-drift (que solo detecta "ya se quemó todo").
 *
 * Historia: 2026-10-07 caso AC Proyectos — Nami quemó ~455 ops en 48h en
 * loop recursivo de self-notifications. Nash detectó solo cuando balance
 * cruzó cero, 7 días tarde. Estos 3 detectores anticipan el patrón:
 *   1. detectHighVelocityConsumption — orgs quemando ops mucho más rápido
 *      que su promedio histórico (señal de leak o cambio de patrón)
 *   2. detectRepeatedSender — un mismo remitente apareciendo cientos de
 *      veces/día en una org (señal de newsletter runaway o self-loop)
 *   3. detectRecursivePrefixes — subjects con 3+ niveles de prefijos
 *      bracketed (`[Factura] [Factura] [Factura] ...`), firma inequívoca
 *      del loop de notificaciones del propio sistema
 *
 * Ver [[feedback-sistema-no-escribe-a-inbox-meerkat]].
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const VELOCITY_WINDOW_HOURS      = 24;
export const VELOCITY_MIN_ABSOLUTE_OPS   = 100;   // debajo de esto no hacemos ruido
export const VELOCITY_SPIKE_MULTIPLIER   = 5;     // 5× del promedio histórico
export const VELOCITY_BASELINE_DAYS      = 14;    // promedio sobre 2 semanas

export const REPEATED_SENDER_WINDOW_HOURS = 24;
export const REPEATED_SENDER_WARN         = 30;   // 30+/día ya es anómalo
export const REPEATED_SENDER_CRITICAL     = 100;

export const RECURSIVE_PREFIX_WINDOW_HOURS = 24;
export const RECURSIVE_PREFIX_RX = /^(\s*\[[A-Za-zñÑáéíóú ]+\]\s*){3,}/;

export interface VelocityAnomaly {
  portal_email: string;
  ops_24h:      number;
  baseline_avg: number;
  multiplier:   number;
}

export interface RepeatedSenderAnomaly {
  portal_email: string;
  sender:       string;
  count:        number;
  level:        'warn' | 'critical';
}

export interface RecursivePrefixAnomaly {
  portal_email:  string;
  count:         number;
  deepest_level: number;
  sample_subject: string;
}

export async function detectHighVelocityConsumption(sb: SupabaseClient): Promise<VelocityAnomaly[]> {
  const since24h    = new Date(Date.now() - VELOCITY_WINDOW_HOURS * 3600 * 1000).toISOString();
  const sinceBase   = new Date(Date.now() - VELOCITY_BASELINE_DAYS * 24 * 3600 * 1000).toISOString();

  // 24h window — current rate
  const { data: recent } = await sb
    .from('ops_ledger')
    .select('portal_email, amount')
    .eq('kind', 'consumption')
    .gte('created_at', since24h);
  const current = new Map<string, number>();
  for (const r of recent ?? []) {
    const e = (r as Record<string, unknown>).portal_email as string;
    const v = Math.abs(Number((r as Record<string, unknown>).amount));
    current.set(e, (current.get(e) ?? 0) + v);
  }

  // Baseline — last 14 days, excluding the 24h window
  const { data: base } = await sb
    .from('ops_ledger')
    .select('portal_email, amount, created_at')
    .eq('kind', 'consumption')
    .gte('created_at', sinceBase)
    .lt('created_at', since24h);
  const baselineTotals = new Map<string, number>();
  for (const r of base ?? []) {
    const e = (r as Record<string, unknown>).portal_email as string;
    const v = Math.abs(Number((r as Record<string, unknown>).amount));
    baselineTotals.set(e, (baselineTotals.get(e) ?? 0) + v);
  }
  const baselineDays = Math.max(1, VELOCITY_BASELINE_DAYS - (VELOCITY_WINDOW_HOURS / 24));

  const out: VelocityAnomaly[] = [];
  for (const [email, ops24h] of current) {
    if (ops24h < VELOCITY_MIN_ABSOLUTE_OPS) continue;
    const baselineAvg = (baselineTotals.get(email) ?? 0) / baselineDays;
    // Si no hay baseline (org nueva), aplica solo el umbral absoluto
    const multiplier = baselineAvg > 0 ? ops24h / baselineAvg : Infinity;
    if (baselineAvg === 0 && ops24h >= VELOCITY_MIN_ABSOLUTE_OPS * 2) {
      out.push({ portal_email: email, ops_24h: ops24h, baseline_avg: 0, multiplier: Infinity });
    } else if (multiplier >= VELOCITY_SPIKE_MULTIPLIER) {
      out.push({ portal_email: email, ops_24h: ops24h, baseline_avg: Math.round(baselineAvg * 10) / 10, multiplier: Math.round(multiplier * 10) / 10 });
    }
  }
  return out.sort((a, b) => b.ops_24h - a.ops_24h);
}

export async function detectRepeatedSender(sb: SupabaseClient): Promise<RepeatedSenderAnomaly[]> {
  const since = new Date(Date.now() - REPEATED_SENDER_WINDOW_HOURS * 3600 * 1000).toISOString();

  // Resolver portal_email por agent_id (ops_inbox no tiene portal_email directo)
  const { data: agentMap } = await sb
    .from('voice_agents')
    .select('id, portal_email')
    .not('portal_email', 'is', null);
  const agentToEmail = new Map<string, string>();
  for (const a of agentMap ?? []) {
    const row = a as Record<string, unknown>;
    agentToEmail.set(row.id as string, row.portal_email as string);
  }

  const { data: rows } = await sb
    .from('ops_inbox')
    .select('agent_id, email_from')
    .gte('created_at', since)
    .eq('item_type', 'email');

  const counts = new Map<string, number>();  // key = `${portal_email}||${sender}`
  for (const r of rows ?? []) {
    const row = r as Record<string, unknown>;
    const email = agentToEmail.get(row.agent_id as string);
    if (!email) continue;
    const sender = (row.email_from as string | null) ?? '';
    if (!sender) continue;
    const key = `${email}||${sender}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const out: RepeatedSenderAnomaly[] = [];
  for (const [key, count] of counts) {
    if (count < REPEATED_SENDER_WARN) continue;
    const [email, sender] = key.split('||');
    out.push({
      portal_email: email,
      sender,
      count,
      level: count >= REPEATED_SENDER_CRITICAL ? 'critical' : 'warn',
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export async function detectRecursivePrefixes(sb: SupabaseClient): Promise<RecursivePrefixAnomaly[]> {
  const since = new Date(Date.now() - RECURSIVE_PREFIX_WINDOW_HOURS * 3600 * 1000).toISOString();

  const { data: agentMap } = await sb
    .from('voice_agents')
    .select('id, portal_email')
    .not('portal_email', 'is', null);
  const agentToEmail = new Map<string, string>();
  for (const a of agentMap ?? []) {
    const row = a as Record<string, unknown>;
    agentToEmail.set(row.id as string, row.portal_email as string);
  }

  const { data: rows } = await sb
    .from('ops_inbox')
    .select('agent_id, email_subject')
    .gte('created_at', since)
    .eq('item_type', 'email');

  const byOrg = new Map<string, { count: number; deepest: number; sample: string }>();
  for (const r of rows ?? []) {
    const row = r as Record<string, unknown>;
    const subj = (row.email_subject as string | null) ?? '';
    if (!RECURSIVE_PREFIX_RX.test(subj)) continue;
    const email = agentToEmail.get(row.agent_id as string);
    if (!email) continue;
    const match = subj.match(/^(\s*\[[A-Za-zñÑáéíóú ]+\]\s*)+/);
    const level = match ? (match[0].match(/\[/g) ?? []).length : 0;
    const prev = byOrg.get(email) ?? { count: 0, deepest: 0, sample: subj };
    prev.count++;
    if (level > prev.deepest) {
      prev.deepest = level;
      prev.sample = subj.slice(0, 120);
    }
    byOrg.set(email, prev);
  }

  const out: RecursivePrefixAnomaly[] = [];
  for (const [email, v] of byOrg) {
    out.push({
      portal_email:   email,
      count:          v.count,
      deepest_level:  v.deepest,
      sample_subject: v.sample,
    });
  }
  return out.sort((a, b) => b.deepest_level - a.deepest_level);
}
