import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasNewSignalsForNash } from '../nash-runner';

const { mockLlmCount, mockFloor, mockBugCount, mockInboxCount, mockHfCount, mockTasksCount, mockPendingCount, mockLlmSinceCapture } = vi.hoisted(() => ({
  mockLlmCount:      vi.fn(),
  mockFloor:         vi.fn(),
  mockBugCount:      vi.fn(),
  mockInboxCount:    vi.fn(),
  mockHfCount:       vi.fn(),
  mockTasksCount:    vi.fn(),
  mockPendingCount:  vi.fn(),
  mockLlmSinceCapture: vi.fn(),
}));

function makeSupa() {
  return {
    from: (table: string) => {
      if (table === 'nash_error_floor') {
        return {
          select: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => mockFloor(),
              }),
            }),
          }),
        };
      }
      if (table === 'llm_call_log') {
        return {
          select: () => ({
            not: () => ({
              gte: (col: string, val: string) => {
                mockLlmSinceCapture(val);
                return { then: (r: any) => r({ count: mockLlmCount(), error: null }) };
              },
            }),
          }),
        };
      }
      if (table === 'tool_call_log') {
        return { select: () => ({ eq: () => ({ gte: () => ({ then: (r: any) => r({ count: mockBugCount(), error: null }) }) }) }) };
      }
      if (table === 'ops_inbox') {
        return { select: () => ({ eq: () => ({ lt: () => ({ then: (r: any) => r({ count: mockInboxCount(), error: null }) }) }) }) };
      }
      if (table === 'handoff_failed_responses') {
        return { select: () => ({ is: () => ({ gte: () => ({ then: (r: any) => r({ count: mockHfCount(), error: null }) }) }) }) };
      }
      if (table === 'agent_tasks') {
        return { select: () => ({ eq: () => ({ gte: () => ({ then: (r: any) => r({ count: mockTasksCount(), error: null }) }) }) }) };
      }
      if (table === 'platform_incidents') {
        return { select: () => ({ in: () => ({ then: (r: any) => r({ count: mockPendingCount(), error: null }) }) }) };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as Parameters<typeof hasNewSignalsForNash>[0];
}

beforeEach(() => {
  mockLlmCount.mockReset();
  mockFloor.mockReset();
  mockBugCount.mockReset();
  mockInboxCount.mockReset();
  mockHfCount.mockReset();
  mockTasksCount.mockReset();
  mockPendingCount.mockReset();
  mockLlmSinceCapture.mockReset();
  mockBugCount.mockReturnValue(0);
  mockInboxCount.mockReturnValue(0);
  mockHfCount.mockReturnValue(0);
  mockTasksCount.mockReturnValue(0);
  mockPendingCount.mockReturnValue(0);
});

describe('hasNewSignalsForNash — error floor', () => {
  it('sin floor en DB → usa sinceIso directo para llm_call_log', async () => {
    mockFloor.mockResolvedValue({ data: null, error: null });
    mockLlmCount.mockReturnValue(0);
    const since = new Date('2026-09-29T00:00:00Z');

    await hasNewSignalsForNash(makeSupa(), since);

    expect(mockLlmSinceCapture).toHaveBeenCalledWith(since.toISOString());
  });

  it('floor > since → usa floor.toISOString() para llm_call_log', async () => {
    const floor = '2026-09-29T15:40:00.000Z';
    mockFloor.mockResolvedValue({ data: { floor_timestamp: floor }, error: null });
    mockLlmCount.mockReturnValue(0);
    const since = new Date('2026-09-29T00:00:00Z');   // más viejo que floor

    await hasNewSignalsForNash(makeSupa(), since);

    expect(mockLlmSinceCapture).toHaveBeenCalledWith(floor);
  });

  it('floor < since → usa sinceIso (más reciente gana)', async () => {
    mockFloor.mockResolvedValue({ data: { floor_timestamp: '2026-09-01T00:00:00Z' }, error: null });
    mockLlmCount.mockReturnValue(0);
    const since = new Date('2026-09-29T18:00:00Z');   // más reciente que floor

    await hasNewSignalsForNash(makeSupa(), since);

    expect(mockLlmSinceCapture).toHaveBeenCalledWith(since.toISOString());
  });

  it('regression 2026-09-29: floor 15:40 UTC evita contar errores 13:00-13:45 UTC pre-fix', async () => {
    // Simulación: cron nash_last_run_at = 12:00 UTC → 480 errores pre-fix acumulados.
    // Con floor 15:40, Nash cuenta errores desde 15:40 hacia adelante = 0.
    mockFloor.mockResolvedValue({ data: { floor_timestamp: '2026-09-29T15:40:00.000Z' }, error: null });
    mockLlmCount.mockReturnValue(0);   // 0 errores post-floor
    const since = new Date('2026-09-29T12:00:00Z');

    const result = await hasNewSignalsForNash(makeSupa(), since);

    expect(mockLlmSinceCapture).toHaveBeenCalledWith('2026-09-29T15:40:00.000Z');
    expect(result.error_logs).toBe(0);
    expect(result.hasWork).toBe(false);
  });

  it('otras señales (bug_reports, handoffs) NO se filtran por el floor', async () => {
    mockFloor.mockResolvedValue({ data: { floor_timestamp: '2026-09-29T15:40:00.000Z' }, error: null });
    mockBugCount.mockReturnValue(3);   // bug_reports son señales legítimas siempre
    mockLlmCount.mockReturnValue(0);
    const since = new Date('2026-09-29T12:00:00Z');

    const result = await hasNewSignalsForNash(makeSupa(), since);

    expect(result.bug_reports).toBe(3);
    expect(result.hasWork).toBe(true);
  });
});
