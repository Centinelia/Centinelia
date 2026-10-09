/**
 * Diagnóstico 360 de por qué Nami sigue hallucinando:
 *  - ops_inbox: ¿llegaron los correos de Camila? ¿con attachments?
 *  - knowledge_base de AC: ¿menciona Google Sheets?
 *  - role_knowledge_base de Nami: ¿menciona Google Sheets?
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
    .select('id, agent_name, role, role_knowledge_base, business_name')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('agent_name', 'Nami');
  const nami = (agents ?? [])[0] as any;
  console.log('NAMI:');
  console.log('  role:', nami?.role);
  console.log('  role_knowledge_base length:', (nami?.role_knowledge_base ?? '').length);
  if ((nami?.role_knowledge_base ?? '').toLowerCase().includes('google sheet') ||
      (nami?.role_knowledge_base ?? '').toLowerCase().includes('google_sheet')) {
    console.log('  ⚠️  role_knowledge_base MENCIONA Google Sheets!');
    const idx = nami.role_knowledge_base.toLowerCase().indexOf('google');
    console.log('  context:', nami.role_knowledge_base.slice(Math.max(0, idx - 100), idx + 300));
  } else {
    console.log('  role_knowledge_base NO menciona Google Sheets ✓');
  }

  // Knowledge base de la org
  const { data: org } = await sb
    .from('organizations')
    .select('knowledge_base, inventory_excel_config')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  const kb = (org as any)?.knowledge_base ?? '';
  console.log(`\nORG knowledge_base length: ${kb.length}`);
  if (kb.toLowerCase().includes('google sheet') || kb.toLowerCase().includes('google_sheet')) {
    console.log('  ⚠️  knowledge_base MENCIONA Google Sheets!');
    const idx = kb.toLowerCase().indexOf('google');
    console.log('  context:', kb.slice(Math.max(0, idx - 100), idx + 300));
  } else {
    console.log('  knowledge_base NO menciona Google Sheets ✓');
  }

  console.log('\ninventory_excel_config:', JSON.stringify((org as any)?.inventory_excel_config, null, 2).slice(0, 500));

  // ops_inbox: ¿llegaron los correos de Camila? ¿Con attachments?
  const { data: inbox } = await sb
    .from('ops_inbox')
    .select('id, created_at, email_from, email_subject, status, category, attachments')
    .eq('agent_id', nami?.id)
    .gte('created_at', new Date(Date.now() - 2 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30);
  console.log(`\nOPS_INBOX últimas 2h: ${inbox?.length ?? 0} rows`);
  for (const r of inbox ?? []) {
    const row = r as any;
    const atts = (row.attachments ?? []) as any[];
    console.log(`\n  ${row.created_at.slice(0, 19)}  status=${row.status}  cat=${row.category}`);
    console.log(`    from: ${(row.email_from ?? '').slice(0, 60)}`);
    console.log(`    subj: ${(row.email_subject ?? '').slice(0, 80)}`);
    console.log(`    attachments: ${atts.length} ${atts.length > 0 ? '[' + atts.map(a => a.name ?? '?').join(', ').slice(0, 100) + ']' : '(ninguno)'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
