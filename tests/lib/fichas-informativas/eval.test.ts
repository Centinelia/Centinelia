/**
 * Tests unitarios para src/lib/fichas-informativas/eval.ts.
 * Stub en Fase 4 — infra completa en Fase 8.
 */
import { describe, it, expect } from 'vitest';
import { evalRetrievalRecall } from '@/lib/fichas-informativas/eval';

describe('evalRetrievalRecall', () => {
  it('retorna recall_at_5=0 y precision_at_5=0 con array vacío (stub Fase 4)', async () => {
    const result = await evalRetrievalRecall([]);
    expect(result).toEqual({ recall_at_5: 0, precision_at_5: 0 });
  });
});
