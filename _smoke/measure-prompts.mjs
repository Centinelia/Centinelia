#!/usr/bin/env node
/**
 * Audit helper: mide los tamaños de los prompts base compartidos para
 * calcular el costo real de los meerkats. Correr con `node _smoke/measure-prompts.mjs`.
 */
import fs from 'node:fs';

const src = fs.readFileSync('src/lib/voice/rules.ts', 'utf8');

const names = ['HCP_FULL', 'HCP_CONCISE', 'CCP', 'CONVERSATIONAL_DNA', 'LITE_OPS', 'LITE_RULES', 'VOICE_RULES'];
const results = [];

for (const name of names) {
  const marker = `export const ${name} = \``;
  const start = src.indexOf(marker);
  if (start === -1) continue;
  const contentStart = start + marker.length;
  // Buscar el cierre `; o ` seguido de newline
  let i = contentStart;
  while (i < src.length - 1) {
    if (src[i] === '`' && src[i + 1] === ';') break;
    i++;
  }
  const content = src.slice(contentStart, i);
  results.push({ name, chars: content.length, tokens: Math.round(content.length / 3) });
}

console.log('=== Prompts en rules.ts ===');
for (const r of results) {
  console.log(`  ${r.name.padEnd(22)} ${r.chars.toString().padStart(6)} chars  ≈ ${r.tokens.toString().padStart(5)} tokens`);
}

const sumBy = (list) => results.filter((r) => list.includes(r.name)).reduce((a, r) => a + r.tokens, 0);
const fullShared    = sumBy(['CONVERSATIONAL_DNA', 'CCP', 'HCP_FULL',    'VOICE_RULES']);
const conciseShared = sumBy(['CONVERSATIONAL_DNA', 'CCP', 'HCP_CONCISE', 'VOICE_RULES']);
const liteShared    = sumBy(['CONVERSATIONAL_DNA', 'LITE_OPS', 'LITE_RULES']);

console.log('\n=== Composición por tier (sin añadir business context + tools) ===');
console.log(`  FULL    (DNA+CCP+HCP_FULL+VOICE_RULES):    ${fullShared} tokens`);
console.log(`  CONCISE (DNA+CCP+HCP_CONCISE+VOICE_RULES): ${conciseShared} tokens  (${Math.round((1 - conciseShared / fullShared) * 100)}% menos vs FULL)`);
console.log(`  LITE    (DNA+LITE_OPS+LITE_RULES):         ${liteShared} tokens  (${Math.round((1 - liteShared / fullShared) * 100)}% menos vs FULL)`);

// Costo mensual proyectado — datos reales del audit:
//   Sonnet 5.5 cache hit rate observado: 72%
//   Pricing: $3 in / $0.30 cr / $3.75 cw5m per MTok
const turnsPerMonth = 150 * 30;  // supuesto conservador 150 turnos/día
const hitRate = 0.72;
const costPerMonth = (toks) => {
  const noCache = toks * (1 - hitRate) * 3    / 1e6 * turnsPerMonth;
  const cached  = toks * hitRate       * 0.30 / 1e6 * turnsPerMonth;
  return noCache + cached;
};

console.log('\n=== Costo mensual proyectado (150 turnos/día × 30 días × 72% cache) ===');
console.log(`  FULL baseline:    $${costPerMonth(fullShared).toFixed(2)}/mes`);
console.log(`  CONCISE (hoy):    $${costPerMonth(conciseShared).toFixed(2)}/mes   (save $${(costPerMonth(fullShared) - costPerMonth(conciseShared)).toFixed(2)}/mes vs FULL)`);
console.log(`  LITE:             $${costPerMonth(liteShared).toFixed(2)}/mes   (save $${(costPerMonth(fullShared) - costPerMonth(liteShared)).toFixed(2)}/mes vs FULL)`);

console.log('\n=== Potencial del audit (recortar 30% fat en CONCISE) ===');
const target = Math.round(conciseShared * 0.70);
console.log(`  Target: ${target} tokens`);
console.log(`  Costo: $${costPerMonth(target).toFixed(2)}/mes`);
console.log(`  Ahorro adicional sobre CONCISE actual: $${(costPerMonth(conciseShared) - costPerMonth(target)).toFixed(2)}/mes`);
