import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpcSelect, mockRpcInsert, mockOrgFlag } = vi.hoisted(() => ({
  mockRpcSelect: vi.fn(),
  mockRpcInsert: vi.fn(),
  mockOrgFlag:   vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { dedup_middleware_enabled: mockOrgFlag() } }),
            }),
          }),
        };
      }
      if (table === 'tool_call_dedup') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gt: () => ({
                    order: () => ({
                      limit: () => ({
                        maybeSingle: async () => mockRpcSelect(),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: async (row: unknown) => mockRpcInsert(row),
        };
      }
      return {};
    },
  }),
}));

beforeEach(() => {
  mockRpcSelect.mockReset();
  mockRpcInsert.mockReset();
  mockOrgFlag.mockReset();
  mockOrgFlag.mockReturnValue(true);
  mockRpcSelect.mockResolvedValue({ data: null, error: null });
  mockRpcInsert.mockResolvedValue({ data: null, error: null });
});

const baseCtx = {
  agentId:     'agent-1',
  portalEmail: 'x@y.mx',
  toolName:    'registrar_incidencia',
  args:        { contact_phone: '8129262462', business_name: 'Tecate' },
  channel:     'voice' as const,
  toolCallId:  'call_abc',
};

describe('withDedup', () => {
  it('miss → ejecuta handler, INSERT, retorna resultado', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true, id: 'inc-1' }));

    const result = await withDedup(baseCtx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(mockRpcInsert).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, id: 'inc-1' });
  });

  it('hit dentro de ventana → retorna cached, NO ejecuta handler', async () => {
    mockRpcSelect.mockResolvedValue({
      data: { result_json: { ok: true, id: 'inc-original' } },
      error: null,
    });
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true, id: 'wrong' }));

    const result = await withDedup(baseCtx, handler);

    expect(handler).not.toHaveBeenCalled();
    expect(mockRpcInsert).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, id: 'inc-original' });
  });

  it('flag OFF en org → no toca la tabla, ejecuta handler directo', async () => {
    mockOrgFlag.mockReturnValue(false);
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup(baseCtx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(mockRpcSelect).not.toHaveBeenCalled();
    expect(mockRpcInsert).not.toHaveBeenCalled();
  });

  it('config disable:true → skip completo aunque flag ON', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup({ ...baseCtx, toolName: 'reportar_falla' }, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(mockRpcSelect).not.toHaveBeenCalled();
  });

  it('SELECT falla → fail-open: ejecuta handler + log warning', async () => {
    mockRpcSelect.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    const result = await withDedup(baseCtx, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/fail-open/),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('INSERT falla → fail-open: retorna resultado sin cachear + log warning', async () => {
    mockRpcInsert.mockResolvedValue({ data: null, error: { message: 'insert failed' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true, id: 'inc-1' }));

    const result = await withDedup(baseCtx, handler);

    expect(result).toEqual({ ok: true, id: 'inc-1' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('handler throw → NO se inserta row (retry del modelo re-ejecuta)', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => { throw new Error('handler boom'); });

    await expect(withDedup(baseCtx, handler)).rejects.toThrow('handler boom');
    expect(mockRpcInsert).not.toHaveBeenCalled();
  });

  it('cross-agent: mismos args pero agent_id distinto → cache separado', async () => {
    mockRpcSelect.mockResolvedValue({ data: null, error: null });
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup({ ...baseCtx, agentId: 'agent-2' }, handler);

    expect(mockRpcSelect).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('INSERT contiene tool_call_id + channel + expires_at futuros', async () => {
    const { withDedup } = await import('../with-dedup');
    const handler = vi.fn(async () => ({ ok: true }));

    await withDedup(baseCtx, handler);

    expect(mockRpcInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id:     'agent-1',
        tool_name:    'registrar_incidencia',
        channel:      'voice',
        tool_call_id: 'call_abc',
        result_json:  { ok: true },
        expires_at:   expect.any(String),
      }),
    );
    const call = mockRpcInsert.mock.calls[0][0] as { expires_at: string };
    expect(new Date(call.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('logs hit para trace observability', async () => {
    mockRpcSelect.mockResolvedValue({
      data: { result_json: { ok: true } },
      error: null,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { withDedup } = await import('../with-dedup');
    await withDedup(baseCtx, vi.fn(async () => ({ ok: true, id: 'wrong' })));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[dedup\] hit/),
      expect.anything(),
    );
    logSpy.mockRestore();
  });
});
