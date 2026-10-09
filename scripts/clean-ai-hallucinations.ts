/**
 * Limpia ai_summary + ai_draft con hallucinations conocidas de ops_inbox
 * de Nami en AC Proyectos. DRY-RUN por default.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { validateDraft } from '../src/lib/ops/draft-validator';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');

async function main() {
  const { data: agents } = await sb.from('voice_agents').select('id').eq('portal_email', 'camila@acproyectos.com').eq('agent_name', 'Nami');
  const agentId = (agents?.[0] as any)?.id;

  const { data: dir } = await sb.from('organizations').select('directory').eq('portal_email', 'camila@acproyectos.com').maybeSingle();
  const teamHumans = (((dir as any)?.directory ?? []) as any[])
    .map(p => (p.name ?? '').trim())
    .filter((n: string) => n.length >= 3);
  console.log(`Team humans: ${teamHumans.join(', ')}`);

  // Scope: últimos 14 días, status != 'skipped' (los skipped ya están archivados)
  const { data: rows } = await sb
    .from('ops_inbox')
    .select('id, created_at, email_subject, ai_summary, ai_draft, status')
    .eq('agent_id', agentId)
    .gte('created_at', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
    .neq('status', 'skipped')
    .order('created_at', { ascending: false });

  console.log(`\nScanning ${rows?.length ?? 0} rows (last 14d, not skipped)...\n`);
  let violated = 0;

  for (const r of rows ?? []) {
    const row = r as any;
    const vd = validateDraft({
      summary: row.ai_summary,
      draft:   row.ai_draft,
      agentName: 'Nami',
      teamHumanNames: teamHumans,
      toolsActuallyInvoked: [],  // conservador: sin invocaciones conocidas, cualquier "intenté X" es sospechoso
    });
    if (vd.ok) continue;
    violated++;
    console.log(`${'─'.repeat(60)}`);
    console.log(`VIOLATION id=${row.id}`);
    console.log(`  subj: ${(row.email_subject ?? '').slice(0, 70)}`);
    console.log(`  violations: ${vd.violations.map(v => v.kind).join(', ')}`);
    for (const v of vd.violations.slice(0, 2)) {
      console.log(`    - [${v.kind}] "${v.excerpt.slice(0, 100)}"`);
    }
    if (APPLY) {
      const newSummary = `[Limpiado 2026-10-07: summary contenía hallucinations (${vd.violations.map(v => v.kind).join(', ')}). Si necesitas revisar, abre el correo original en Outlook.]`;
      const { error } = await sb
        .from('ops_inbox')
        .update({ ai_summary: newSummary, ai_draft: null })
        .eq('id', row.id);
      if (error) console.log(`    ERROR update: ${error.message}`);
      else console.log(`    ✅ cleaned`);
    }
  }
  console.log(`\nTotal: ${violated} rows con hallucinations${APPLY ? ' (LIMPIADOS)' : ' (DRY-RUN — correr con --apply)'}`);
}
main().catch(e => { console.error(e); process.exit(1); });
