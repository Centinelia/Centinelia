#!/usr/bin/env tsx
/* eslint-disable no-console */
import '../_bootstrap';

import { createAdminClient } from '../../src/lib/supabase/admin';
import { getMeerkatIdForAgentRow } from '../../src/lib/vapi/meerkat-map';

const BATCH_SIZE = 500;
const SLEEP_MS = 200;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface CallRow { id: string; agent_id: string; created_at: string; }
interface AgentRow { id: string; features: unknown; }
interface HistoryRow { to_version: number; changed_at: string; }

async function main() {
  const supabase = createAdminClient();

  // Cache: agent_id → meerkat_id (evita repetir lookups)
  const agentToMeerkat = new Map<string, string | null>();

  async function meerkatIdFor(agentId: string): Promise<string | null> {
    if (agentToMeerkat.has(agentId)) return agentToMeerkat.get(agentId) ?? null;
    const { data } = await supabase
      .from('voice_agents')
      .select('id, features')
      .eq('id', agentId)
      .maybeSingle<AgentRow>();
    const mid = getMeerkatIdForAgentRow(data);
    agentToMeerkat.set(agentId, mid);
    return mid;
  }

  async function versionAt(meerkatId: string, at: string): Promise<number> {
    const { data } = await supabase
      .from('meerkat_version_history')
      .select('to_version, changed_at')
      .eq('meerkat_id', meerkatId)
      .lte('changed_at', at)
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle<HistoryRow>();
    return data?.to_version ?? 1;
  }

  let totalUpdated = 0;
  let cursor = 0;

  // Loop de páginas — usa range para cursor
  while (true) {
    const { data: calls, error } = await supabase
      .from('voice_calls')
      .select('id, agent_id, created_at')
      .is('meerkat_id', null)
      .order('created_at', { ascending: true })
      .range(cursor, cursor + BATCH_SIZE - 1)
      .returns<CallRow[]>();

    if (error) {
      console.error('[backfill] fetch error', error.message);
      process.exit(1);
    }
    if (!calls || calls.length === 0) break;

    for (const call of calls) {
      const mid = await meerkatIdFor(call.agent_id);
      if (!mid) continue; // sin meerkat, dejar null

      const ver = await versionAt(mid, call.created_at);
      const { error: upErr } = await supabase
        .from('voice_calls')
        .update({ meerkat_id: mid, meerkat_version: ver })
        .eq('id', call.id);

      if (upErr) {
        console.error('[backfill] update error', call.id, upErr.message);
        continue;
      }
      totalUpdated++;
    }

    console.log(`[backfill] batch done. cursor=${cursor} updated_total=${totalUpdated}`);
    cursor += BATCH_SIZE;
    await sleep(SLEEP_MS);
  }

  console.log(`[backfill] done. updated=${totalUpdated}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
