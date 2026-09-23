import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { embedText, embedTexts } from '../embed';

describe('embed (mock mode)', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env.MOCK_EMBEDDINGS = '1';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('devuelve vector 1536-dim para un texto', async () => {
    const vec = await embedText('hola mundo');
    expect(vec).toHaveLength(1536);
    expect(vec.every((v) => typeof v === 'number' && Number.isFinite(v))).toBe(true);
  });

  it('vector determinístico: mismo texto → mismo vector', async () => {
    const [a, b] = await embedTexts(['pago del predial', 'pago del predial']);
    expect(a).toEqual(b);
  });

  it('vector diferente para textos distintos', async () => {
    const [a, b] = await embedTexts(['predial', 'multas de tránsito']);
    expect(a).not.toEqual(b);
  });

  it('embedTexts([]) devuelve []', async () => {
    const out = await embedTexts([]);
    expect(out).toEqual([]);
  });

  it('procesa batch grande (>96) en múltiples requests', async () => {
    const texts = Array.from({ length: 200 }, (_, i) => `chunk número ${i}`);
    const out = await embedTexts(texts);
    expect(out).toHaveLength(200);
    expect(out[0]).toHaveLength(1536);
    expect(out[199]).toHaveLength(1536);
  });

  it('vector normalizado (magnitud ≈ 1) — cosine ready', async () => {
    const vec = await embedText('cualquier texto');
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1, 5);
  });
});
