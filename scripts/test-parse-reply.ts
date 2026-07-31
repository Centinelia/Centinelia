// scripts/test-parse-reply.ts
// Run with: npx tsx scripts/test-parse-reply.ts
// Exits 0 on all pass, 1 on any fail.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReplyBody } from '../src/lib/human-handoff/parse-reply';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'src', 'lib', 'human-handoff', 'parse-reply.fixtures');

const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.input.txt'));
let pass = 0;
let fail = 0;

for (const inputFile of files) {
  const name = inputFile.replace('.input.txt', '');
  const input = readFileSync(join(FIXTURES_DIR, inputFile), 'utf8');
  const expected = readFileSync(join(FIXTURES_DIR, `${name}.expected.txt`), 'utf8').trim();
  const { cleanText } = parseReplyBody(input);

  if (cleanText.trim() === expected) {
    console.log(`  PASS  ${name}`);
    pass++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    got:      ${JSON.stringify(cleanText)}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
