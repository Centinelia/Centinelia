/**
 * Tests para defineCron — wrapper de crons.
 *
 * Cubre:
 *  - Auth CRON_SECRET (401 sin bearer, 401 con wrong bearer)
 *  - Handler recibe ctx tipado (supabase, now, log)
 *  - Status classification: ok / partial / error / timeout
 *  - Alert dispara en partial y error, NO en ok
 *  - silenceAlerts=true no dispara alert aunque haya partial
 *  - Timeout soft: maxDuration excedido → status=timeout
 *  - cron_runs write (best-effort, no rompe si tabla no existe)
 *  - Response shape consistente
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
} from '@/lib/portal/__tests__/test-utils';
import {
  CRON_SECRET_FIXTURE,
  makeCronRequest,
  makeCronRequestUnauthorized,
  setCronSecret,
} from './test-utils';

const {
  mockCreateAdminClient,
  mockAlertPartialFailure,
} = vi.hoisted(() => ({
  mockCreateAdminClient:   vi.fn(),
  mockAlertPartialFailure: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('../alert-partial-failure', () => ({
  alertCronPartialFailure: mockAlertPartialFailure,
  errorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
}));

import { defineCron } from '../define-cron';

let supabase: ReturnType<typeof createSupabaseMock>;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockAlertPartialFailure.mockResolvedValue(undefined);
  setCronSecret();
  // cron_runs insert + update — nuestros defaults exitosos
  supabase.setNextResult({ data: { id: 'run-1' }, error: null });
  supabase.setNextResult({ error: null });
});

describe('defineCron — auth', () => {
  it('401 sin Authorization header', async () => {
    const cron = defineCron({
      name:    'test-cron',
      handler: async () => ({ expected: 0, processed: 0 }),
    });
    const res = await cron(makeCronRequestUnauthorized());
    expect(res.status).toBe(401);
  });

  it('401 con bearer incorrecto', async () => {
    const cron = defineCron({
      name:    'test-cron',
      handler: async () => ({ expected: 0, processed: 0 }),
    });
    const res = await cron(makeCronRequest('wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('200 con CRON_SECRET correcto', async () => {
    const cron = defineCron({
      name:    'test-cron',
      handler: async () => ({ expected: 0, processed: 0 }),
    });
    const res = await cron(makeCronRequest(CRON_SECRET_FIXTURE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('ok');
    expect(body.cron).toBe('test-cron');
    expect(body.duration_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('defineCron — handler ctx', () => {
  it('handler recibe supabase, now, y log', async () => {
    const handler = vi.fn(async (ctx) => {
      expect(ctx.supabase).toBeDefined();
      expect(ctx.now).toBeInstanceOf(Date);
      expect(typeof ctx.log.info).toBe('function');
      return { expected: 5, processed: 5 };
    });
    const cron = defineCron({ name: 't', handler });
    await cron(makeCronRequest());
    expect(handler).toHaveBeenCalled();
  });
});

describe('defineCron — status classification', () => {
  it('ok: expected === processed y errors=0', async () => {
    const cron = defineCron({
      name:    'test',
      handler: async () => ({ expected: 10, processed: 10, errors: [] }),
    });
    const res = await cron(makeCronRequest());
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.ok).toBe(true);
    expect(mockAlertPartialFailure).not.toHaveBeenCalled();
  });

  it('partial: processed < expected → dispara alert', async () => {
    const cron = defineCron({
      name:    'test',
      handler: async () => ({ expected: 10, processed: 7, errors: ['err a', 'err b'] }),
    });
    const res = await cron(makeCronRequest());
    const body = await res.json();
    expect(body.status).toBe('partial');
    expect(body.ok).toBe(false);
    expect(body.processed).toBe(7);
    expect(mockAlertPartialFailure).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        cronName:  'test',
        expected:  10,
        processed: 7,
        errors:    ['err a', 'err b'],
      }),
    );
  });

  it('partial: expected===processed pero errors>0 → todavía partial', async () => {
    const cron = defineCron({
      name:    'test',
      handler: async () => ({ expected: 5, processed: 5, errors: ['error inline'] }),
    });
    const res = await cron(makeCronRequest());
    const body = await res.json();
    expect(body.status).toBe('partial');
    expect(mockAlertPartialFailure).toHaveBeenCalled();
  });

  it('error: handler lanza → 500 + status=error + alert', async () => {
    const cron = defineCron({
      name:    'test',
      handler: async () => { throw new Error('DB down'); },
    });
    const res = await cron(makeCronRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.error).toContain('DB down');
    expect(mockAlertPartialFailure).toHaveBeenCalled();
  });
});

describe('defineCron — silenceAlerts', () => {
  it('silenceAlerts=true no dispara alert aunque haya partial', async () => {
    const cron = defineCron({
      name:          'scanner-cron',
      silenceAlerts: true,
      handler:       async () => ({ expected: 10, processed: 3, errors: ['x'] }),
    });
    await cron(makeCronRequest());
    expect(mockAlertPartialFailure).not.toHaveBeenCalled();
  });
});

describe('defineCron — timeout soft', () => {
  it('maxDuration excedido → status=timeout', async () => {
    // Handler que "tarda" 200ms; maxDuration = 0 (imposible cumplir)
    const cron = defineCron({
      name:        'slow',
      maxDuration: 0,
      handler:     async () => {
        await new Promise(r => setTimeout(r, 10));
        return { expected: 1, processed: 1 };
      },
    });
    const res = await cron(makeCronRequest());
    const body = await res.json();
    expect(body.status).toBe('timeout');
  });
});

describe('defineCron — observability best-effort', () => {
  it('cron_runs insert falla → no bloquea el cron', async () => {
    // Reset queue: primer insert de cron_runs falla
    supabase = createSupabaseMock();
    mockCreateAdminClient.mockReturnValue(supabase);
    supabase.setNextResult({ data: null, error: { message: 'table not found', code: '42P01' } });
    // Handler consume el segundo result (para su lógica, en este caso ninguna)

    const cron = defineCron({
      name:    'no-table',
      handler: async () => ({ expected: 1, processed: 1 }),
    });
    const res = await cron(makeCronRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe('defineCron — response shape', () => {
  it('incluye metadata cuando el handler la retorna', async () => {
    const cron = defineCron({
      name: 'meta-test',
      handler: async () => ({
        expected: 5, processed: 5,
        metadata: { skipped: 2, retried: 1 },
      }),
    });
    const res = await cron(makeCronRequest());
    const body = await res.json();
    expect(body.metadata).toEqual({ skipped: 2, retried: 1 });
  });
});
