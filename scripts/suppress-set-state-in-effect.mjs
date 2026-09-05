#!/usr/bin/env node
// One-shot script: adds `// eslint-disable-next-line react-hooks/set-state-in-effect`
// on the line preceding every occurrence flagged by ESLint in src/.
//
// Reason: rule shipped in a new eslint-config-next release, flagged 81 pre-existing
// fetch-on-mount patterns with zero prod impact. This suppresses the noise so real
// errors surface. Long-term fix is Server Components / SWR refactor per file.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const RULE = 'react-hooks/set-state-in-effect';

// eslint exits non-zero when it finds errors — that's expected. Capture stdout regardless.
let raw;
try {
  raw = execSync('npx eslint src --format=json', {
    encoding: 'utf-8',
    maxBuffer: 200 * 1024 * 1024,
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (err) {
  raw = err.stdout;
  if (!raw) {
    console.error('eslint failed to produce output:', err.message);
    process.exit(1);
  }
}

const results = JSON.parse(raw);

// Map filePath -> sorted set of line numbers to suppress.
const perFile = new Map();
for (const r of results) {
  for (const m of r.messages) {
    if (m.ruleId !== RULE) continue;
    if (!perFile.has(r.filePath)) perFile.set(r.filePath, new Set());
    perFile.get(r.filePath).add(m.line);
  }
}

let filesTouched = 0;
let linesAdded   = 0;

for (const [filePath, lineSet] of perFile) {
  const lines = readFileSync(filePath, 'utf-8').split(/\r?\n/);

  // Insert from highest line number to lowest so earlier inserts don't shift later ones.
  const sortedLines = [...lineSet].sort((a, b) => b - a);

  for (const lineNum of sortedLines) {
    // ESLint line numbers are 1-based. The comment goes ABOVE lineNum, i.e. at index lineNum-1 in the array (which shifts the flagged line down by 1).
    const targetIdx = lineNum - 1;
    const target    = lines[targetIdx] ?? '';
    const indent    = target.match(/^\s*/)?.[0] ?? '';
    const comment   = `${indent}// eslint-disable-next-line ${RULE}`;

    // Skip if the line above is already the same disable comment (idempotent).
    const above = lines[targetIdx - 1] ?? '';
    if (above.trim() === `// eslint-disable-next-line ${RULE}`) continue;

    lines.splice(targetIdx, 0, comment);
    linesAdded += 1;
  }

  writeFileSync(filePath, lines.join('\n'), 'utf-8');
  filesTouched += 1;
}

console.log(`Files touched: ${filesTouched}`);
console.log(`Disable comments added: ${linesAdded}`);
