// Regression: prevent SOURCE_META gaps in HistorialConsumoSection.
//
// Every literal `source: '...'` passed to consumeAiOp() in src/ must have a
// matching entry in SOURCE_META, otherwise the row renders as "Consumo sin
// identificar" and the ledger audit breaks — the #1 priority per
// [[feedback-pool-accuracy-top-priority]].
//
// This test scans the codebase for consumeAiOp(...) calls, extracts the
// literal source string, and asserts each one is mapped. Dynamic sources
// (`source: someVar`) are skipped by design — those must be reviewed by
// eye when merged.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CWD = process.cwd();
const SRC_DIR = join(CWD, 'src');
const HISTORIAL_PATH = join(CWD, 'src', 'app', 'portal', '[token]', 'HistorialConsumoSection.tsx');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full, out);
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts') && !entry.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

function extractSourceMetaKeys(): Set<string> {
  const content = readFileSync(HISTORIAL_PATH, 'utf-8');
  const bodyMatch = content.match(/const SOURCE_META[^=]*=\s*\{([\s\S]+?)^\};/m);
  if (!bodyMatch) throw new Error(`Could not locate SOURCE_META in ${HISTORIAL_PATH}`);
  const body = bodyMatch[1];
  const keys = new Set<string>();
  const keyRe = /^\s+([a-z_][a-z0-9_]*)\s*:\s*\{\s*label\s*:/gim;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(body)) !== null) keys.add(m[1]);
  return keys;
}

function extractConsumedSources(): Map<string, string[]> {
  const files = walk(SRC_DIR);
  const found = new Map<string, string[]>();
  const callRe = /consumeAiOp\s*\([\s\S]{0,800}?source\s*:\s*['"]([a-z_][a-z0-9_]*)['"]/g;
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let m: RegExpExecArray | null;
    while ((m = callRe.exec(content)) !== null) {
      const src = m[1];
      const rel = file.replace(CWD, '').replace(/\\/g, '/');
      const arr = found.get(src) ?? [];
      arr.push(rel);
      found.set(src, arr);
    }
  }
  return found;
}

describe('SOURCE_META coverage regression', () => {
  it('every literal source used in consumeAiOp() is mapped in SOURCE_META', () => {
    const keys = extractSourceMetaKeys();
    const sources = extractConsumedSources();
    expect(keys.size, 'SOURCE_META should have entries').toBeGreaterThan(10);
    expect(sources.size, 'consumeAiOp usages should be discoverable').toBeGreaterThan(10);

    const missing: string[] = [];
    for (const [src, files] of sources.entries()) {
      if (!keys.has(src)) {
        missing.push(`  ${src}\n${files.map(f => `      ← ${f}`).join('\n')}`);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `SOURCE_META gap — estas sources renderizarán como "Consumo sin identificar":\n\n${missing.join('\n')}\n\n` +
        `Agregá el mapping en src/app/portal/[token]/HistorialConsumoSection.tsx.`,
      );
    }
  });

  it('consultar_contacto no cobra (es read, regla work-based)', () => {
    // Guardrail contra la regresión que este PR arregla: consultar_contacto
    // no debe volver a llamar consumeAiOp. Reads no cobran per
    // [[feedback-pool-work-based]] — consistente con consultar_factura,
    // consultar_cliente, etc.
    const executor = readFileSync(join(CWD, 'src', 'lib', 'tools', 'executor.ts'), 'utf-8');
    // Localiza el bloque `if (toolName === 'consultar_contacto')` … cierre.
    const blockRe = /if \(toolName === 'consultar_contacto'\)[\s\S]*?(?=if \(toolName === 'registrar_interaccion'\))/;
    const block = executor.match(blockRe);
    expect(block, 'consultar_contacto branch should exist in executor').not.toBeNull();
    expect(block![0]).not.toMatch(/consumeAiOp/);
  });
});
