import { createAdminClient } from '@/lib/supabase/admin';
import HistorialConsumoClient, {
  type LedgerSource,
  type MinutesEntry,
  type TaskEntry,
} from './HistorialConsumoClient';
import type { OpsLedgerEntry, OpsLedgerKind } from './OpsLedgerListClient';

// ─── Label + trigger config para cada source de ai_ops_log ────────────────────
// Cualquier consumeAiOp() debe llegar aquí. Si algún source no está mapeado,
// se muestra tal cual + label 'manual' — pero eso indica un bug (source
// missing en el caller).
const SOURCE_META: Record<string, { label: string; trigger: string }> = {
  // Cron (automatizaciones periódicas)
  heartbeat:            { label: 'Check-in automático diario',   trigger: 'schedule' },
  learn:                { label: 'Aprendizaje continuo del negocio', trigger: 'schedule' },
  nox_brief:            { label: 'Brief del día generado por Nox',   trigger: 'schedule' },
  nox_brief_manual:     { label: 'Brief del día bajo demanda',       trigger: 'manual' },
  weekly_insights:      { label: 'Insights semanales (cron)',        trigger: 'schedule' },
  insights_manual:      { label: 'Insights generados manualmente',   trigger: 'manual' },
  // Chat / consultas
  agent_chat:           { label: 'Consulta con empleado desde chat', trigger: 'chat' },
  agent_chat_loop:      { label: 'Iteración de chat (continuación)', trigger: 'chat' },
  // KB / setup
  generate_kb:            { label: 'Generación de manual con IA',    trigger: 'manual' },
  generate_kb_tournament: { label: 'Generación KB (modo torneo)',    trigger: 'manual' },
  role_email_learning:    { label: 'Aprendizaje del rol desde correos', trigger: 'schedule' },
  historical_synthesis:   { label: 'Síntesis del historial de llamadas', trigger: 'manual' },
  // Herramientas de voz (durante llamada)
  tool_crear_documento:          { label: 'Documento creado en llamada', trigger: 'voice_call' },
  tool_enviar_correo:            { label: 'Correo enviado por el empleado', trigger: 'voice_call' },
  tool_enviar_documento_oficina: { label: 'Documento enviado (oficina)',  trigger: 'voice_call' },
  // Notificaciones automáticas post-llamada (Nelia y otros meerkats que
  // registran quejas o altas y avisan al encargado por correo).
  incidencia_notif:              { label: 'Aviso de queja al encargado',  trigger: 'voice_call' },
  alta_cliente_notif:            { label: 'Aviso de alta de cliente',     trigger: 'voice_call' },
  // Bitácora: envío del xlsx adjunto al correo del responsable.
  bitacora_semanal_send:         { label: 'Bitácora semanal por correo',  trigger: 'schedule' },
  bitacora_mensual_send:         { label: 'Bitácora mensual por correo',  trigger: 'schedule' },
  tool_llamar_a:                 { label: 'Llamada saliente iniciada',    trigger: 'voice_call' },
  tool_qb_crear_factura:         { label: 'Factura creada en QuickBooks', trigger: 'voice_call' },
  tool_qb_registrar_pago:        { label: 'Pago registrado en QuickBooks', trigger: 'voice_call' },
  // Ops (bandeja / juntas / contratos / reportes)
  extract_learnings:   { label: 'Extracción de aprendizajes de conversación', trigger: 'schedule' },
  contracts_monitor:   { label: 'Monitoreo de contratos',      trigger: 'schedule' },
  inbox_processor:     { label: 'Procesamiento de bandeja',    trigger: 'inbox' },
  meeting_processor:   { label: 'Procesamiento de junta',      trigger: 'schedule' },
  report_generator:    { label: 'Generación de reporte',       trigger: 'schedule' },
  tool_execution:      { label: 'Ejecución de herramienta',    trigger: 'manual' },
  // Backfill histórico (pre-refactor): tareas de agent_tasks importadas
  agent_task_historical: { label: 'Tarea del agente',           trigger: 'manual' },
  // Nuevos sources (segunda pasada audit 2026-08-10)
  consultar_agente:    { label: 'Consulta a compañero especialista', trigger: 'chat' },
  // Alias retrocompat: source string usado antes del rename 2026-08-19
  // (consult_agent → consultar_agente). Registros históricos siguen con label bonito.
  consult_agent:       { label: 'Consulta a compañero especialista', trigger: 'chat' },
  batch_eval:          { label: 'Evaluación CES + auto-eval (batch)', trigger: 'schedule' },
  // Terceros deudas cerradas (N6)
  whatsapp_reply:      { label: 'Respuesta WhatsApp',                 trigger: 'chat' },
  teams_reply:         { label: 'Respuesta Microsoft Teams',          trigger: 'chat' },
  helpdesk_classify:   { label: 'Clasificación de ticket helpdesk',   trigger: 'manual' },
  // Cost-based sources agregados en fix/pool-accounting-gaps (external I/O real)
  invoice_stamped:         { label: 'Factura timbrada con PAC',        trigger: 'voice_call' },
  invoice_email_sent:      { label: 'CFDI enviado al cliente',         trigger: 'voice_call' },
  calendar_event_created:  { label: 'Cita agendada en calendario',     trigger: 'voice_call' },
  calcom_booking:          { label: 'Cita agendada en Cal.com',        trigger: 'voice_call' },
  whatsapp_notify_owner:   { label: 'WhatsApp al encargado',           trigger: 'voice_call' },
  sheets_row_appended:     { label: 'Fila agregada a Google Sheets',   trigger: 'voice_call' },
  ticket_whatsapp_notify:  { label: 'WhatsApp de ticket al asignado',  trigger: 'voice_call' },
  ticket_email_notify:     { label: 'Correo de ticket al encargado',   trigger: 'voice_call' },
  web_search:              { label: 'Búsqueda web (Brave)',            trigger: 'voice_call' },
  web_search_leads:        { label: 'Búsqueda de leads (Brave)',       trigger: 'chat' },
  // Fallbacks
  unknown:             { label: 'Consumo sin identificar',     trigger: 'manual' },
};

export default async function HistorialConsumoSection({
  portalEmail,
  agentIds,
  minutesIncluded,
  callerNames = {},
  token,
}: {
  portalEmail:     string;
  agentIds:        string[];
  minutesIncluded: number;
  callerNames?:    Record<string, string>;
  token:           string;
}) {
  const supabase = createAdminClient();

  const HISTORY_LIMIT = 5000;
  const [
    ledgerRes, ledgerArchRes,
    callsRes, outboundRes,
    opsLogRes,
    opsLedgerRes, opsLedgerArchRes,
    agentsRes,
    ledgerCountRes, opsLedgerCountRes,
  ] = await Promise.all([
    // Fuente autoritativa de consumo — cada llamada (entrante/saliente) escribe
    // aquí vía apply_ledger_entry / consume_pool_minutes RPC. Incluir kind y
    // reference_id para enriquecer con caller_number vía lookup a voice_calls /
    // outbound_calls sin duplicar el debit.
    supabase
      .from('minutes_ledger')
      .select('id, agent_id, created_at, amount, description, source, kind, reference_id')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    // Archive: retention 7 años. Antes solo se leía live y cliente perdía
    // acceso post-purge de agente cancelled. Ver [[feedback-audit-read-path-fidelity]].
    supabase
      .from('minutes_ledger_archive')
      .select('id, original_agent_id, created_at, amount, description, source, kind, reference_id')
      .in('original_agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    // voice_calls / outbound_calls: SOLO para enriquecer las rows del ledger
    // con caller_number y para el fallback legacy (llamadas pre-fix C1 audit
    // 2026-08-10 que no tienen ledger row). Antes se derivaban debits desde
    // estas tablas Y también del ledger — cada llamada se restaba 2 veces.
    supabase
      .from('voice_calls')
      .select('id, agent_id, created_at, duration_seconds, caller_number, outcome')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('outbound_calls')
      .select('id, agent_id, called_at, duration_sec, telefono, nombre')
      .in('agent_id', agentIds)
      .not('duration_sec', 'is', null)
      .order('called_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    // Fuente unificada de consumo de tareas — cualquier consumeAiOp() escribe aquí.
    supabase
      .from('ai_ops_log')
      .select('id, agent_id, created_at, source, count, reference_id, label, context')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    // Movimientos de saldo del pool de tareas (grants, refunds, rollover_cap,
    // unused_forfeited, plan changes). Ver F1.3.
    supabase
      .from('ops_ledger')
      .select('id, created_at, amount, description, kind')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('ops_ledger_archive')
      .select('id, created_at, amount, description, kind')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', portalEmail),
    // Counts para el banner de truncación — advertir al cliente cuando la UI
    // esté mostrando solo los últimos HISTORY_LIMIT movimientos.
    supabase
      .from('minutes_ledger')
      .select('id', { count: 'exact', head: true })
      .in('agent_id', agentIds),
    supabase
      .from('ops_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('portal_email', portalEmail),
  ]);

  const agentNameMap: Record<string, string> = {};
  for (const a of (agentsRes.data ?? [])) {
    agentNameMap[(a as any).id as string] = ((a as any).agent_name as string | null)?.trim() || ((a as any).business_name as string) || 'Empleado';
  }

  // ─── Detección de callers internos (owner/equipo) ─────────────────────
  // Construimos set de números normalizados (últimos 10 dígitos) que
  // pertenecen al dueño, transfer_whatsapp, o team_numbers de la org. Se usa
  // para marcar rows del historial con chip "Interno" — cliente auditando
  // puede distinguir tráfico real de pruebas del equipo. Ver
  // [[feedback-audit-read-path-fidelity]].
  const norm10 = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10);
  const internalNums = new Set<string>();
  if (portalEmail && agentIds.length > 0) {
    const { loadOrgDirectory, toTeamNumbers } = await import('@/lib/portal/directory');
    const [agentContactsRes, dir] = await Promise.all([
      supabase.from('voice_agents')
        .select('transfer_number, transfer_whatsapp')
        .in('id', agentIds),
      loadOrgDirectory(portalEmail, supabase),
    ]);
    for (const a of (agentContactsRes.data ?? []) as any[]) {
      const t1 = norm10(a.transfer_number as string | null);
      const t2 = norm10(a.transfer_whatsapp as string | null);
      if (t1.length >= 7) internalNums.add(t1);
      if (t2.length >= 7) internalNums.add(t2);
    }
    for (const t of toTeamNumbers(dir)) {
      const n = norm10(t.number);
      if (n.length >= 7) internalNums.add(n);
    }
  }

  // ─── Minutos ────────────────────────────────────────────────────────────
  // Lookup maps para enriquecer las rows del ledger con caller_number
  // (voice_calls.id / outbound_calls.id → reference_id del ledger) + flag
  // isInternal derivado del set de números internos.
  type VoiceCallInfo = { caller: string; isInternal: boolean };
  type OutboundInfo  = { telefono: string; nombre: string | null; isInternal: boolean };
  const voiceCallMap: Record<string, VoiceCallInfo> = {};
  for (const c of (callsRes.data ?? []) as any[]) {
    const raw = ((c.caller_number as string | null)?.trim()) || '';
    voiceCallMap[c.id as string] = {
      caller:     raw || 'Número privado',
      isInternal: internalNums.has(norm10(raw)),
    };
  }
  const outboundMap: Record<string, OutboundInfo> = {};
  for (const c of (outboundRes.data ?? []) as any[]) {
    const tel = ((c.telefono as string | null)?.trim()) || '';
    outboundMap[c.id as string] = {
      telefono:   tel || 'Número privado',
      nombre:     ((c.nombre as string | null)?.trim()) || null,
      // Salientes iniciadas por el equipo interno cuando el destino es un
      // número interno (poco común pero soportado).
      isInternal: internalNums.has(norm10(tel)),
    };
  }

  // Ledger: separar por signo, enriquecer las rows kind='call' con caller_number
  // cuando el reference_id apunta a voice_calls/outbound_calls. Merge live +
  // archive (retention 7 años) — el archive usa original_agent_id en vez de
  // agent_id; normalizamos aquí para que downstream no distinga.
  const credits: Omit<MinutesEntry, 'balance'>[] = [];
  const debits:  Omit<MinutesEntry, 'balance'>[] = [];
  const ledgerCallRefIds = new Set<string>();
  const mergedLedger: any[] = [
    ...((ledgerRes.data ?? []) as any[]),
    ...((ledgerArchRes.data ?? []) as any[]).map(r => ({ ...r, agent_id: r.original_agent_id })),
  ];
  for (const r of mergedLedger) {
    const amount = r.amount as number;
    const source = ((r.source as LedgerSource) ?? 'ajuste');
    const kind   = r.kind as string | null;
    const refId  = r.reference_id as string | null;
    let description = r.description as string;
    let entrySource: LedgerSource = source;
    let isInternal = false;
    // Kinds especiales que necesitan meta distinta a la source raw. Antes
    // auto_paused rendereaba como "Ajuste · 0 min" — cliente no entendía por
    // qué su agente se pausó. Ver [[feedback-audit-read-path-fidelity]].
    if (kind === 'auto_paused') entrySource = 'auto_pausado' as LedgerSource;
    if (kind === 'call' && refId) {
      ledgerCallRefIds.add(refId);
      const mins = Math.abs(amount);
      if (outboundMap[refId]) {
        const o = outboundMap[refId];
        description  = o.nombre ? `${o.nombre} (${o.telefono}) · ${mins} min` : `${o.telefono} · ${mins} min`;
        entrySource  = 'llamada_saliente' as LedgerSource;
        isInternal   = o.isInternal;
      } else if (voiceCallMap[refId]) {
        description  = `${voiceCallMap[refId].caller} · ${mins} min`;
        entrySource  = 'llamada' as LedgerSource;
        isInternal   = voiceCallMap[refId].isInternal;
      }
    }
    const entry = {
      id:          r.id as string,
      date:        r.created_at as string,
      amount,
      description,
      source: entrySource,
      isInternal,
    };
    if (amount >= 0) credits.push(entry); // amount=0 (auto_paused, info) también va aquí
    else debits.push(entry);
  }

  // Fallback legacy: llamadas cobradas pre-audit (sin ledger row correspondiente).
  // Se filtra por outcome/duración para NO incluir unanswered ni <3s (que
  // voice/webhook shouldChargeMinutes descarta explícitamente).
  const legacyInboundDebits: Omit<MinutesEntry, 'balance'>[] = ((callsRes.data ?? []) as any[])
    .filter(c => {
      const durSec  = (c.duration_seconds as number | null) ?? 0;
      const outcome = c.outcome as string | null;
      return !ledgerCallRefIds.has(c.id as string)
        && durSec >= 3
        && outcome !== 'unanswered';
    })
    .map(c => {
      const mins   = Math.max(1, Math.ceil((c.duration_seconds as number) / 60));
      const raw    = ((c.caller_number as string | null)?.trim()) || '';
      const caller = raw || 'Número privado';
      return {
        id:          c.id as string,
        date:        c.created_at as string,
        amount:      -mins,
        description: `${caller} · ${mins} min`,
        source:      'llamada' as LedgerSource,
        isInternal:  internalNums.has(norm10(raw)),
      };
    });
  debits.push(...legacyInboundDebits);

  const legacyOutboundDebits: Omit<MinutesEntry, 'balance'>[] = ((outboundRes.data ?? []) as any[])
    .filter(c => !ledgerCallRefIds.has(c.id as string) && ((c.duration_sec as number | null) ?? 0) >= 3)
    .map(c => {
      const durSec = (c.duration_sec as number | null) ?? 0;
      const mins   = Math.max(1, Math.ceil(durSec / 60));
      const nombre = ((c.nombre as string | null)?.trim()) || null;
      const tel    = ((c.telefono as string | null)?.trim()) || '';
      return {
        id:          `out-${c.id as string}`,
        date:        c.called_at as string,
        amount:      -mins,
        description: nombre ? `${nombre} (${tel || 'Número privado'}) · ${mins} min` : `${tel || 'Número privado'} · ${mins} min`,
        source:      'llamada_saliente' as LedgerSource,
        isInternal:  internalNums.has(norm10(tel)),
      };
    });
  debits.push(...legacyOutboundDebits);

  // Seed inicial: solo si NO hay ningún movimiento (ni credit ni debit) y hay
  // plan configurado. Antes se creaba también cuando ya había ledger real,
  // sobre-acreditando (audit finding — cliente veía balance inflado).
  if (credits.length === 0 && debits.length === 0 && minutesIncluded > 0) {
    credits.push({
      id:          'initial-plan',
      date:        new Date().toISOString(),
      amount:      minutesIncluded,
      description: `Plan incluido, ${minutesIncluded} minutos`,
      source:      'activacion' as LedgerSource,
    });
  }

  const chronological = [...credits, ...debits].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  let running = 0;
  const withBalance: MinutesEntry[] = chronological.map(e => {
    running += e.amount;
    return { ...e, balance: running };
  });
  const minutes = withBalance.reverse();

  // ─── Tareas: actividad por herramienta (ai_ops_log) ────────────────────
  // Sirve para OpsBreakdown per-tool y TasksList detallado. Fuente granular.
  const tasks: TaskEntry[] = ((opsLogRes.data ?? []) as any[]).map(o => {
    const sourceKey = (o.source as string | null) ?? 'unknown';
    const meta      = SOURCE_META[sourceKey] ?? { label: (o.label as string | null) ?? sourceKey, trigger: 'manual' };
    return {
      id:            o.id as string,
      date:          o.created_at as string,
      title:         (o.label as string | null) ?? meta.label,
      description:   (o.context as string | null) ?? null,
      agentName:     (o.agent_id as string | null) ? (agentNameMap[o.agent_id as string] ?? null) : null,
      triggerType:   meta.trigger,
      status:        'completed',
      goalMet:       null,
      sourceContext: (o.context as string | null) ?? null,
      opsUsed:       Math.max(1, (o.count as number | null) ?? 1),
    };
  });

  // ─── Movimientos de saldo de tareas (ops_ledger + archive) ─────────────
  // Grants, refunds, rollover_cap, unused_forfeited, plan changes. Merge live
  // + archive para retention 7 años. Ver [[feedback-audit-read-path-fidelity]].
  const opsLedgerMerged = [
    ...((opsLedgerRes.data ?? []) as any[]),
    ...((opsLedgerArchRes.data ?? []) as any[]),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  let opsRunning = 0;
  const opsLedgerAscWithBalance: OpsLedgerEntry[] = opsLedgerMerged.map(r => {
    opsRunning += (r.amount as number) ?? 0;
    return {
      id:          r.id as string,
      date:        r.created_at as string,
      amount:      (r.amount as number) ?? 0,
      description: (r.description as string) ?? '',
      kind:        ((r.kind as OpsLedgerKind) ?? 'admin_adjustment'),
      balance:     opsRunning,
    };
  });
  const opsBalanceMovements: OpsLedgerEntry[] = opsLedgerAscWithBalance.reverse();

  // Banner de truncación: avisa al cliente cuando el UI muestra solo los
  // últimos HISTORY_LIMIT movimientos y hay más data disponible en CSV.
  const totalLedgerRows    = (ledgerCountRes as { count?: number | null }).count ?? 0;
  const totalOpsLedgerRows = (opsLedgerCountRes as { count?: number | null }).count ?? 0;
  const truncatedMinutes   = totalLedgerRows > HISTORY_LIMIT;
  const truncatedTasks     = totalOpsLedgerRows > HISTORY_LIMIT;

  if (minutes.length === 0 && tasks.length === 0 && opsBalanceMovements.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--c-text-3)' }}>
        Sin movimientos ni tareas registrados
      </p>
    );
  }

  return <HistorialConsumoClient
    minutes={minutes}
    tasks={tasks}
    opsBalanceMovements={opsBalanceMovements}
    truncationBanner={truncatedMinutes || truncatedTasks
      ? { limit: HISTORY_LIMIT, totalMinutes: totalLedgerRows, totalTasks: totalOpsLedgerRows }
      : null}
    callerNames={callerNames}
    token={token}
  />;
}
