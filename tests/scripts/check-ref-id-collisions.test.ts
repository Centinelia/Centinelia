/**
 * Tests para scripts/check-ref-id-collisions.mjs — el linter que
 * previene re-introducir el patrón del bug 2026-10-01 + 2026-10-05
 * (consumeAiOp duplicado con mismo source + reference_id = undercharge
 * silencioso por UNIQUE constraint collision).
 *
 * Estos tests fijan el comportamiento del linter para que:
 *   1. Detecte el patrón del bug con fixtures sintéticos (regression).
 *   2. No reporte false positives para single-call-site files ni para
 *      calls con reference_ids distintos.
 *   3. Confirme que la codebase actual (post-fix) está limpia.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRefIdCollisions, extractConsumeAiOpCalls } from '../../scripts/check-ref-id-collisions.mjs';

describe('check-ref-id-collisions linter', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'check-refid-'));
    await mkdir(join(root, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('extractConsumeAiOpCalls', () => {
    it('extrae source + reference_id de una llamada simple', () => {
      const src = `const r = await consumeAiOp(agentId, 1, { source: 'inbox', reference_id: id, label: 'x' });`;
      const calls = extractConsumeAiOpCalls(src);
      expect(calls).toHaveLength(1);
      expect(calls[0].source).toBe('inbox');
      expect(calls[0].reference_id).toBe('id');
    });

    it('captura template literals con sufijo', () => {
      const src = "const r = await consumeAiOp(a, 1, { source: 'inbox', reference_id: `${id}:tag`, label: 'x' });";
      const calls = extractConsumeAiOpCalls(src);
      expect(calls[0].reference_id).toBe('`${id}:tag`');
    });

    it('captura string literals como reference_id', () => {
      const src = `const r = await consumeAiOp(a, 1, { source: 'inbox', reference_id: 'fixed-id', label: 'x' });`;
      const calls = extractConsumeAiOpCalls(src);
      expect(calls[0].reference_id).toBe("'fixed-id'");
    });

    it('extrae varias llamadas del mismo file', () => {
      const src = `
        const a = await consumeAiOp(x, 1, { source: 's1', reference_id: id1, label: 'x' });
        const b = await consumeAiOp(x, 1, { source: 's2', reference_id: id2, label: 'x' });
      `;
      const calls = extractConsumeAiOpCalls(src);
      expect(calls).toHaveLength(2);
      expect(calls.map(c => c.source)).toEqual(['s1', 's2']);
    });
  });

  describe('detección de colisión (regression del bug)', () => {
    it('atrapa 2 call sites con mismo source y mismo reference_id', async () => {
      const src = `
        if (mode === 'A') {
          await consumeAiOp(agentId, 1, { source: 'inbox_processor', reference_id: emailId, label: 'x' });
        } else {
          await consumeAiOp(agentId, 1, { source: 'inbox_processor', reference_id: emailId, label: 'x' });
        }
      `;
      await writeFile(join(root, 'src/bug.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toHaveLength(1);
      expect(collisions[0]).toMatchObject({
        file: 'src/bug.ts',
        source: 'inbox_processor',
        reference_id: 'emailId',
      });
      expect(collisions[0].lines).toHaveLength(2);
    });

    it('atrapa el patrón exacto del bug 2026-10-05 (inbox autoMode)', async () => {
      // Fixture que replica el bug real que detectó el drift monitor:
      // 2 consumeAiOp en flows condicionales con mismo (source, ref_id).
      const src = `
        if (autoMode === 'observador') {
          const obsOps = await consumeAiOp(agentId, 1, { source: 'inbox_processor', reference_id: existingInboxId ?? rawMessageId, label: 'x' });
        }
        const result = autoMode === 'observador'
          ? { ok: false }
          : await consumeAiOp(agentId, 1, { source: 'inbox_processor', reference_id: existingInboxId ?? rawMessageId, label: 'x' });
      `;
      await writeFile(join(root, 'src/inbox.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toHaveLength(1);
      expect(collisions[0].source).toBe('inbox_processor');
      expect(collisions[0].reference_id).toBe('existingInboxId ?? rawMessageId');
    });

    it('atrapa colisión con string literal reference_id', async () => {
      const src = `
        await consumeAiOp(x, 1, { source: 's', reference_id: 'fixed', label: 'x' });
        await consumeAiOp(x, 1, { source: 's', reference_id: 'fixed', label: 'x' });
      `;
      await writeFile(join(root, 'src/literal.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toHaveLength(1);
      expect(collisions[0].reference_id).toBe("'fixed'");
    });
  });

  describe('no false positives', () => {
    it('no reporta cuando reference_id es distinto (sufijado)', async () => {
      // Este es el fix correcto del bug: sufijar con tag distintivo.
      const src = `
        await consumeAiOp(a, 1, { source: 'inbox', reference_id: \`\${id}:observador\`, label: 'x' });
        await consumeAiOp(a, 1, { source: 'inbox', reference_id: \`\${id}:processed\`, label: 'x' });
      `;
      await writeFile(join(root, 'src/fixed.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toEqual([]);
    });

    it('no reporta cuando source es distinto', async () => {
      const src = `
        await consumeAiOp(a, 1, { source: 'inbox', reference_id: id, label: 'x' });
        await consumeAiOp(a, 1, { source: 'voice', reference_id: id, label: 'x' });
      `;
      await writeFile(join(root, 'src/multi.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toEqual([]);
    });

    it('no reporta cuando solo hay 1 call site', async () => {
      const src = `await consumeAiOp(a, 1, { source: 'inbox', reference_id: id, label: 'x' });`;
      await writeFile(join(root, 'src/single.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toEqual([]);
    });

    it('ignora test files (.test.ts, .test.tsx)', async () => {
      const src = `
        await consumeAiOp(x, 1, { source: 's', reference_id: 'id', label: 'x' });
        await consumeAiOp(x, 1, { source: 's', reference_id: 'id', label: 'x' });
      `;
      await writeFile(join(root, 'src/foo.test.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toEqual([]);
    });

    it('no se engaña con consumeAiOp dentro de un comentario', async () => {
      const src = `
        // ejemplo en docs: consumeAiOp(x, 1, { source: 's', reference_id: 'id' });
        /* consumeAiOp(x, 1, { source: 's', reference_id: 'id' }); */
        await consumeAiOp(x, 1, { source: 's', reference_id: realId, label: 'x' });
      `;
      await writeFile(join(root, 'src/comments.ts'), src);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')] });
      expect(collisions).toEqual([]);
    });

    it('respeta el allowList', async () => {
      const src = `
        await consumeAiOp(x, 1, { source: 's', reference_id: 'id', label: 'x' });
        await consumeAiOp(x, 1, { source: 's', reference_id: 'id', label: 'x' });
      `;
      await writeFile(join(root, 'src/allowed.ts'), src);
      const allowList = new Set(['src/allowed.ts']);
      const collisions = await findRefIdCollisions({ root, targets: [join(root, 'src')], allowList });
      expect(collisions).toEqual([]);
    });
  });

  describe('red de contención contra codebase real', () => {
    it('la codebase actual pasa el linter (0 colisiones)', async () => {
      // Si alguien re-introduce el patrón en el repo real (en inbox-processor
      // o en cualquier otro archivo nuevo), este test falla y bloquea el merge.
      const repoRoot = join(__dirname, '..', '..');
      const collisions = await findRefIdCollisions({
        root: repoRoot,
        targets: [join(repoRoot, 'src')],
      });
      expect(collisions).toEqual([]);
    });
  });
});
