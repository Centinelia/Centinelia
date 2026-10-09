#!/usr/bin/env node
/**
 * Mide cada bloque estático del prompt-builder para ver dónde está el fat
 * en el system prompt real que se le manda a Vapi por turno.
 */
import fs from 'node:fs';

const src = fs.readFileSync('src/lib/voice/prompt-builder.ts', 'utf8');

// Extrae todas las `const NAME = \`...\`;` top-level y mide
const re = /^const (\w+) = `/gm;
const blocks = [];
let m;
while ((m = re.exec(src)) !== null) {
  const name = m[1];
  const start = m.index + m[0].length;
  let i = start;
  while (i < src.length - 1) {
    if (src[i] === '`' && src[i + 1] === ';') break;
    i++;
  }
  const content = src.slice(start, i);
  blocks.push({ name, chars: content.length, tokens: Math.round(content.length / 3) });
}

blocks.sort((a, b) => b.chars - a.chars);

console.log('=== Bloques estáticos en prompt-builder.ts (ordenados por tamaño) ===\n');
let total = 0;
for (const b of blocks) {
  console.log(`  ${b.name.padEnd(40)} ${b.chars.toString().padStart(6)} chars  ≈ ${b.tokens.toString().padStart(5)} tokens`);
  total += b.tokens;
}
console.log(`\n  TOTAL blocks estáticos:                  ≈ ${total} tokens`);

// Suma con el shared rules (CONCISE tier default)
console.log('\n=== Composición típica del system prompt de un meerkat ===');
console.log('  Depende de qué blocks el builder incluye. Lo veremos ejecutándolo.');
