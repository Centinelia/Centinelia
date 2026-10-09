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

  // Buscar correos de Camila (su propio email) de las últimas 2h
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: rows } = await sb
    .from('ops_inbox')
    .select('id, created_at, email_from, email_subject, status, category, attachments')
    .in('agent_id', agentIds)
    .or('email_from.ilike.%camila%,email_subject.ilike.%6203%')
    .gte('created_at', twoHoursAgo)
    .order('created_at', { ascending: false });

  console.log(`Correos de camila OR con 6203 últimas 2h: ${rows?.length ?? 0}`);
  for (const r of rows ?? []) {
    const row = r as any;
    const atts = (row.attachments ?? []) as any[];
    console.log(`${row.created_at.slice(0, 19)}  from=${(row.email_from ?? '').slice(0, 55)}`);
    console.log(`  subj: ${(row.email_subject ?? '').slice(0, 90)}`);
    console.log(`  status=${row.status}  cat=${row.category}  attachments=${atts.length} ${atts.length > 0 ? '[' + atts.map(a => a.name ?? a.filename ?? '?').join(', ').slice(0, 80) + ']' : ''}`);
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
