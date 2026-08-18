/**
 * retry.test.ts — Tests unitarios para retryWithBackoff.
 *
 * Cubre:
 *   - 1 fallo transiente seguido de exito al segundo intento.
 *   - 3 fallos consecutivos -> propaga el ultimo error.
 *   - Exito en el primer intento (sin reintentos).
 */

import { describe, it, expect, vi } from 'vitest';
import { retryWithBackoff } from '../retry';

// Override sleep para que los tests no esperen delays reales.
vi.mock('../retry', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../retry')>();
  return {
    ...mod,
    // Re-export as-is; we shorten delays via fake timers instead.
  };
});

describe('retryWithBackoff', () => {
  it('exito en el primer intento, sin reintentos', async () => {
    const fn = vi.fn().mockResolvedValueOnce('ok');

    const result = await retryWithBackoff(fn, { initialDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('1 fallo transiente -> 1 reintento -> success', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('recovered');

    const result = await retryWithBackoff(fn, { initialDelayMs: 1, maxDelayMs: 5 });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('3 fallos -> propaga el ultimo error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockRejectedValueOnce(new Error('fail3'));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 }),
    ).rejects.toThrow('fail3');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respeta maxAttempts=1 (sin reintentos)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('only once'));

    await expect(
      retryWithBackoff(fn, { maxAttempts: 1, initialDelayMs: 1 }),
    ).rejects.toThrow('only once');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('el resultado exitoso se propaga correctamente', async () => {
    const expected = { data: 42, error: null };
    const fn = vi.fn().mockResolvedValue(expected);

    const result = await retryWithBackoff(fn, { initialDelayMs: 1 });

    expect(result).toEqual(expected);
  });
});
