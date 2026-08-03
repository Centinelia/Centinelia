/**
 * F14 battle test: POST to portal bug-report endpoint. Verify (a) HTTP 200 or
 * 403 with "Función no habilitada" (depending on allow_bug_reports flag), (b)
 * ai_ops_used does NOT increment (bug reports don't consume ops budget).
 */
import { loadEnv } from './_env';
loadEnv();
import { createClient } from '@supabase/supabase-js';
import { createSession, PORTAL_COOKIE } from '../../src/lib/portal/auth';

const APP           = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const PORTAL_EMAIL  = 'studio@pneumastudio.mx';
const PORTAL_TOKEN  = '8892c013-b122-4f11-a9d4-e88a04aff732';
const SOFIA_ID      = '9a0c935a-2b47-432a-a2c3-c67bbf915905';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Ensure allow_bug_reports=true; store prior value for cleanup
  const { data: agentBefore } = await s
    .from('voice_agents')
    .select('allow_bug_reports, ai_ops_used')
    .eq('id', SOFIA_ID)
    .single();
  const wasEnabled = !!agentBefore?.allow_bug_reports;
  const opsBefore  = Number(agentBefore?.ai_ops_used ?? 0);
  console.log(`allow_bug_reports (before): ${wasEnabled}`);
  console.log(`ai_ops_used (before): ${opsBefore}`);

  if (!wasEnabled) {
    await s.from('voice_agents').update({ allow_bug_reports: true }).eq('id', SOFIA_ID);
    console.log('Temporarily enabled allow_bug_reports.');
  }

  const cookie = await createSession(PORTAL_EMAIL);
  const res = await fetch(`${APP}/api/portal/${PORTAL_TOKEN}/bug-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `${PORTAL_COOKIE}=${cookie}` },
    body: JSON.stringify({
      category: 'battle-test',
      description: 'BATTLE TEST — no acción requerida. Reporte de prueba automatizado. Descartar.',
    }),
  });
  const body = await res.json();
  console.log(`HTTP ${res.status}:`, body);

  await new Promise(r => setTimeout(r, 1500));
  const { data: agentAfter } = await s
    .from('voice_agents')
    .select('ai_ops_used')
    .eq('id', SOFIA_ID)
    .single();
  const opsAfter = Number(agentAfter?.ai_ops_used ?? 0);
  console.log(`ai_ops_used (after): ${opsAfter}`);
  console.log(`Ops consumidas: ${opsAfter - opsBefore} (expected: 0)`);

  // Restore
  if (!wasEnabled) {
    await s.from('voice_agents').update({ allow_bug_reports: false }).eq('id', SOFIA_ID);
    console.log('Reverted allow_bug_reports.');
  }
}
main().catch(err => { console.error(err); process.exit(1); });
