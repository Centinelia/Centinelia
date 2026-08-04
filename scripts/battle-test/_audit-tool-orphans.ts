/**
 * Audita tools "huérfanas": declaradas en algún lugar pero no distribuidas
 * a ningún meerkat, o endpoints en filesystem sin declaración.
 */
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { MEERKAT_VOICE_DISTRIBUTION } from '../../src/lib/vapi/sync';

const REPO = 'C:/Users/Nazre/centinelia';

async function main() {
  // 1. Endpoints reales en filesystem (uno por carpeta bajo src/app/api/voice/tools/)
  const toolsDir = join(REPO, 'src/app/api/voice/tools');
  const endpoints = readdirSync(toolsDir).filter(d => existsSync(join(toolsDir, d, 'route.ts')));

  // 2. Todas las tools declaradas en MEERKAT_VOICE_DISTRIBUTION
  const distributedTools = new Set<string>();
  const byMeerkat: Record<string, string[]> = {};
  for (const [role, tools] of Object.entries(MEERKAT_VOICE_DISTRIBUTION)) {
    byMeerkat[role] = tools;
    for (const t of tools) distributedTools.add(t);
  }

  // 3. Convertir endpoint name (kebab-case) a tool name (snake_case)
  const endpointsAsTools = new Set(endpoints.map(e => e.replace(/-/g, '_')));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' AUDIT DE TOOLS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Endpoints en filesystem: ${endpoints.length}`);
  console.log(`Tools distribuidas: ${distributedTools.size}`);

  // 4. Huérfanos: endpoints sin distribuir
  const orphanEndpoints = [...endpointsAsTools].filter(e => !distributedTools.has(e));
  console.log(`\n🔴 Endpoints SIN distribuir (${orphanEndpoints.length}):`);
  if (orphanEndpoints.length === 0) console.log('  (ninguno)');
  else orphanEndpoints.sort().forEach(e => console.log(`  - ${e}`));

  // 5. Distribuidas sin endpoint (voice-only pero endpoint faltante)
  const noEndpoint = [...distributedTools].filter(t => !endpointsAsTools.has(t));
  console.log(`\n🟡 Distribuidas pero SIN endpoint voice (${noEndpoint.length}):`);
  if (noEndpoint.length === 0) console.log('  (ninguno)');
  else noEndpoint.sort().forEach(e => console.log(`  - ${e}`));

  // 6. Distribución por meerkat
  console.log('\n📊 Distribución por meerkat:');
  for (const [role, tools] of Object.entries(byMeerkat)) {
    console.log(`  ${role.padEnd(6)} (${tools.length} tools)`);
  }

  // 7. Tools "compartidas por muchos" (usadas en 5+ meerkats) vs "exclusivas"
  const usageCount: Record<string, number> = {};
  for (const tools of Object.values(byMeerkat)) {
    for (const t of tools) usageCount[t] = (usageCount[t] ?? 0) + 1;
  }
  const sorted = Object.entries(usageCount).sort((a, b) => b[1] - a[1]);
  console.log('\n📈 Tools más compartidas (top 10):');
  sorted.slice(0, 10).forEach(([t, c]) => console.log(`  ${String(c).padStart(2)}× ${t}`));
  console.log('\n📉 Tools exclusivas (solo 1 meerkat):');
  sorted.filter(([, c]) => c === 1).forEach(([t]) => console.log(`   - ${t}`));
}

main().catch(err => { console.error(err); process.exit(1); });
