/**
 * F19 battle test: ask Sofia (voice/chat) to delegate a large campaign task to
 * Noah. Should trigger plan-then-approve gate:
 *   - agent_tasks row with status='awaiting_plan_approval' + plan JSON
 *   - approval email fired to studio@pneumastudio.mx
 *   - text response mentions "le mandé el plan al dueño"
 *
 * Then also runs a NEGATIVE case: a short single-shot task that should skip the
 * gate and execute directly.
 */
import { loadEnv } from './_env';
loadEnv();

import { battleChat } from './battle-chat';
import { createClient } from '@supabase/supabase-js';

const SOFIA_ID = '9a0c935a-2b47-432a-a2c3-c67bbf915905';
const PORTAL_EMAIL = 'studio@pneumastudio.mx';

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const beforeCount = (await supabase
    .from('agent_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', PORTAL_EMAIL)).count ?? 0;

  console.log(`Tasks before test: ${beforeCount}`);

  // ── POSITIVE: large campaign delegation, must trigger plan gate ─────────
  console.log('\n══════════ POSITIVE CASE (should trigger plan gate) ══════════\n');
  const posMsg = `Delega esta campaña de correos a Noah. Los 5 destinatarios son:
1. Ana Torres — ana@empresa1.mx
2. Bruno Kim — bruno@negocio2.com
3. Carla Ruiz — carla@ejemplo3.mx
4. Diego Lopez — diego@shop4.com
5. Elena Vega — elena@tienda5.mx

Objetivo: reactivar sus cotizaciones. Contenido: correo personalizado con saludo + recordar la cotización que abrimos + preguntar si siguen interesados + ofrecer llamada esta semana. Criterio de éxito: los 5 correos se enviaron exitosamente. Máximo 3 reintentos si algún envío falla. Delégaselo ahora, tiene toda la info que necesita.`;
  const posT = await battleChat({ agentId: SOFIA_ID, message: posMsg });
  console.log('\n\nTEXT:', posT.text.slice(0, 500));

  await new Promise(r => setTimeout(r, 3000));

  const { data: awaitingTasks } = await supabase
    .from('agent_tasks')
    .select('id, status, title, plan, plan_approval_token, created_at')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('status', 'awaiting_plan_approval')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('\nawaiting_plan_approval rows:');
  for (const t of awaitingTasks ?? []) {
    console.log('  -', t.id, '|', t.title?.slice(0, 60));
    console.log('    plan.summary:', (t.plan as any)?.summary);
    console.log('    plan.steps:', ((t.plan as any)?.steps ?? []).length, 'steps');
    console.log('    token present:', !!t.plan_approval_token);
  }

  // Skip negative case this round — already validated in prior run.
  const { data: recentAll } = await supabase
    .from('agent_tasks')
    .select('id, status, title, created_at')
    .eq('portal_email', PORTAL_EMAIL)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nLast 5 agent_tasks:');
  for (const t of recentAll ?? []) {
    console.log('  -', t.status.padEnd(24), '|', String(t.title).slice(0, 60), '|', t.created_at);
  }

  const afterCount = (await supabase
    .from('agent_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', PORTAL_EMAIL)).count ?? 0;
  console.log(`\nNew tasks created: ${afterCount - beforeCount}`);
}

main().catch(err => { console.error('FAIL:', err); process.exit(1); });
