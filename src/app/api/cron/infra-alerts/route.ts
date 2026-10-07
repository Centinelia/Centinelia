export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, infraAlertHtml } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { evaluateElevenLabsPace, EL_PACE_CRITICAL, EL_PACE_WARN, EL_USED_PCT_CRITICAL, EL_USED_PCT_WARN } from '@/lib/monitoring/elevenlabs-pace';
import { getMaxTokensTruncationStats, pickAlerts as pickMaxTokensAlerts, MAX_TOKENS_WARN_RATIO, MAX_TOKENS_CRITICAL_RATIO } from '@/lib/monitoring/max-tokens-truncation';
import { detectStuckOutbound, STUCK_OUTBOUND_HOURS_WARN, STUCK_OUTBOUND_HOURS_CRITICAL } from '@/lib/monitoring/stuck-outbound';
import { detectOutboundRegistrationDrift, OUTBOUND_REG_WINDOW_HOURS } from '@/lib/monitoring/outbound-registration';
import { detectPoolProvisioningAnomalies } from '@/lib/monitoring/pool-provisioning-drift';
import { detectReferenceIdCollisions, REF_COLLISION_WINDOW_HOURS } from '@/lib/monitoring/reference-id-collision-drift';
import {
  detectHighVelocityConsumption,
  detectRepeatedSender,
  detectRecursivePrefixes,
  VELOCITY_WINDOW_HOURS,
  VELOCITY_SPIKE_MULTIPLIER,
  REPEATED_SENDER_WARN,
  REPEATED_SENDER_CRITICAL,
} from '@/lib/monitoring/consumption-anomaly';

// ──────────────────────────────────────────────────────────────
// Invoicing alert thresholds
// ──────────────────────────────────────────────────────────────
// SF error codes that indicate invalid/expired credentials
const SF_CRED_ERROR_CODES = ['[601]', '[603]'];
// Minimum failed stamps in the last 2 h to consider creds bad
const CRED_FAIL_MIN = 2;
// Minimum total stamps in the last 1 h before we evaluate fail rate
const FAIL_RATE_MIN_TOTAL = 5;
// Fail rate threshold (0.10 = 10 %)
const FAIL_RATE_THRESHOLD = 0.1;

const VAPI_LOW_THRESHOLD   = 20;   // USD
const TWILIO_LOW_THRESHOLD = 10;   // USD
const CLAUDE_COST_PER_OP   = 0.0024;

// Umbrales ElevenLabs viven en @/lib/monitoring/elevenlabs-pace para poder testearse aparte.

// Storage cuota alerts (Supabase Pro tier: 100 GB included, overage $0.021/GB/mo)
// Buckets vigilados: csd, cfdi, cfdi-cancellations
const STORAGE_BUCKETS_WATCH = ['csd', 'cfdi', 'cfdi-cancellations'];
const STORAGE_WARN_BYTES     = 50 * 1024 * 1024 * 1024;  // 50 GB early warning
const STORAGE_CRITICAL_BYTES = 80 * 1024 * 1024 * 1024;  // 80 GB before overage

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const claudeBudget = parseFloat(process.env.CLAUDE_MONTHLY_BUDGET ?? '50');

  // Fetch all four in parallel
  const [vapiRes, twilioRes, opsRes, elevenRes] = await Promise.all([
    fetch('https://api.vapi.ai/account', {
      headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    }).then(r => r.ok ? r.json() : null).catch(() => null),

    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ? fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Balance.json`,
          { headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` } }
        ).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),

    createAdminClient()
      .from('voice_agents')
      .select('ai_ops_used')
      .neq('id', process.env.DEMO_AGENT_ID ?? ''),

    process.env.ELEVENLABS_API_KEY
      ? fetch('https://api.elevenlabs.io/v1/user/subscription', {
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
        }).then(r => r.ok ? r.json() : null).catch(() => null)
      : Promise.resolve(null),
  ]);

  const vapiBalance  = typeof vapiRes?.balance   === 'number' ? vapiRes.balance   : null;
  const twilioBalance = twilioRes?.balance ? parseFloat(twilioRes.balance) : null;
  const totalOpsUsed  = ((opsRes.data ?? []) as { ai_ops_used: number }[])
    .reduce((s, a) => s + (a.ai_ops_used ?? 0), 0);
  const claudeCost    = totalOpsUsed * CLAUDE_COST_PER_OP;

  // Build alert list
  type Alert = { service: string; current: string; threshold: string; action: string; actionUrl: string; color: string };
  const alerts: Alert[] = [];

  if (vapiBalance !== null && vapiBalance < VAPI_LOW_THRESHOLD) {
    alerts.push({
      service:   'Vapi — saldo de llamadas',
      current:   `$${vapiBalance.toFixed(2)} USD`,
      threshold: `< $${VAPI_LOW_THRESHOLD} USD`,
      action:    'Recargar cuenta Vapi',
      actionUrl: 'https://dashboard.vapi.ai/billing',
      color:     '#ef4444',
    });
  }

  if (twilioBalance !== null && twilioBalance < TWILIO_LOW_THRESHOLD) {
    alerts.push({
      service:   'Twilio — saldo de telefonía',
      current:   `$${twilioBalance.toFixed(2)} USD`,
      threshold: `< $${TWILIO_LOW_THRESHOLD} USD`,
      action:    'Recargar cuenta Twilio',
      actionUrl: 'https://console.twilio.com/billing',
      color:     '#ef4444',
    });
  }

  if (claudeCost >= claudeBudget * 0.9) {
    const pct = Math.round((claudeCost / claudeBudget) * 100);
    alerts.push({
      service:   'Anthropic / Claude — gasto mensual',
      current:   `~$${claudeCost.toFixed(2)} USD (${pct}% del presupuesto)`,
      threshold: claudeCost >= claudeBudget
        ? `Presupuesto de $${claudeBudget} USD superado`
        : `≥ 90% del presupuesto ($${claudeBudget} USD)`,
      action:    'Ver uso en Anthropic Console',
      actionUrl: 'https://console.anthropic.com/settings/billing',
      color:     claudeCost >= claudeBudget ? '#ef4444' : '#f59e0b',
    });
  }

  // ─── ElevenLabs pace check ────────────────────────────────────
  // Sin monitor los créditos TTS pueden acabarse a mitad de ciclo y
  // los meerkats de voz se quedan mudos. Alertamos por dos vías:
  //   1) % consumido absoluto (≥75% avisa, ≥90% crítico)
  //   2) ritmo relativo al día del ciclo (pace ≥ 1.25 avisa, ≥ 1.5 crítico).
  const elCharCount = typeof elevenRes?.character_count === 'number' ? elevenRes.character_count : null;
  const elCharLimit = typeof elevenRes?.character_limit === 'number' ? elevenRes.character_limit : null;
  const elResetUnix = typeof elevenRes?.next_character_count_reset_unix === 'number' ? elevenRes.next_character_count_reset_unix : null;

  if (elCharCount !== null && elCharLimit !== null && elCharLimit > 0 && elResetUnix !== null) {
    const r = evaluateElevenLabsPace(elCharCount, elCharLimit, elResetUnix);
    if (r.level !== 'ok') {
      alerts.push({
        service:   'ElevenLabs — créditos TTS (voz de meerkats)',
        current:   `${elCharCount.toLocaleString('es-MX')} / ${elCharLimit.toLocaleString('es-MX')} (${r.usedPct.toFixed(1)}%, ritmo ${r.pace.toFixed(2)}×, ${r.daysRemaining.toFixed(0)}d al reset)`,
        threshold: r.level === 'critical'
          ? `≥ ${EL_USED_PCT_CRITICAL}% consumido o ritmo ≥ ${EL_PACE_CRITICAL}× (riesgo real de quedarse sin TTS)`
          : `≥ ${EL_USED_PCT_WARN}% consumido o ritmo ≥ ${EL_PACE_WARN}× (vigilar)`,
        action:    'Considerar upgrade de plan (Creator → Pro → Scale)',
        actionUrl: 'https://elevenlabs.io/subscription',
        color:     r.level === 'critical' ? '#ef4444' : '#f59e0b',
      });
    }
  }

  // ── Invoicing alerts ──────────────────────────────────────────

  const supabase = createAdminClient();

  // 1. Orgs with persistent credential errors (SF codes 601 / 603) in last 2 h
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recentFailed } = await supabase
    .from('factura_requests')
    .select('portal_email, stamp_last_error')
    .eq('status', 'stamp_failed')
    .gte('stamp_last_error_at', twoHoursAgo);

  const credErrorsByOrg = new Map<string, number>();
  for (const row of recentFailed ?? []) {
    const isCredError = SF_CRED_ERROR_CODES.some(code =>
      (row.stamp_last_error as string | null)?.includes(code),
    );
    if (isCredError && row.portal_email) {
      credErrorsByOrg.set(
        row.portal_email,
        (credErrorsByOrg.get(row.portal_email) ?? 0) + 1,
      );
    }
  }
  const badCreds = [...credErrorsByOrg.entries()]
    .filter(([, count]) => count >= CRED_FAIL_MIN)
    .map(([org, count]) => ({ org, count }));

  // 2. Orgs with fail rate > 10 % in last 1 h (minimum 5 stamps)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentAll } = await supabase
    .from('factura_requests')
    .select('portal_email, status')
    .gte('created_at', oneHourAgo);

  const orgStats = new Map<string, { total: number; failed: number }>();
  for (const row of recentAll ?? []) {
    if (!row.portal_email) continue;
    const s = orgStats.get(row.portal_email) ?? { total: 0, failed: 0 };
    s.total++;
    if (row.status === 'stamp_failed') s.failed++;
    orgStats.set(row.portal_email, s);
  }
  const highFail = [...orgStats.entries()]
    .filter(([, s]) => s.total >= FAIL_RATE_MIN_TOTAL && s.failed / s.total > FAIL_RATE_THRESHOLD)
    .map(([org, s]) => ({ org, failRate: Math.round((s.failed / s.total) * 100), total: s.total }));

  if (badCreds.length > 0 || highFail.length > 0) {
    await sendEmail({
      to: 'hola@centinelia.mx',
      subject: 'Alerta invoicing — creds inválidas o fail rate alto',
      html: `<pre>${JSON.stringify({ badCreds, highFail }, null, 2)}</pre>`,
      from: 'Centinelia <alerts@centinelia.mx>',
    }).catch(err => console.error('[infra-alerts] invoicing email failed:', err));
  }

  // ── Storage cuota alerts (obligación fiscal SAT: 5 años retención CFDI) ──

  const storageStats: { bucket: string; bytes: number; objects: number }[] = [];
  for (const bucket of STORAGE_BUCKETS_WATCH) {
    // Supabase Storage no expone sum(size) directamente; usamos SQL sobre storage.objects
    const { data } = await supabase.rpc('sum_storage_bucket_bytes', { p_bucket_id: bucket })
      .single<{ total_bytes: number; total_objects: number }>();
    if (data) storageStats.push({ bucket, bytes: data.total_bytes ?? 0, objects: data.total_objects ?? 0 });
  }
  const totalStorageBytes = storageStats.reduce((s, b) => s + b.bytes, 0);

  const storageAlert =
    totalStorageBytes >= STORAGE_CRITICAL_BYTES ? 'critical'
    : totalStorageBytes >= STORAGE_WARN_BYTES   ? 'warn'
    : null;

  if (storageAlert) {
    const gb = (totalStorageBytes / (1024 ** 3)).toFixed(1);
    const pct = Math.round((totalStorageBytes / (100 * 1024 ** 3)) * 100);
    alerts.push({
      service:   `Supabase Storage — cuota invoicing (${storageAlert === 'critical' ? 'crítico' : 'aviso'})`,
      current:   `${gb} GB · ${pct}% del plan Pro (100 GB)`,
      threshold: storageAlert === 'critical' ? `≥ 80 GB (próximo a overage)` : `≥ 50 GB`,
      action:    'Ver breakdown por bucket + considerar cold tiering',
      actionUrl: 'https://supabase.com/dashboard/project/_/storage',
      color:     storageAlert === 'critical' ? '#ef4444' : '#f59e0b',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Max-tokens truncation en voice_llm (ventana 1h). Alerta cuando el LLM
  // se queda sin espacio para responder — el cliente escucha "problema de
  // conexion" o respuesta vacia. Regresion tipica tras cambio de modelo/config
  // (ej. Sonnet 5.5 con adaptive thinking consumiendo el budget). Ver
  // src/lib/monitoring/max-tokens-truncation.ts.
  try {
    const supabase = createAdminClient();
    const stats = await getMaxTokensTruncationStats(supabase, 60);
    const truncAlerts = pickMaxTokensAlerts(stats);
    for (const t of truncAlerts) {
      const pct = (t.ratio * 100).toFixed(1);
      const roleLbl = t.role ?? '(sin rol)';
      alerts.push({
        service:   `voice_llm — max_tokens truncation (${t.level === 'critical' ? 'crítico' : 'aviso'})`,
        current:   `${roleLbl} · ${t.model} · ${t.max_tokens_turns}/${t.total_turns} turnos truncados (${pct}%) en 1h`,
        threshold: t.level === 'critical'
          ? `≥ ${(MAX_TOKENS_CRITICAL_RATIO * 100).toFixed(0)}% (modelo sin espacio para responder)`
          : `≥ ${(MAX_TOKENS_WARN_RATIO * 100).toFixed(0)}%`,
        action:    'Subir max_tokens, bajar effort, o revisar prompt del rol',
        actionUrl: `https://www.centinelia.mx/admin/versiones?tab=health`,
        color:     t.level === 'critical' ? '#ef4444' : '#f59e0b',
      });
    }
  } catch (err) {
    console.error('[infra-alerts] max_tokens truncation check failed:', err);
  }

  // ─────────────────────────────────────────────────────────────
  // Stuck outbound_contacts — firma del bug audit 2026-09-29 Nelia
  // Tortillería: contacts en status='calling' por >2h sin outbound_calls
  // row. Antes se acumulaban silent hasta que un humano los detectaba.
  // Ver src/lib/monitoring/stuck-outbound.ts.
  try {
    const supabase = createAdminClient();
    const stuck = await detectStuckOutbound(supabase);
    if (stuck.level !== 'ok') {
      const top = stuck.byAgent.slice(0, 3).map(a =>
        `${a.agent_name ?? a.agent_id.slice(0, 8)}: ${a.count} (oldest ${a.oldest_hours.toFixed(1)}h)`,
      ).join(' · ');
      alerts.push({
        service:   `Outbound stuck — contacts en 'calling' sin outbound_call (${stuck.level === 'critical' ? 'crítico' : 'aviso'})`,
        current:   `${stuck.totalStuck} contacts · ${top}`,
        threshold: stuck.level === 'critical'
          ? `≥ 1 stuck por >${STUCK_OUTBOUND_HOURS_CRITICAL}h`
          : `≥ 1 stuck por >${STUCK_OUTBOUND_HOURS_WARN}h`,
        action:    'Revisar logs del cron /api/cron/outbound + correr scripts/cleanup-nelia-stuck-outbound.ts patrón',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     stuck.level === 'critical' ? '#ef4444' : '#f59e0b',
      });
    }
  } catch (err) {
    console.error('[infra-alerts] stuck outbound check failed:', err);
  }

  // ─────────────────────────────────────────────────────────────
  // Outbound registration drift — compara Vapi API contra DB para catchear
  // outbound calls que cayeron en voice_calls en lugar de outbound_calls
  // (smoking gun del bug audit 2026-09-29: 18 outbound de Nelia registrados
  // como inbound porque serverUrl no llegaba). Detección DIRECTA por vapi_call_id.
  try {
    const supabase = createAdminClient();
    const drift = await detectOutboundRegistrationDrift(supabase, process.env.VAPI_API_KEY ?? '');
    if (drift.level !== 'ok') {
      const sample = drift.sample.slice(0, 3).map(s =>
        `${s.vapi_call_id.slice(0, 8)}${s.location === 'voice_calls' ? '(en voice_calls!)' : ''}`,
      ).join(', ');
      alerts.push({
        service:   `Outbound registration drift — Vapi vs DB (${drift.level === 'critical' ? 'crítico' : 'aviso'})`,
        current:   `${drift.vapiOutboundInWindow} outbound en Vapi últimas ${OUTBOUND_REG_WINDOW_HOURS}h · ${drift.misregisteredInVoice} en voice_calls (mal), ${drift.missing} sin registro · muestra: ${sample}`,
        threshold: drift.level === 'critical'
          ? `≥ 1 outbound de Vapi cayó en voice_calls (bug 2026-09-29 reincidiendo)`
          : `≥ 1 outbound de Vapi sin match en outbound_calls`,
        action:    drift.level === 'critical'
          ? 'CRÍTICO: revisar triggerOutboundCall (serverUrl override) + voice/webhook guard'
          : 'Revisar cron /api/cron/outbound y logs',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     drift.level === 'critical' ? '#ef4444' : '#f59e0b',
      });
    }
  } catch (err) {
    console.error('[infra-alerts] outbound registration drift check failed:', err);
  }

  // ─────────────────────────────────────────────────────────────
  // Pool provisioning drift — detecta orgs con agentes active=true pero
  // ledger balance <= 0 (nunca sembrado o agotado). Precedente: bug
  // 2026-09-30 AC Proyectos — Nami active pero pool=0 → cada chat 429,
  // Camila veía "Ocurrió un error" sin saber que faltaba pool. Diagnosticar
  // tomó ~2 horas; con este alert bajamos a <1h.
  try {
    const supabase = createAdminClient();
    const anomalies = await detectPoolProvisioningAnomalies(supabase);
    if (anomalies.length > 0) {
      const sample = anomalies.slice(0, 3).map(a =>
        `${a.portal_email} (${a.reason}, bal=${a.ledger_balance}, agents=${a.active_agents})`,
      ).join(' · ');
      const neverSeeded = anomalies.filter(a => a.reason === 'never_seeded').length;
      alerts.push({
        service:   `Pool provisioning drift — orgs activos sin pool`,
        current:   `${anomalies.length} org(s) · ${neverSeeded} never_seeded, ${anomalies.length - neverSeeded} exhausted · muestra: ${sample}`,
        threshold: `≥ 1 org con active agent + ledger balance <= 0`,
        action:    'Correr scripts/ac/provision-nami.mjs --activate (o equivalente) para la org afectada, o seedear ledger manualmente',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     neverSeeded > 0 ? '#ef4444' : '#f59e0b',
      });
    }
  } catch (err) {
    console.error('[infra-alerts] pool provisioning drift check failed:', err);
  }

  // ─────────────────────────────────────────────────────────────
  // reference_id collisions — detecta rows en ai_ops_log con count=0 +
  // context "duplicate key" (señal de que el UNIQUE constraint
  // ops_ledger_portal_ref_kind_uniq rechazó un cobro). Esto significa que
  // dos sources distintos están usando el mismo reference_id en la misma
  // org/kind → undercharge silencioso. Precedente: hallazgo investigación
  // 2026-10-01 Tortillería — incidencia_notif chocaba con
  // incident_registered por compartir incidentId. Fix: sufijar reference_id.
  try {
    const supabase = createAdminClient();
    const result = await detectReferenceIdCollisions(supabase);
    if (result.level !== 'ok') {
      const sample = result.byOrg.slice(0, 3).map(g =>
        `${g.portal_email} ${g.source} (×${g.count}, ej: ${g.sample_refs.slice(0, 2).join(', ')})`,
      ).join(' · ');
      alerts.push({
        service:   `reference_id collisions — undercharge silencioso por UNIQUE constraint`,
        current:   `${result.total} rechazo(s) en ${REF_COLLISION_WINDOW_HOURS}h · ${result.byOrg.length} org/source distintos · muestra: ${sample}`,
        threshold: `≥ 1 fila en ai_ops_log con count=0 y "duplicate key" en context`,
        action:    'Buscar los sources listados en el código, cambiar reference_id del cobro secundario a `${baseRef}:<sufijo>`. Ver registrar-incidencia.ts como ejemplo.',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     result.level === 'critical' ? '#ef4444' : '#f59e0b',
      });
    }
  } catch (err) {
    console.error('[infra-alerts] reference_id collision drift check failed:', err);
  }

  // ─────────────────────────────────────────────────────────────
  // Consumption anomaly — 3 detectores que anticipan el patrón de self-loop
  // o leak masivo ANTES de que el pool se agote (que ya atrapa
  // pool-provisioning-drift pero tarde). Caso que los motivó: AC Proyectos
  // 2026-10-07 quemó 455 ops en 48h con subjects `[Factura] [Factura] [Factura]
  // ...` 10+ niveles. Nash no gritó hasta que balance <= 0, 7 días tarde.
  try {
    const supabase = createAdminClient();
    const [vel, rep, rec] = await Promise.all([
      detectHighVelocityConsumption(supabase),
      detectRepeatedSender(supabase),
      detectRecursivePrefixes(supabase),
    ]);

    if (vel.length > 0) {
      const sample = vel.slice(0, 3).map(v =>
        `${v.portal_email}: ${v.ops_24h}ops/${VELOCITY_WINDOW_HOURS}h vs baseline ${v.baseline_avg}/día (${v.multiplier === Infinity ? 'org nueva' : v.multiplier + '×'})`,
      ).join(' · ');
      alerts.push({
        service:   `Consumption velocity spike — ops/día ≥ ${VELOCITY_SPIKE_MULTIPLIER}× del baseline`,
        current:   `${vel.length} org(s) con spike · muestra: ${sample}`,
        threshold: `Más de ${VELOCITY_SPIKE_MULTIPLIER}× el consumo promedio de los últimos 14 días`,
        action:    'Investigar inbox-processor logs + ops_ledger de las orgs afectadas; buscar self-loop o cambio de patrón',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     '#f59e0b',
      });
    }

    if (rep.length > 0) {
      const crit = rep.filter(r => r.level === 'critical');
      const sample = rep.slice(0, 3).map(r =>
        `${r.portal_email} ← ${r.sender} (×${r.count}${r.level === 'critical' ? ' CRIT' : ''})`,
      ).join(' · ');
      alerts.push({
        service:   `Repeated sender flood — mismo remitente ≥ ${REPEATED_SENDER_WARN}/día en una org`,
        current:   `${rep.length} par(es) org/remitente · ${crit.length} crítico(s) · muestra: ${sample}`,
        threshold: `≥ ${REPEATED_SENDER_WARN} correos del mismo remitente en 24h (${REPEATED_SENDER_CRITICAL}+ = crítico)`,
        action:    'Verificar si es self-notification loop, newsletter runaway, o automation legítima',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     crit.length > 0 ? '#ef4444' : '#f59e0b',
      });
    }

    if (rec.length > 0) {
      const sample = rec.slice(0, 3).map(r =>
        `${r.portal_email} (${r.count}× anidación, ${r.deepest_level} niveles: "${r.sample_subject.slice(0, 50)}…")`,
      ).join(' · ');
      alerts.push({
        service:   `Recursive subject prefix — firma de self-notification loop`,
        current:   `${rec.length} org(s) con subjects anidados 3+ niveles · muestra: ${sample}`,
        threshold: `≥ 1 subject matching /^(\\s*\\[[A-Za-z]+\\]\\s*){3,}/ en 24h`,
        action:    'CRÍTICO: notif del sistema está llegando al inbox del propio meerkat. Revisar guard isSelfNotification en inbox-processor.ts y stripOwnPrefixes',
        actionUrl: 'https://vercel.com/centinelia1/centinelia_product/logs',
        color:     '#ef4444',
      });
    }
  } catch (err) {
    console.error('[infra-alerts] consumption anomaly check failed:', err);
  }

  // ─────────────────────────────────────────────────────────────

  if (alerts.length === 0 && badCreds.length === 0 && highFail.length === 0) {
    return NextResponse.json({ ok: true, alerts: 0, storage: { totalBytes: totalStorageBytes, buckets: storageStats } });
  }

  const date = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const sent = await sendEmail({
    to:      'hola@centinelia.mx',
    subject: `[Centinelia] Alerta de infraestructura — ${alerts.map(a => a.service.split('—')[0].trim()).join(', ')}`,
    html:    infraAlertHtml({ date, alerts }),
  });

  return NextResponse.json({
    ok: true,
    alerts: alerts.length,
    sent,
    invoicing: { badCreds: badCreds.length, highFail: highFail.length },
    storage: { totalBytes: totalStorageBytes, buckets: storageStats, alert: storageAlert },
  });
}
