/**
 * ¿Son 132 mensajes NUEVOS hoy o re-procesos del mismo correo?
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
  const { data: today } = await sb
    .from('ops_ledger')
    .select('created_at, amount, kind, reference_id, description, source')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('kind', 'consumption')
    .gte('created_at', '2026-10-07T00:00:00Z')
    .order('created_at', { ascending: true });

  console.log(`HOY (10-07): ${today?.length ?? 0} entradas`);

  // group by base reference_id (strip :suffix)
  const byBase: Record<string, { count: number; firstAt: string; lastAt: string; suffixes: string[]; source: string }> = {};
  for (const r of today ?? []) {
    const ref = (r as any).reference_id as string | null;
    if (!ref) continue;
    const m = ref.match(/^(.+?)(?::(iter\d+|processed|observador))?$/);
    const base = m?.[1] ?? ref;
    const sfx = m?.[2] ?? 'base';
    byBase[base] ||= { count: 0, firstAt: (r as any).created_at, lastAt: (r as any).created_at, suffixes: [], source: (r as any).source ?? '?' };
    byBase[base].count++;
    byBase[base].suffixes.push(sfx);
    byBase[base].lastAt = (r as any).created_at;
  }
  const bases = Object.entries(byBase);
  console.log(`Unique base reference_ids hoy: ${bases.length}`);

  // Were any of these also charged on 10-06?
  const { data: yesterday } = await sb
    .from('ops_ledger')
    .select('reference_id')
    .eq('portal_email', PORTAL_EMAIL)
    .eq('kind', 'consumption')
    .gte('created_at', '2026-10-06T00:00:00Z')
    .lt('created_at', '2026-10-07T00:00:00Z');
  const yesterdayBases = new Set<string>();
  for (const r of yesterday ?? []) {
    const ref = (r as any).reference_id as string | null;
    if (!ref) continue;
    const m = ref.match(/^(.+?)(?::(iter\d+|processed|observador))?$/);
    yesterdayBases.add(m?.[1] ?? ref);
  }
  const reprocessed = bases.filter(([b]) => yesterdayBases.has(b));
  console.log(`Mensajes RE-procesados hoy (ya cobrados ayer): ${reprocessed.length}`);
  console.log(`Mensajes NUEVOS hoy: ${bases.length - reprocessed.length}`);

  // Distribution of charges per message today
  const dist: Record<number, number> = {};
  for (const [, v] of bases) dist[v.count] = (dist[v.count] ?? 0) + 1;
  console.log('\nCobros por mensaje hoy:');
  for (const [n, c] of Object.entries(dist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  ${String(n).padStart(2)} cobro(s): ${c} mensajes`);
  }

  // Top offenders
  console.log('\nTop 10 mensajes con más cobros hoy:');
  bases.sort((a, b) => b[1].count - a[1].count).slice(0, 10).forEach(([b, v]) => {
    console.log(`  count=${v.count}  from ${v.firstAt.slice(11, 19)} to ${v.lastAt.slice(11, 19)}  suffixes=[${v.suffixes.join(',')}]  src=${v.source}`);
    console.log(`    ref=${b.slice(0, 80)}${b.length > 80 ? '...' : ''}`);
  });

  // Count by HOUR today
  console.log('\nConsumption per hour (hoy):');
  const perHour: Record<string, number> = {};
  for (const r of today ?? []) {
    const h = ((r as any).created_at as string).slice(11, 13);
    perHour[h] = (perHour[h] ?? 0) + 1;
  }
  for (const h of Object.keys(perHour).sort()) {
    console.log(`  ${h}:00  ${perHour[h]} cobros`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
