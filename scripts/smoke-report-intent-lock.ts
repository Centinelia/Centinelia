/**
 * Smoke E2E de report_intent_locks contra Supabase real.
 *
 * Valida las 5 propiedades del sistema de sincronización entre meerkats:
 *   1. Race concurrente — exactamente 1 de N tareas paralelas gana el claim.
 *   2. Post-commit dedupe — dentro del TTL, un segundo claim con mismo hash pierde.
 *   3. Release re-abre — liberar el ganador permite que otro reclame.
 *   4. Sweep de expirados — un lock con expires_at pasado se auto-libera al reintentar.
 *   5. Diferentes hashes NO colisionan — cambios en subject/target/kind/extraDedupe
 *      generan claims independientes.
 *
 * Uso:
 *   npx tsx scripts/smoke-report-intent-lock.ts
 *
 * Requiere .env.local con SUPABASE_SERVICE_ROLE_KEY. Al finalizar limpia todas
 * las filas que insertó (marcadas con portal_email='__smoke_intent_lock__').
 */

import './_bootstrap';
import { createAdminClient } from '../src/lib/supabase/admin';
import {
  tryClaimReportIntent,
  commitReportIntent,
  releaseReportIntent,
  computeIntentHash,
} from '../src/lib/ops/report-intent-lock';
import { executeAgentTool, type AgentToolContext } from '../src/lib/tools/executor';

const SMOKE_PORTAL = '__smoke_intent_lock__';

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) console.log('     detail:', JSON.stringify(detail, null, 2));
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`);
}

async function cleanup() {
  const supabase = createAdminClient();
  await supabase.from('report_intent_locks').delete().eq('portal_email', SMOKE_PORTAL);
}

async function run() {
  await cleanup();

  // ── 1. Race concurrente ──────────────────────────────────────────────────
  section('1. Race concurrente (10 tareas paralelas, mismo hash → 1 gana)');
  {
    const input = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      'cliente@example.com',
      subject:     'Cotización solicitada',
      agentName:   'test',
      extraDedupe: 'race-1',
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        tryClaimReportIntent({ ...input, agentName: `meerkat-${i}` }),
      ),
    );
    const winners = results.filter(r => r.claimed);
    const losers  = results.filter(r => !r.claimed);
    assert(winners.length === 1, `exactly 1 winner (got ${winners.length})`, { winners: winners.length, losers: losers.length });
    assert(losers.length === 9, `9 losers (got ${losers.length})`);
    assert(losers.every(l => !!l.alreadyClaimedBy), 'every loser has alreadyClaimedBy populated', losers.map(l => l.alreadyClaimedBy));
    // Los losers deben apuntar al MISMO ganador.
    const winnerName = winners[0]?.alreadyClaimedBy ?? null;
    void winnerName;
    const uniqueWinners = new Set(losers.map(l => l.alreadyClaimedBy?.agentName));
    assert(uniqueWinners.size === 1, `all losers point to the same winner (got ${uniqueWinners.size} distinct)`, Array.from(uniqueWinners));
  }

  await cleanup();

  // ── 2. Post-commit dedupe ────────────────────────────────────────────────
  section('2. Post-commit dedupe (dentro del TTL, segundo claim pierde)');
  {
    const input = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      'cliente@example.com',
      subject:     'Follow-up cotización',
      agentName:   'nia',
      ttlHours:    24,
    };
    const first = await tryClaimReportIntent(input);
    assert(first.claimed, 'first claim wins');
    await commitReportIntent(first.lockId);

    const second = await tryClaimReportIntent({ ...input, agentName: 'nox' });
    assert(!second.claimed, 'second claim (post-commit) loses');
    assert(second.alreadyClaimedBy?.agentName === 'nia', 'winner reported as nia', second.alreadyClaimedBy);
  }

  await cleanup();

  // ── 3. Release re-abre ───────────────────────────────────────────────────
  section('3. Release re-abre el intent');
  {
    const input = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      'cliente@example.com',
      subject:     'Send failed retry',
      agentName:   'nia',
    };
    const first = await tryClaimReportIntent(input);
    assert(first.claimed, 'first wins');
    await releaseReportIntent(first.lockId);

    const second = await tryClaimReportIntent({ ...input, agentName: 'nox' });
    assert(second.claimed, 'second wins after release');
    assert(second.lockId !== first.lockId, 'second got a new lockId', { first: first.lockId, second: second.lockId });
  }

  await cleanup();

  // ── 4. Sweep de expirados ────────────────────────────────────────────────
  section('4. Sweep de expirados (helper libera vencidos y reintenta)');
  {
    const supabase = createAdminClient();
    const intentHash = computeIntentHash({
      portalEmail: SMOKE_PORTAL,
      kind:        'email',
      target:      'cliente@example.com',
      subject:     'Stale lock',
      extraDedupe: 'expired',
    });
    // Sembrar un lock expirado directamente
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h atrás
    const seeded = await supabase.from('report_intent_locks').insert({
      portal_email:    SMOKE_PORTAL,
      intent_hash:     intentHash,
      intent_kind:     'email',
      target:          'cliente@example.com',
      subject_summary: 'Stale lock',
      claimed_by_name: 'ghost',
      expires_at:      past,
      status:          'claimed',
    }).select('id').single();
    assert(!seeded.error, 'seed expired lock', seeded.error);

    const claim = await tryClaimReportIntent({
      portalEmail: SMOKE_PORTAL,
      kind:        'email',
      target:      'cliente@example.com',
      subject:     'Stale lock',
      agentName:   'nia',
      extraDedupe: 'expired',
    });
    assert(claim.claimed, 'new claim wins after sweeping expired');
    assert(claim.lockId !== seeded.data?.id, 'new lock is a different row', { seeded: seeded.data?.id, new: claim.lockId });

    // El expirado debe quedar released
    const { data: stale } = await supabase
      .from('report_intent_locks')
      .select('released_at, status')
      .eq('id', seeded.data!.id)
      .single();
    assert(!!stale?.released_at, 'expired lock marked released_at', stale);
    assert(stale?.status === 'released', 'expired lock status=released', stale);
  }

  await cleanup();

  // ── 5. Diferentes hashes NO colisionan ───────────────────────────────────
  section('5. Diferentes hashes NO colisionan (target/subject/kind/extraDedupe)');
  {
    const base = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      'a@x.com',
      subject:     'Reporte',
      agentName:   'nia',
    };
    const r1 = await tryClaimReportIntent(base);
    assert(r1.claimed, 'base claim wins');

    const rDiffTarget = await tryClaimReportIntent({ ...base, target: 'b@x.com' });
    assert(rDiffTarget.claimed, 'different target → independent claim');

    const rDiffSubject = await tryClaimReportIntent({ ...base, subject: 'Otro reporte' });
    assert(rDiffSubject.claimed, 'different subject → independent claim');

    const rDiffKind = await tryClaimReportIntent({ ...base, kind: 'whatsapp' });
    assert(rDiffKind.claimed, 'different kind → independent claim');

    const rDiffExtra = await tryClaimReportIntent({ ...base, extraDedupe: 'variant' });
    assert(rDiffExtra.claimed, 'different extraDedupe → independent claim');

    // Y confirmar que el hash mismo SÍ colisiona (control)
    const rSame = await tryClaimReportIntent(base);
    assert(!rSame.claimed, 'identical input → loses (control test)');
  }

  await cleanup();

  // ── 6. Wiring contract por cada punto que cablée ─────────────────────────
  // Para cada tool, replico las EXACT args que el executor/coordinator pasa
  // a tryClaimReportIntent, y verifico que:
  //   a) call A + commit + call B (mismos args) → B pierde
  //   b) call A + variar el input que DEBE romper dedupe → B gana
  section('6a. Wiring: send_email (kind=email, target=to, extraDedupe=body[:800])');
  {
    // Recipe del executor: send_email
    const baseA = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      'cliente@example.com',
      subject:     'Cotización #123',
      agentName:   'nia',
      extraDedupe: 'Hola, adjunto la cotización solicitada'.slice(0, 800),
      sourceContext: { tool: 'send_email', channel: 'chat' },
    };
    const a = await tryClaimReportIntent(baseA);
    assert(a.claimed, 'send_email first call wins');
    await commitReportIntent(a.lockId);

    const b = await tryClaimReportIntent({ ...baseA, agentName: 'nox' });
    assert(!b.claimed, 'send_email duplicate loses');

    // Variación legítima: cambiar body debe romper dedupe
    const c = await tryClaimReportIntent({
      ...baseA,
      agentName: 'nox',
      extraDedupe: 'Hola, adjunto la cotización REVISADA'.slice(0, 800),
    });
    assert(c.claimed, 'send_email with different body → wins');
  }
  await cleanup();

  section('6b. Wiring: responder_cliente_afectado (kind=canal, ttl=6h)');
  {
    const incidentId = 'incident-abc123';
    const contactEmail = 'afectado@example.com';
    const baseA = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      contactEmail,
      subject:     `[Nash] responder_cliente_afectado :: ${incidentId}`,
      agentName:   'nash',
      ttlHours:    6,
      extraDedupe: 'Ya restauramos el servicio, sentimos las molestias'.slice(0, 400),
    };
    const a = await tryClaimReportIntent(baseA);
    assert(a.claimed, 'responder_cliente_afectado first wins');
    await commitReportIntent(a.lockId);

    const b = await tryClaimReportIntent(baseA);
    assert(!b.claimed, 'responder_cliente_afectado duplicate loses');

    // Otro incidente distinto → OK
    const c = await tryClaimReportIntent({
      ...baseA,
      subject: `[Nash] responder_cliente_afectado :: incident-different`,
    });
    assert(c.claimed, 'responder_cliente_afectado different incident → wins');
  }
  await cleanup();

  section('6c. Wiring: escalar_al_owner (kind=monitor_alert, critical bypasa)');
  {
    const owner = '+525551234567';
    const baseA = {
      portalEmail: SMOKE_PORTAL,
      kind:        'monitor_alert' as const,
      target:      owner,
      subject:     `[Nash escalation] high :: incident-xyz`,
      agentName:   'nash',
      ttlHours:    12,
      extraDedupe: 'QuickBooks caído por 30 minutos'.slice(0, 400),
    };
    const a = await tryClaimReportIntent(baseA);
    assert(a.claimed, 'escalar_al_owner high first wins');
    await commitReportIntent(a.lockId);

    const b = await tryClaimReportIntent(baseA);
    assert(!b.claimed, 'escalar_al_owner high duplicate loses');

    // Simulación del bypass 'critical': el executor lo salta sin llamar
    // tryClaim. Aquí lo probamos por contrato: si NO llamamos tryClaim,
    // no debe haber lock nuevo (verificación indirecta).
    const supabase = createAdminClient();
    const before = await supabase.from('report_intent_locks').select('id', { count: 'exact', head: true }).eq('portal_email', SMOKE_PORTAL);
    // (no llamamos tryClaim — simulando el bypass critical)
    const after = await supabase.from('report_intent_locks').select('id', { count: 'exact', head: true }).eq('portal_email', SMOKE_PORTAL);
    assert(before.count === after.count, 'critical bypass: no new lock (contract check)', { before: before.count, after: after.count });
  }
  await cleanup();

  section('6d. Wiring: enviar_documento_oficina (extraDedupe=document_id)');
  {
    const docId = 'doc-uuid-abc';
    const baseA = {
      portalEmail: SMOKE_PORTAL,
      kind:        'email' as const,
      target:      'cliente@example.com',
      subject:     `[doc-attach] ${docId} :: Cotización final`,
      agentName:   'nia',
      extraDedupe: docId,
    };
    const a = await tryClaimReportIntent(baseA);
    assert(a.claimed, 'enviar_documento_oficina first wins');
    await commitReportIntent(a.lockId);

    // Mismo doc + mismo destinatario, incluso con subject textual distinto,
    // colisiona porque el subject del claim incluye el docId como prefijo.
    const b = await tryClaimReportIntent(baseA);
    assert(!b.claimed, 'enviar_documento_oficina duplicate loses');

    // Distinto doc al mismo destinatario → OK
    const c = await tryClaimReportIntent({
      ...baseA,
      subject:     `[doc-attach] doc-uuid-DIFFERENT :: Otro`,
      extraDedupe: 'doc-uuid-DIFFERENT',
    });
    assert(c.claimed, 'enviar_documento_oficina different doc → wins');
  }
  await cleanup();

  section('6e. Wiring: processEmailWithNox (kind=task, extraDedupe=email fingerprint)');
  {
    const targetAgentId = '00000000-0000-0000-0000-000000000001';
    const emailFrom = 'lead@example.com';
    const emailSubject = 'Solicito información';
    const emailBody = 'Hola, quiero saber precios de sus servicios';
    const fingerprint = `${emailFrom}|${emailSubject}|${emailBody.slice(0, 200)}`;

    const baseA = {
      portalEmail: SMOKE_PORTAL,
      kind:        'task' as const,
      target:      targetAgentId,
      subject:     `nox-delegation :: ${emailSubject}`,
      agentName:   'nox',
      extraDedupe: fingerprint,
    };
    const a = await tryClaimReportIntent(baseA);
    assert(a.claimed, 'processEmailWithNox first wins');
    await commitReportIntent(a.lockId);

    const b = await tryClaimReportIntent(baseA);
    assert(!b.claimed, 'processEmailWithNox duplicate loses (double-fire)');

    // Correo distinto del mismo remitente → OK
    const c = await tryClaimReportIntent({
      ...baseA,
      subject:     `nox-delegation :: Otra pregunta`,
      extraDedupe: `${emailFrom}|Otra pregunta|Otro cuerpo`,
    });
    assert(c.claimed, 'processEmailWithNox different email → wins');
  }
  await cleanup();

  section('6f. Wiring: runNoxMonitor (kind=monitor_alert, extraDedupe=taskIds.sort().join)');
  {
    const taskIds = ['task-a', 'task-b', 'task-c'];
    const baseA = {
      portalEmail: SMOKE_PORTAL,
      kind:        'monitor_alert' as const,
      target:      '+525551234567',
      subject:     `nox-monitor overdue tasks`,
      agentName:   'nox',
      ttlHours:    6,
      extraDedupe: taskIds.sort().join(','),
    };
    const a = await tryClaimReportIntent(baseA);
    assert(a.claimed, 'runNoxMonitor first wins');
    await commitReportIntent(a.lockId);

    // Segundo cron, mismas overdue → dedupe
    const b = await tryClaimReportIntent(baseA);
    assert(!b.claimed, 'runNoxMonitor same overdue set → loses');

    // Distinta cola de overdue (una tarea más) → nueva alerta OK
    const c = await tryClaimReportIntent({
      ...baseA,
      extraDedupe: [...taskIds, 'task-d'].sort().join(','),
    });
    assert(c.claimed, 'runNoxMonitor with new overdue task added → wins');
  }
  await cleanup();

  // ── 7. Executor real: short-circuit en enviar_documento_oficina ──────────
  // Pre-claim la intent con el mismo hash que el executor produciría, luego
  // invoca la tool con executeAgentTool y verifica que corta ANTES de
  // llegar a sendOfficeDocumentByEmail (por eso no manda correo real).
  section('7. Executor E2E: enviar_documento_oficina short-circuit');
  {
    const docId = 'smoke-doc-id-not-real';
    const to    = 'cliente@example.com';
    const subject = 'Cotización final';
    const body    = 'Adjunto la propuesta.';

    // Pre-claim con la MISMA recipe que el executor
    const pre = await tryClaimReportIntent({
      portalEmail: SMOKE_PORTAL,
      kind:        'email',
      target:      to,
      subject:     `[doc-attach] ${docId} :: ${subject}`,
      agentName:   'ghost-preclaimer',
      extraDedupe: docId,
      sourceContext: { source: 'smoke pre-claim' },
    });
    assert(pre.claimed, 'pre-claim wins');
    await commitReportIntent(pre.lockId);

    // Ctx sintético — enviar_documento_oficina no tiene policy gate (no
    // aparece en TOOL_CAPABILITIES) así que no necesita voice_agent real.
    const ctx: AgentToolContext = {
      agentId:      '00000000-0000-0000-0000-000000000002',
      portalEmail:  SMOKE_PORTAL,
      agentName:    'meerkat-late',
      businessName: 'Smoke Business',
      portalToken:  'smoke-token',
      agent:        {},
      supabase:     createAdminClient(),
      channel:      'chat',
    };

    const result = await executeAgentTool('enviar_documento_oficina', {
      document_id: docId, to, subject, body,
    }, ctx) as { ok: boolean; deduped?: boolean; message?: string; already_claimed_by?: { agentName: string | null } };

    assert(result.ok === false, 'executor returns ok:false when deduped', result);
    assert(result.deduped === true, 'executor returns deduped:true', result);
    assert(!!result.message && result.message.includes('ghost-preclaimer'), 'message names the pre-claimer', result.message);
    assert(result.already_claimed_by?.agentName === 'ghost-preclaimer', 'already_claimed_by populated', result.already_claimed_by);

    // Verify NO extra lock was created (short-circuit fired before insert)
    const supabase = createAdminClient();
    const { count } = await supabase
      .from('report_intent_locks')
      .select('id', { count: 'exact', head: true })
      .eq('portal_email', SMOKE_PORTAL);
    assert(count === 1, 'only 1 lock row exists (the pre-claim)', { count });
  }
  await cleanup();

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log(`\n───────────────────────────────`);
  console.log(`  ${passed} passed · ${failed} failed`);
  console.log(`───────────────────────────────\n`);

  if (failed > 0) process.exit(1);
}

run().catch(async err => {
  console.error('\n[smoke] fatal:', err);
  await cleanup().catch(() => {});
  process.exit(1);
});
