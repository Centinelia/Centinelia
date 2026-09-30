import { describe, it, expect, vi } from 'vitest';
import { detectDedupAnomalies } from '../dedup-drift';

function mockSupa(state: { agents: { id: string }[]; countsByRange: number[]; }) {
  let callIdx = 0;
  const chain = {
    select: () => chain,
    eq:     () => chain,
    in:     () => chain,
    gte:    () => chain,
    lt:     () => chain,
    then:   (resolve: (v: unknown) => void) => resolve({
      data:  state.agents,
      count: state.countsByRange[callIdx++] ?? 0,
      error: null,
    }),
  };
  return { from: () => chain } as unknown as Parameters<typeof detectDedupAnomalies>[0];
}

describe('detectDedupAnomalies', () => {
  it('spike >3x baseline → devuelve anomaly type=spike', async () => {
    const supa = mockSupa({
      agents: [{ id: 'a1' }],
      countsByRange: [
        [{ id: 'a1' }] as unknown as number,   // agents fetch
        200,                                     // current week
        [{ id: 'a1' }] as unknown as number,
        50,                                      // baseline (avg = 12.5)
        [{ id: 'a1' }] as unknown as number,
        150,                                     // last24
      ] as unknown as number[],
    });
    const anomalies = await detectDedupAnomalies(supa, 'x@y.mx');
    const spike = anomalies.find(a => a.type === 'spike');
    expect(spike).toBeDefined();
    expect(spike?.ratio).toBeGreaterThan(3);
  });

  it('sin volumen → no dispara anomaly', async () => {
    const supa = mockSupa({
      agents: [{ id: 'a1' }],
      countsByRange: [
        [{ id: 'a1' }] as unknown as number,
        5,   // current week (bajo el min)
        [{ id: 'a1' }] as unknown as number,
        5,
        [{ id: 'a1' }] as unknown as number,
        1,
      ] as unknown as number[],
    });
    const anomalies = await detectDedupAnomalies(supa, 'x@y.mx');
    expect(anomalies).toEqual([]);
  });

  it('cero hits en 24h con volumen histórico alto → devuelve cero_hits', async () => {
    const supa = mockSupa({
      agents: [{ id: 'a1' }],
      countsByRange: [
        [{ id: 'a1' }] as unknown as number,
        100,   // current week
        [{ id: 'a1' }] as unknown as number,
        1400,  // baseline (avg 350/semana = 50/día → arriba del min)
        [{ id: 'a1' }] as unknown as number,
        0,     // last 24h
      ] as unknown as number[],
    });
    const anomalies = await detectDedupAnomalies(supa, 'x@y.mx');
    const cero = anomalies.find(a => a.type === 'cero_hits');
    expect(cero).toBeDefined();
  });
});
