/**
 * Auditoría de consumo de ops (silent-drain detection).
 *
 * Nash y otros meerkats de plataforma usan esta lib para detectar dos clases
 * de anomalía en el consumo de ops de un portal:
 *
 *  1) RE-COBRO SOSPECHOSO (ratio events / distinct_refs > 1.5)
 *     Cada llamada a consumeAiOp() escribe una fila en ai_ops_log. Si un
 *     source dispara N eventos para K referencias únicas y N/K > 1.5, es
 *     probable que se esté cobrando la misma cosa varias veces. Ejemplo real:
 *     el bug de batch_eval de 2026-08-24 tenía ratio 30+ porque el cron
 *     re-cobraba callIds ya procesados.
 *     Requiere que los call sites populen reference_id (backfill 2026-08-24).
 *
 *  2) SPIKE VS BASELINE (semana actual > 3x promedio de 4 semanas previas)
 *     Cambio brusco en la tasa de consumo por source. Puede ser aumento
 *     legítimo de volumen O un bug nuevo que dispara re-cobros.
 *
 * Cuando se detecta anomalía en un check periódico (nash-monitor), se
 * inserta un row en notification_events para que el daily-digest del owner
 * lo entregue.
 */

import { createAdminClient } from '@/lib/supabase/admin';

export interface ConsumptionSourceSummary {
  source:             string;
  total_ops:          number;
  events:             number;
  distinct_refs:      number;   // 0 si el source no popula reference_id
  ratio:              number | null;   // events / distinct_refs si > 0
  is_anomalous_ratio: boolean;         // ratio > 1.5 con events > 20
}

export interface BaselineComparison {
  source:             string;
  current_week_ops:   number;
  baseline_ops_avg:   number;      // promedio de 4 semanas previas
  ratio_vs_baseline:  number | null;
  is_anomalous_spike: boolean;     // ratio > 3 con current > 20
}

export interface PortalAnomaly {
  portal_email: string;
  ratio_findings: ConsumptionSourceSummary[];
  spike_findings: BaselineComparison[];
}

const RATIO_THRESHOLD    = 1.5;   // events / distinct_refs
const RATIO_MIN_EVENTS   = 20;    // no flagear fuentes con casi cero uso
const SPIKE_THRESHOLD    = 3.0;   // current / baseline_avg
const SPIKE_MIN_CURRENT  = 20;    // idem

/**
 * Ratio-based audit: detecta doble/N-cobro dentro de la ventana.
 * NO usa notification_events, solo devuelve el análisis.
 */
export async function auditConsumption(portalEmail: string, days = 7): Promise<ConsumptionSourceSummary[]> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data: rows } = await supabase
    .from('ai_ops_log')
    .select('source, count, reference_id')
    .eq('portal_email', portalEmail)
    .gte('created_at', since);

  if (!rows || rows.length === 0) return [];

  const bySource = new Map<string, { total_ops: number; events: number; refs: Set<string> }>();
  for (const r of rows) {
    const src = (r.source as string) || 'unknown';
    if (!bySource.has(src)) {
      bySource.set(src, { total_ops: 0, events: 0, refs: new Set() });
    }
    const bucket = bySource.get(src)!;
    bucket.total_ops += (r.count as number) ?? 0;
    bucket.events    += 1;
    if (r.reference_id) bucket.refs.add(r.reference_id as string);
  }

  const summaries: ConsumptionSourceSummary[] = [];
  for (const [source, b] of bySource) {
    const distinct = b.refs.size;
    const ratio    = distinct > 0 ? b.events / distinct : null;
    summaries.push({
      source,
      total_ops:          b.total_ops,
      events:             b.events,
      distinct_refs:      distinct,
      ratio,
      is_anomalous_ratio: !!ratio && ratio > RATIO_THRESHOLD && b.events >= RATIO_MIN_EVENTS,
    });
  }

  return summaries.sort((a, b) => b.total_ops - a.total_ops);
}

/**
 * Baseline comparison: current week vs promedio 4 semanas previas.
 * Detecta spikes de consumo (bugs nuevos o cambios de volumen).
 */
export async function compareWithBaseline(portalEmail: string): Promise<BaselineComparison[]> {
  const supabase   = createAdminClient();
  const now        = new Date();
  const currStart  = startOfWeekUtc(now).toISOString();
  const baseStart  = new Date(startOfWeekUtc(now).getTime() - 4 * 7 * 86_400_000).toISOString();

  const { data: rows } = await supabase
    .from('ai_ops_log')
    .select('source, count, created_at')
    .eq('portal_email', portalEmail)
    .gte('created_at', baseStart);

  if (!rows || rows.length === 0) return [];

  const bySource = new Map<string, { current: number; prior_by_week: Map<string, number> }>();
  for (const r of rows) {
    const src   = (r.source as string) || 'unknown';
    const created = new Date(r.created_at as string);
    const isCurrent = created.toISOString() >= currStart;
    const ops   = (r.count as number) ?? 0;

    if (!bySource.has(src)) bySource.set(src, { current: 0, prior_by_week: new Map() });
    const bucket = bySource.get(src)!;
    if (isCurrent) {
      bucket.current += ops;
    } else {
      const weekKey = startOfWeekUtc(created).toISOString();
      bucket.prior_by_week.set(weekKey, (bucket.prior_by_week.get(weekKey) ?? 0) + ops);
    }
  }

  const out: BaselineComparison[] = [];
  for (const [source, b] of bySource) {
    const priorWeeks = Array.from(b.prior_by_week.values());
    const baselineAvg = priorWeeks.length > 0
      ? priorWeeks.reduce((s, v) => s + v, 0) / priorWeeks.length
      : 0;
    const ratio = baselineAvg > 0 ? b.current / baselineAvg : null;
    out.push({
      source,
      current_week_ops:   b.current,
      baseline_ops_avg:   Math.round(baselineAvg * 10) / 10,
      ratio_vs_baseline:  ratio,
      is_anomalous_spike: !!ratio && ratio > SPIKE_THRESHOLD && b.current >= SPIKE_MIN_CURRENT,
    });
  }

  return out.sort((a, b) => b.current_week_ops - a.current_week_ops);
}

/**
 * Iterar TODOS los portales con actividad reciente y devolver solo aquellos
 * que tengan al menos una anomalía (ratio o spike). Uso desde nash-monitor.
 */
export async function detectPlatformAnomalies(): Promise<PortalAnomaly[]> {
  const supabase = createAdminClient();
  const since    = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: activePortals } = await supabase
    .from('ai_ops_log')
    .select('portal_email')
    .gte('created_at', since)
    .not('portal_email', 'is', null);

  const emails = [...new Set((activePortals ?? []).map(r => r.portal_email as string))];
  if (emails.length === 0) return [];

  const anomalies: PortalAnomaly[] = [];
  for (const email of emails) {
    const [ratio, spike] = await Promise.all([
      auditConsumption(email, 7),
      compareWithBaseline(email),
    ]);
    const ratioBad = ratio.filter(r => r.is_anomalous_ratio);
    const spikeBad = spike.filter(s => s.is_anomalous_spike);
    if (ratioBad.length > 0 || spikeBad.length > 0) {
      anomalies.push({ portal_email: email, ratio_findings: ratioBad, spike_findings: spikeBad });
    }
  }
  return anomalies;
}

/**
 * Registrar la anomalía en notification_events para que el daily-digest del
 * owner de ese portal la entregue. Dedup por (portal_email, source, week)
 * mirando eventos previos no entregados para no re-inundar.
 */
export async function notifyConsumptionAnomaly(anomaly: PortalAnomaly): Promise<{ inserted: boolean; reason?: string }> {
  const supabase = createAdminClient();
  const currStart = startOfWeekUtc(new Date()).toISOString();

  // Dedup: si ya insertamos una notificación para este portal esta semana, no repetir.
  const { count } = await supabase
    .from('notification_events')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', anomaly.portal_email)
    .eq('kind', 'consumption_anomaly')
    .gte('created_at', currStart);
  if ((count ?? 0) > 0) return { inserted: false, reason: 'already_notified_this_week' };

  const urgent = anomaly.ratio_findings.some(r => (r.ratio ?? 0) > 5)
              || anomaly.spike_findings.some(s => (s.ratio_vs_baseline ?? 0) > 10);

  await supabase.from('notification_events').insert({
    portal_email: anomaly.portal_email,
    kind:         'consumption_anomaly',
    urgent,
    payload: {
      week_start: currStart,
      ratio_findings: anomaly.ratio_findings.map(r => ({
        source: r.source, events: r.events, distinct_refs: r.distinct_refs, ratio: r.ratio,
      })),
      spike_findings: anomaly.spike_findings.map(s => ({
        source: s.source, current: s.current_week_ops, baseline_avg: s.baseline_ops_avg, ratio: s.ratio_vs_baseline,
      })),
    },
  });
  return { inserted: true };
}

function startOfWeekUtc(d: Date): Date {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = c.getUTCDay(); // 0 = Sunday
  const daysFromMonday = (day + 6) % 7;
  c.setUTCDate(c.getUTCDate() - daysFromMonday);
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift detector: UNDER-charge (opuesto a los checks previos que buscan over-charge).
//
// Cada envío real en `outbound_emails.ok=true` debería tener una fila
// correlacionable en `ai_ops_log` (mismo agent_id, created_at ±30s).
// Si no la tiene → cobramos un email pero no descontamos al pool = Centinelia
// comiendo el costo de Resend/OAuth sin cobrarle al cliente.
//
// Reporte-only. No bloquea envíos. Se corre desde cron/consumption-audit y
// notifica anomalías vía notifyOutboundDriftAnomaly (misma tabla
// notification_events, kind='outbound_drift').
// ─────────────────────────────────────────────────────────────────────────────

const OUTBOUND_LEDGER_WINDOW_MS = 30_000;   // ±30s alrededor del envío

export interface OutboundDrift {
  outbound_id: string;
  agent_id:    string;
  to_email:    string;
  subject:     string | null;
  created_at:  string;
  provider:    string;
}

/**
 * Devuelve envíos de outbound_emails de las últimas `hoursBack` horas para los
 * que NO se encontró una fila correlacionable en ai_ops_log. Cada uno es
 * evidencia de un fix pendiente (probablemente falta un consumeAiOp en el
 * path que hizo el envío).
 */
export async function detectOutboundWithoutLedger(
  portalEmail?: string,
  hoursBack     = 24,
): Promise<OutboundDrift[]> {
  const supabase = createAdminClient();
  const since    = new Date(Date.now() - hoursBack * 3_600_000).toISOString();

  let outboundQ = supabase
    .from('outbound_emails')
    .select('id, agent_id, to_email, subject, created_at, provider')
    .eq('ok', true)
    .gte('created_at', since);
  if (portalEmail) outboundQ = outboundQ.eq('portal_email', portalEmail);
  const { data: outbounds } = await outboundQ;

  if (!outbounds || outbounds.length === 0) return [];

  // Traemos TODOS los ops_log del rango relevante (una sola query) y hacemos
  // la correlación en memoria — evita N queries paralelas por outbound.
  const buffer   = 60_000;   // ampliamos ±60s al pedir a la DB para cubrir el ±30s de la ventana con margen
  const opsSince = new Date(Date.now() - hoursBack * 3_600_000 - buffer).toISOString();
  let opsQ = supabase
    .from('ai_ops_log')
    .select('agent_id, created_at')
    .gte('created_at', opsSince);
  if (portalEmail) opsQ = opsQ.eq('portal_email', portalEmail);
  const { data: opsRows } = await opsQ;

  const opsByAgent = new Map<string, number[]>();   // agent_id → sorted timestamps (ms)
  for (const r of opsRows ?? []) {
    const aid = r.agent_id as string | null;
    if (!aid) continue;
    const t = new Date(r.created_at as string).getTime();
    if (!opsByAgent.has(aid)) opsByAgent.set(aid, []);
    opsByAgent.get(aid)!.push(t);
  }
  for (const arr of opsByAgent.values()) arr.sort((a, b) => a - b);

  const drift: OutboundDrift[] = [];
  for (const row of outbounds) {
    const aid = row.agent_id as string | null;
    if (!aid) continue;   // sin agent_id no se puede correlacionar; se ignora
    const outT = new Date(row.created_at as string).getTime();
    const arr  = opsByAgent.get(aid) ?? [];
    const hit  = arr.some(t => Math.abs(t - outT) <= OUTBOUND_LEDGER_WINDOW_MS);
    if (!hit) {
      drift.push({
        outbound_id: row.id as string,
        agent_id:    aid,
        to_email:    row.to_email as string,
        subject:     (row.subject as string | null) ?? null,
        created_at:  row.created_at as string,
        provider:    (row.provider as string) ?? 'unknown',
      });
    }
  }

  return drift;
}

/**
 * Registra drift outbound_without_ledger como notification_event (kind='outbound_drift').
 * Dedup: máximo 1 evento por portal por día. Payload trae los N primeros drifts
 * (cap 20 para no explotar el JSON) y el total.
 */
export async function notifyOutboundDrift(
  portalEmail: string,
  drifts:      OutboundDrift[],
): Promise<{ inserted: boolean; reason?: string }> {
  if (drifts.length === 0) return { inserted: false, reason: 'no_drift' };
  const supabase = createAdminClient();
  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('notification_events')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', portalEmail)
    .eq('kind', 'outbound_drift')
    .gte('created_at', todayStart.toISOString());
  if ((count ?? 0) > 0) return { inserted: false, reason: 'already_notified_today' };

  await supabase.from('notification_events').insert({
    portal_email: portalEmail,
    kind:         'outbound_drift',
    urgent:       drifts.length >= 10,   // 10+ envíos sin ledger en 24h = bug grande
    payload: {
      total:  drifts.length,
      sample: drifts.slice(0, 20).map(d => ({
        outbound_id: d.outbound_id, agent_id: d.agent_id,
        to_email:    d.to_email,    subject:  d.subject,
        created_at:  d.created_at,  provider: d.provider,
      })),
    },
  });
  return { inserted: true };
}
