/**
 * Tests para scripts/check-llm-logging.mjs — el linter que enforza
 * que toda llamada al SDK Anthropic pase por `logLlmCall`.
 *
 * Regresión: el linter v1 solo cubría `.messages.create` en `src/`.
 * Dejó pasar:
 *   - `.messages.stream` (voice/llm, portal chat, demo meefi, generate-kb)
 *   - archivos en `scripts/` (scripts/eval/* corriendo evals manuales)
 * Resultado: $28 USD de gap no loggeado en 30 días.
 *
 * Estos tests fijan el comportamiento post-fix 2026-10-05.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findUnloggedCallSites } from '../../scripts/check-llm-logging.mjs';

describe('check-llm-logging linter', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'check-llm-'));
    await mkdir(join(root, 'src'),     { recursive: true });
    await mkdir(join(root, 'scripts'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('regression: patrones que el linter v1 dejaba pasar', () => {
    it('atrapa .messages.stream sin logLlmCall en src/', async () => {
      await writeFile(join(root, 'src/some-route.ts'),
        `const stream = anthropic.messages.stream({ model: 'x' });`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'src')] });
      expect(violations).toContain('src/some-route.ts');
    });

    it('atrapa .messages.create sin logLlmCall en scripts/', async () => {
      await writeFile(join(root, 'scripts/some-eval.ts'),
        `const resp = await anthropic.messages.create({ model: 'x' });`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'scripts')] });
      expect(violations).toContain('scripts/some-eval.ts');
    });

    it('atrapa .messages.stream sin logLlmCall en scripts/ (ambos huecos juntos)', async () => {
      await writeFile(join(root, 'scripts/stream-script.ts'),
        `const s = client.messages.stream({ messages: [] });`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'scripts')] });
      expect(violations).toContain('scripts/stream-script.ts');
    });
  });

  describe('aceptación: patrones correctos pasan', () => {
    it('no reporta violación cuando el archivo tiene logLlmCall', async () => {
      await writeFile(join(root, 'src/ok.ts'),
        `const resp = await anthropic.messages.create({ model: 'x' });
         void logLlmCall({ source: 'x', model: 'x', usage: resp.usage });`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'src')] });
      expect(violations).not.toContain('src/ok.ts');
    });

    it('no reporta archivos que no llaman al SDK', async () => {
      await writeFile(join(root, 'src/other.ts'), `export const x = 1;`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'src')] });
      expect(violations).not.toContain('src/other.ts');
    });

    it('respeta el allowList', async () => {
      await writeFile(join(root, 'scripts/allowed.ts'),
        `const resp = await anthropic.messages.create({});`);
      const allowList = new Set(['scripts/allowed.ts']);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'scripts')], allowList });
      expect(violations).not.toContain('scripts/allowed.ts');
    });
  });

  describe('robustez', () => {
    it('no se engaña con un .messages.create dentro de un comentario de bloque', async () => {
      await writeFile(join(root, 'src/comment-block.ts'),
        `/* ejemplo en docs: anthropic.messages.create({}) */
         export const x = 1;`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'src')] });
      expect(violations).not.toContain('src/comment-block.ts');
    });

    it('no se engaña con un .messages.create dentro de un comentario de línea', async () => {
      await writeFile(join(root, 'src/comment-line.ts'),
        `// anthropic.messages.create({}) — ejemplo
         export const x = 1;`);
      const { violations } = await findUnloggedCallSites({ root, targets: [join(root, 'src')] });
      expect(violations).not.toContain('src/comment-line.ts');
    });
  });

  describe('regresión real contra codebase', () => {
    it('la codebase actual pasa el linter completo (0 violaciones)', async () => {
      // Este test corre el linter contra el repo real. Si alguien agrega
      // un .messages.create o .stream sin logLlmCall en src/ o scripts/,
      // falla y bloquea el merge. Es nuestra red de contención.
      const repoRoot = join(__dirname, '..', '..');
      const { violations } = await findUnloggedCallSites({
        root: repoRoot,
        targets: [join(repoRoot, 'src'), join(repoRoot, 'scripts')],
      });
      expect(violations).toEqual([]);
    });
  });
});
