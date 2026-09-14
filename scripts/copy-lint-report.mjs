#!/usr/bin/env node
/**
 * Reporta todas las violaciones actuales del copy-lint. Útil para ir bajando
 * el baseline sistemáticamente.
 *
 * Uso: node scripts/copy-lint-report.mjs [emDash|emoji|iaWord]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const RULES = {
  emDash: /—/u,
  emoji:  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}]/u,
  iaWord: /\bIA\b/,
};

const VISIBLE_PROPS = ['title', 'tooltip', 'placeholder', 'aria-label', 'alt', 'description', 'label', 'subtitle', 'summary'];

const IA_ALLOWLIST = [
  /src[\\/]app[\\/]\(landing\)[\\/]/,
  /src[\\/]app[\\/]landing[\\/]/,
  /src[\\/]app[\\/]\(marketing\)[\\/]/,
  /src[\\/]app[\\/]legal[\\/]/,
  /src[\\/]lib[\\/]contract[\\/]/,
];

const EM_DASH_ALLOWLIST = [
  /src[\\/]app[\\/]legal[\\/]/,
  /src[\\/]lib[\\/]contract[\\/]/,
];

function isAllowlisted(file, rule) {
  const list = rule === 'iaWord' ? IA_ALLOWLIST
             : rule === 'emDash' ? EM_DASH_ALLOWLIST
             : [];
  return list.some(re => re.test(file));
}

function walkTsx(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = readdirSync(cur); } catch { continue; }
    for (const name of entries) {
      const full = join(cur, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === '__tests__') continue;
        stack.push(full);
      } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
        out.push(full);
      }
    }
  }
  return out;
}

function extract(src) {
  const out = new Map();
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = noBlock.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const commentIdx = line.indexOf('//');
    if (commentIdx >= 0) {
      const before = line.slice(0, commentIdx);
      const quotes = (before.match(/["']/g) || []).length;
      if (quotes % 2 === 0) line = before;
    }
    const jsxText = Array.from(line.matchAll(/>([^<>]{2,})</g));
    const props = VISIBLE_PROPS.flatMap(p =>
      Array.from(line.matchAll(new RegExp(`${p}=(?:"([^"]+)"|'([^']+)'|\\{[\`']([^\`']+)[\`']\\})`, 'g')))
    );
    const parts = [];
    for (const m of jsxText) parts.push(m[1]);
    for (const m of props)   parts.push(m[1] || m[2] || '');
    if (parts.length > 0) out.set(i + 1, parts.join(' | '));
  }
  return out;
}

const filter = process.argv[2];
const SRC = join(process.cwd(), 'src');
const files = walkTsx(SRC);

const buckets = { emDash: [], emoji: [], iaWord: [] };
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const cands = extract(src);
  for (const [line, text] of cands) {
    for (const rule of Object.keys(RULES)) {
      if (isAllowlisted(file, rule)) continue;
      if (RULES[rule].test(text)) {
        buckets[rule].push({ file: file.replace(SRC + sep, 'src' + sep), line, snippet: text.slice(0, 120) });
      }
    }
  }
}

const rules = filter ? [filter] : Object.keys(buckets);
for (const rule of rules) {
  console.log(`\n=== ${rule} (${buckets[rule].length}) ===`);
  for (const v of buckets[rule]) {
    console.log(`${v.file}:${v.line}  ${v.snippet}`);
  }
}
