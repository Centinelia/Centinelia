/**
 * HOTFIX URGENTE: recarga manual del pool AC Proyectos para que Nami funcione
 * en el demo con Camila. Insert row kind='manual_grant' +500.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const PORTAL_EMAIL = 'camila@acproyectos.com';

async function main() {
  const { data: agents } = await sb
    .from('voice_agents')
    .select('id, agent_name')
    .eq('portal_email', PORTAL_EMAIL)
    .limit(1);
  const agent = (agents ?? [])[0];
  if (!agent) throw new Error('No agent found for AC Proyectos');
  console.log('Using agent:', agent);

  const { error: lerr } = await sb.from('ops_ledger').insert({
    portal_email: PORTAL_EMAIL,
    agent_id:     (agent as any).id,
    amount:       500,
    kind:         'manual_grant',
    source:       'manual_grant',
    description:  'Hotfix 2026-10-07: recarga por demo Camila. Fix self-notif loop en flight.',
  });
  if (lerr) throw lerr;

  // Resync account_ops cache
  const { data: before } = await sb.from('account_ops').select('*').eq('portal_email', PORTAL_EMAIL).maybeSingle();
  console.log('BEFORE:', before);

  // Trigger a resync via RPC if exists
  try {
    const { error: rpcErr } = await sb.rpc('refresh_account_ops', { p_portal_email: PORTAL_EMAIL });
    if (rpcErr) console.warn('rpc refresh_account_ops failed (ok if not defined):', rpcErr.message);
    else console.log('RPC refresh_account_ops ran');
  } catch (e) {
    console.warn('rpc not available:', e);
  }

  // Manual recompute by summing ledger
  const { data: all } = await sb
    .from('ops_ledger')
    .select('amount, kind')
    .eq('portal_email', PORTAL_EMAIL);
  const sum = (all ?? []).reduce((acc, r: any) => acc + Number(r.amount), 0);
  console.log(`Ledger sum = ${sum}`);

  // If no RPC, force account_ops row update
  const { error: uerr } = await sb
    .from('account_ops')
    .update({
      ops_balance: sum,
      updated_at:  new Date().toISOString(),
    })
    .eq('portal_email', PORTAL_EMAIL);
  if (uerr) console.warn('direct update account_ops failed:', uerr);

  const { data: after } = await sb.from('account_ops').select('*').eq('portal_email', PORTAL_EMAIL).maybeSingle();
  console.log('AFTER:', after);
}

main().catch(e => { console.error(e); process.exit(1); });
