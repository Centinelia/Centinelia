#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * One-shot backfill: aplica stopSpeakingPlan {numWords:3, voiceSeconds:0.2}
 * a todos los assistants de Vapi ligados a voice_agents.
 *
 * El flujo dinámico (assistant-request en /api/voice/inbound) ya lo tiene.
 * Los assistants pre-creados (Nia demo, agentes manuales, migrados) NO.
 * Este script iguala a todos.
 *
 * Idempotente: PATCH sobreescribe con el mismo valor sin efecto secundario.
 * Skip: assistants sin vapi_agent_id.
 *
 * Uso: npx tsx scripts/backfill/vapi-stop-speaking-plan.ts
 */
import '../_bootstrap';
import { createAdminClient } from '../../src/lib/supabase/admin';

const VAPI_URL = 'https://api.vapi.ai';
const VAPI_KEY = process.env.VAPI_API_KEY;
const SLEEP_MS = 250;

const TARGET_STOP_SPEAKING = {
  numWords: 3,
  voiceSeconds: 0.2,
} as const;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

interface AgentRow { id: string; agent_name: string | null; vapi_agent_id: string | null; }

async function main() {
  if (!VAPI_KEY) {
    console.error('[vapi-backfill] VAPI_API_KEY no configurada');
    process.exit(1);
  }

  const supabase = createAdminClient();
  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, vapi_agent_id')
    .not('vapi_agent_id', 'is', null)
    .returns<AgentRow[]>();

  if (error) {
    console.error('[vapi-backfill] fetch error', error.message);
    process.exit(1);
  }
  if (!agents?.length) {
    console.log('[vapi-backfill] no agents con vapi_agent_id');
    return;
  }

  console.log(`[vapi-backfill] ${agents.length} agents a procesar`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of agents) {
    if (!a.vapi_agent_id) { skipped++; continue; }

    try {
      const res = await fetch(`${VAPI_URL}/assistant/${a.vapi_agent_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${VAPI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stopSpeakingPlan: TARGET_STOP_SPEAKING }),
      });

      if (res.status === 404) {
        console.log(`  skip ${a.id} (${a.agent_name ?? '?'}): assistant 404 en Vapi`);
        skipped++;
      } else if (!res.ok) {
        const body = await res.text();
        console.error(`  fail ${a.id} (${a.agent_name ?? '?'}): ${res.status} ${body.slice(0, 200)}`);
        failed++;
      } else {
        console.log(`  ok   ${a.id} (${a.agent_name ?? '?'})`);
        updated++;
      }
    } catch (e) {
      console.error(`  fail ${a.id} (${a.agent_name ?? '?'}): ${String(e)}`);
      failed++;
    }

    await sleep(SLEEP_MS);
  }

  console.log(`[vapi-backfill] done. updated=${updated} skipped=${skipped} failed=${failed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
