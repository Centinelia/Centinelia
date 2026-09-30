import { describe, it, expect } from 'vitest';
import { detectEmailJobsAnomalies } from '../email-jobs-drift';

function mockSupa(counts: { stuck: number; failed: number; total: number }) {
  let callIdx = 0;
  const chain = {
    select: () => chain,
    eq:     () => chain,
    in:     () => chain,
    gte:    () => chain,
    lt:     () => chain,
    then:   (resolve: (v: unknown) => void) => {
      const seq = [
        // 1. agents fetch
        [{ id: 'a1' }],
        // 2. stuck count
        counts.stuck,
        // 3. agents fetch again
        [{ id: 'a1' }],
        // 4. failed count
        counts.failed,
        // 5. agents fetch again
        [{ id: 'a1' }],
        // 6. total count
        counts.total,
      ];
      const v = seq[callIdx++];
      resolve(Array.isArray(v)
        ? { data: v, count: null, error: null }
        : { data: [], count: v, error: null });
    },
  };
  return { from: () => chain } as unknown as Parameters<typeof detectEmailJobsAnomalies>[0];
}

describe('detectEmailJobsAnomalies', () => {
  it('sin jobs stuck ni failed → array vacío', async () => {
    const supa = mockSupa({ stuck: 0, failed: 0, total: 50 });
    expect(await detectEmailJobsAnomalies(supa, 'x@y.mx')).toEqual([]);
  });

  it('3+ jobs stuck > 10 min → anomaly type=stuck', async () => {
    const supa = mockSupa({ stuck: 5, failed: 0, total: 50 });
    const anomalies = await detectEmailJobsAnomalies(supa, 'x@y.mx');
    expect(anomalies).toContainEqual(expect.objectContaining({
      type: 'stuck', count: 5,
    }));
  });

  it('failure rate > 20% con total >= 5 → anomaly type=failure_spike', async () => {
    const supa = mockSupa({ stuck: 0, failed: 3, total: 10 });
    const anomalies = await detectEmailJobsAnomalies(supa, 'x@y.mx');
    expect(anomalies).toContainEqual(expect.objectContaining({
      type: 'failure_spike',
    }));
  });

  it('failure rate > 20% pero total < 5 → NO anomaly (muestra chica)', async () => {
    const supa = mockSupa({ stuck: 0, failed: 2, total: 4 });
    const anomalies = await detectEmailJobsAnomalies(supa, 'x@y.mx');
    expect(anomalies.find(a => a.type === 'failure_spike')).toBeUndefined();
  });
});
