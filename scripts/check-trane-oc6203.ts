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
    .from('voice_agents').select('id').eq('portal_email', PORTAL_EMAIL);
  const agentIds = (agents ?? []).map((a: any) => a.id);

  // Buscar correos recientes relacionados con "6203" o "trane" en subject/from
  const { data: rows } = await sb
    .from('ops_inbox')
    .select('created_at, email_from, email_subject, status, category')
    .in('agent_id', agentIds)
    .or('email_subject.ilike.%6203%,email_from.ilike.%trane%,email_subject.ilike.%trane%,email_subject.ilike.%OC 6203%,email_subject.ilike.%7273%')
    .gte('created_at', new Date(Date.now() - 48 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30);

  console.log(`Correos relacionados Trane/6203/7273 últimas 48h: ${rows?.length ?? 0}`);
  for (const r of rows ?? []) {
    const row = r as any;
    console.log(`  ${row.created_at.slice(0, 16)}  from=${(row.email_from ?? '').slice(0, 50)}`);
    console.log(`    subj: ${(row.email_subject ?? '').slice(0, 100)}`);
    console.log(`    status=${row.status}  cat=${row.category ?? '-'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
