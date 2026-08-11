export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';

// Purges all client data for accounts cancelled 30+ days ago.
// Deletes: voice_calls, leads_voice, agent_learnings, agent_messages, then the agent record.
//
// AUDIT TRAIL PRESERVATION (fix C11 audit 2026-08-10):
// Antes de borrar, mueve minutes_ledger + ops_ledger + ai_ops_log del agente a
// tablas *_archive con retention 7 años. Sin esto, el DELETE cascade dejaba el
// audit trail huérfano (agent_id=NULL) y Municipio no podía reconstruir la
// historia de consumo del agente cancelado.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff   = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: agents, error: fetchErr } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('billing_status', 'cancelado')
    .lt('cancelled_at', cutoff);

  if (fetchErr) {
    console.error('cleanup-cancelled: fetch error', fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!agents || agents.length === 0) {
    return NextResponse.json({ ok: true, purged: 0 });
  }

  const ids = agents.map(a => a.id);
  const errors: string[] = [];
  const archiveReason = `cleanup-cancelled ${new Date().toISOString().slice(0, 10)} — agente >30d en billing_status=cancelado`;

  // 1. Archivar ledgers ANTES de borrar. Cada tabla se copia con INSERT SELECT
  //    preservando todas las columnas. Si falla el archivo, ABORTAR el purge
  //    de ese agente (no borrar sin backup).
  const archivedAgentIds: string[] = [];
  for (const agentId of ids) {
    try {
      // Minutes ledger
      const { data: minRows } = await supabase
        .from('minutes_ledger')
        .select('*')
        .eq('agent_id', agentId);
      if (minRows && minRows.length > 0) {
        const rowsToArchive = minRows.map((r: Record<string, unknown>) => ({
          original_id:       r.id,
          archived_reason:   archiveReason,
          original_agent_id: agentId,
          agent_id:          null,
          portal_email:      r.portal_email,
          amount:            r.amount,
          description:       r.description,
          source:            r.source,
          kind:              r.kind,
          reference_id:      r.reference_id,
          created_at:        r.created_at,
        }));
        const { error: archErr } = await supabase.from('minutes_ledger_archive').upsert(rowsToArchive, { onConflict: 'original_id', ignoreDuplicates: true });
        if (archErr) { errors.push(`agent ${agentId} minutes_ledger archive: ${archErr.message}`); continue; }
      }

      // Ops ledger
      const { data: opsRows } = await supabase
        .from('ops_ledger')
        .select('*')
        .eq('agent_id', agentId);
      if (opsRows && opsRows.length > 0) {
        const rowsToArchive = opsRows.map((r: Record<string, unknown>) => ({
          original_id:       r.id,
          archived_reason:   archiveReason,
          original_agent_id: agentId,
          agent_id:          null,
          portal_email:      r.portal_email,
          amount:            r.amount,
          description:       r.description,
          source:            r.source,
          kind:              r.kind,
          reference_id:      r.reference_id,
          created_at:        r.created_at,
        }));
        const { error: archErr } = await supabase.from('ops_ledger_archive').upsert(rowsToArchive, { onConflict: 'original_id', ignoreDuplicates: true });
        if (archErr) { errors.push(`agent ${agentId} ops_ledger archive: ${archErr.message}`); continue; }
      }

      // AI ops log
      const { data: logRows } = await supabase
        .from('ai_ops_log')
        .select('*')
        .eq('agent_id', agentId);
      if (logRows && logRows.length > 0) {
        const rowsToArchive = logRows.map((r: Record<string, unknown>) => ({
          original_id:       r.id,
          archived_reason:   archiveReason,
          original_agent_id: agentId,
          agent_id:          null,
          portal_email:      r.portal_email,
          source:            r.source,
          count:             r.count,
          reference_id:      r.reference_id,
          label:             r.label,
          context:           r.context,
          created_at:        r.created_at,
        }));
        const { error: archErr } = await supabase.from('ai_ops_log_archive').upsert(rowsToArchive, { onConflict: 'original_id', ignoreDuplicates: true });
        if (archErr) { errors.push(`agent ${agentId} ai_ops_log archive: ${archErr.message}`); continue; }
      }

      // Fix T10 audit 2026-08-10: archivar voice_calls antes del DELETE cascade.
      // Preserva agent_id, duración, phone, timestamps, outcome (no transcript full
      // — decisión de scope: audit billing sí, contenido conversación no).
      const { data: callRows } = await supabase
        .from('voice_calls')
        .select('id, agent_id, vapi_call_id, caller_number, duration_seconds, outcome, cost_usd, summary, created_at')
        .eq('agent_id', agentId);
      if (callRows && callRows.length > 0) {
        const rowsToArchive = callRows.map((r: Record<string, unknown>) => ({
          original_id:       r.id,
          archived_reason:   archiveReason,
          original_agent_id: agentId,
          vapi_call_id:      r.vapi_call_id,
          caller_number:     r.caller_number,
          duration_seconds:  r.duration_seconds,
          outcome:           r.outcome,
          cost_usd:          r.cost_usd,
          summary:           r.summary,
          created_at:        r.created_at,
        }));
        const { error: archErr } = await supabase.from('voice_calls_archive').upsert(rowsToArchive, { onConflict: 'original_id', ignoreDuplicates: true });
        if (archErr) { errors.push(`agent ${agentId} voice_calls archive: ${archErr.message}`); continue; }
      }

      archivedAgentIds.push(agentId);
    } catch (err) {
      errors.push(`agent ${agentId} archive: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Borrar las tablas cliente-facing SOLO para los agentes archivados.
  // agent_messages tiene from_agent_id/to_agent_id (no agent_id) — bug
  // preexistente descubierto por el alert H13: nunca se purgaron mensajes
  // de agentes cancelados. Fix: borrar filas donde el agente aparece como
  // emisor O receptor.
  const singleFkTables = ['voice_calls', 'leads_voice', 'agent_learnings'] as const;
  for (const table of singleFkTables) {
    const { error } = await supabase.from(table).delete().in('agent_id', archivedAgentIds);
    if (error) errors.push(`delete ${table}: ${error.message}`);
  }
  {
    const { error: fromErr } = await supabase.from('agent_messages').delete().in('from_agent_id', archivedAgentIds);
    if (fromErr) errors.push(`delete agent_messages (from): ${fromErr.message}`);
    const { error: toErr } = await supabase.from('agent_messages').delete().in('to_agent_id', archivedAgentIds);
    if (toErr) errors.push(`delete agent_messages (to): ${toErr.message}`);
  }

  // 3. Finalmente borrar los agentes archivados. Usa RPC purge_cancelled_agent
  //    que setea SET LOCAL ledger.allow_delete='true' para que el cascade DELETE
  //    de minutes_ledger + ai_ops_log respete el trigger tamper-protection (fix V2).
  for (const agentId of archivedAgentIds) {
    const { error: purgeErr } = await supabase.rpc('purge_cancelled_agent', { p_agent_id: agentId });
    if (purgeErr) errors.push(`purge_cancelled_agent ${agentId}: ${purgeErr.message}`);
  }

  console.log(`cleanup-cancelled: archivados+purgados ${archivedAgentIds.length}/${ids.length} cancelled accounts, ${errors.length} errores`);

  await alertCronPartialFailure(supabase, {
    cronName:  'cleanup-cancelled',
    expected:  ids.length,
    processed: archivedAgentIds.length,
    errors,
  });

  return NextResponse.json({
    ok:       true,
    purged:   archivedAgentIds.length,
    total:    ids.length,
    errors:   errors.length,
  });
}
