import { createAdminClient } from '@/lib/supabase/admin';
import HistorialConsumoClient, {
  type LedgerSource,
  type MinutesEntry,
  type TaskEntry,
} from './HistorialConsumoClient';

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
  tool_enviar_correo:            { label: 'Correo enviado desde llamada', trigger: 'voice_call' },
  tool_enviar_documento_oficina: { label: 'Documento enviado (oficina)',  trigger: 'voice_call' },
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
  consult_agent:       { label: 'Consulta a compañero especialista', trigger: 'chat' },
  batch_eval:          { label: 'Evaluación CES + auto-eval (batch)', trigger: 'schedule' },
  // Terceros deudas cerradas (N6)
  whatsapp_reply:      { label: 'Respuesta WhatsApp',                 trigger: 'chat' },
  teams_reply:         { label: 'Respuesta Microsoft Teams',          trigger: 'chat' },
  helpdesk_classify:   { label: 'Clasificación de ticket helpdesk',   trigger: 'manual' },
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

  const [ledgerRes, callsRes, outboundRes, opsLogRes, agentsRes] = await Promise.all([
    supabase
      .from('minutes_ledger')
      .select('id, agent_id, created_at, amount, description, source')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('voice_calls')
      .select('id, agent_id, created_at, duration_seconds, caller_number')
      .in('agent_id', agentIds)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('outbound_calls')
      .select('id, agent_id, called_at, duration_sec, telefono, nombre')
      .in('agent_id', agentIds)
      .not('duration_sec', 'is', null)
      .order('called_at', { ascending: false })
      .limit(5000),
    // Fuente unificada de consumo de tareas — cualquier consumeAiOp() escribe aquí.
    supabase
      .from('ai_ops_log')
      .select('id, agent_id, created_at, source, count, reference_id, label, context')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('voice_agents')
      .select('id, agent_name, business_name')
      .eq('portal_email', portalEmail),
  ]);

  const agentNameMap: Record<string, string> = {};
  for (const a of (agentsRes.data ?? [])) {
    agentNameMap[(a as any).id as string] = ((a as any).agent_name as string | null)?.trim() || ((a as any).business_name as string) || 'Empleado';
  }

  // ─── Minutos ────────────────────────────────────────────────────────────
  const credits: Omit<MinutesEntry, 'balance'>[] = (ledgerRes.data ?? []).map((r: any) => ({
    id:          r.id as string,
    date:        r.created_at as string,
    amount:      r.amount as number,
    description: r.description as string,
    source:      ((r.source as LedgerSource) ?? 'ajuste'),
  }));

  const debits: Omit<MinutesEntry, 'balance'>[] = (callsRes.data ?? []).map((c: any) => {
    const mins   = Math.max(1, Math.ceil((c.duration_seconds as number) / 60));
    const caller = ((c.caller_number as string | null)?.trim()) || 'Número privado';
    return {
      id:          c.id as string,
      date:        c.created_at as string,
      amount:      -mins,
      description: `${caller} · ${mins} min`,
      source:      'llamada' as LedgerSource,
    };
  });

  // Salientes vienen de outbound_calls (separado en la UI con icono + label
  // distinto para distinguir entrantes vs salientes en el ledger).
  const outboundDebits: Omit<MinutesEntry, 'balance'>[] = (outboundRes.data ?? []).map((c: any) => {
    const durSec = (c.duration_sec as number | null) ?? 0;
    const mins   = Math.max(1, Math.ceil(durSec / 60));
    const nombre = ((c.nombre as string | null)?.trim()) || null;
    const tel    = ((c.telefono as string | null)?.trim()) || 'Número privado';
    return {
      id:          `out-${c.id as string}`,
      date:        c.called_at as string,
      amount:      -mins,
      description: nombre ? `${nombre} (${tel}) · ${mins} min` : `${tel} · ${mins} min`,
      source:      'llamada_saliente' as LedgerSource,
    };
  });
  debits.push(...outboundDebits);

  if (credits.length === 0 && minutesIncluded > 0) {
    const firstDate = debits.length > 0 ? debits[debits.length - 1].date : new Date().toISOString();
    credits.push({
      id:          'initial-plan',
      date:        firstDate,
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

  // ─── Tareas (fuente unificada: ai_ops_log) ─────────────────────────────
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
      sourceContext: null,
      opsUsed:       Math.max(1, (o.count as number | null) ?? 1),
    };
  });

  if (minutes.length === 0 && tasks.length === 0) {
    return (
      <p className="text-xs text-center py-4" style={{ color: 'var(--c-text-3)' }}>
        Sin movimientos ni tareas registrados
      </p>
    );
  }

  return <HistorialConsumoClient minutes={minutes} tasks={tasks} callerNames={callerNames} token={token} />;
}
