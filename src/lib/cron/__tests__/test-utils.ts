/**
 * Test utilities para crons.
 *
 * Provee:
 *  - makeCronRequest(secret?) — NextRequest con Authorization: Bearer CRON_SECRET
 *  - runCronForTest(handler, opts?) — invoca el handler de defineCron sin HTTP
 *  - fakeCronContext(overrides?) — ctx sintético para el handler directo
 *
 * Se apoya en el harness genérico de portal (createSupabaseMock) para el mock
 * de Supabase, así todo el testing de Centinelia comparte una sola fuente.
 */

import { NextRequest } from 'next/server';
import { vi } from 'vitest';
import { createSupabaseMock } from '@/lib/portal/__tests__/test-utils';

export const CRON_SECRET_FIXTURE = 'cron-secret-fixture-abc';

/** Construye un NextRequest con el header Bearer correcto. */
export function makeCronRequest(secret = CRON_SECRET_FIXTURE, path = '/api/cron/test'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method:  'GET',
    headers: {
      authorization: `Bearer ${secret}`,
    },
  });
}

/** Request sin secret — para probar el 401. */
export function makeCronRequestUnauthorized(path = '/api/cron/test'): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method:  'GET',
  });
}

/** Setea CRON_SECRET env var para el test. */
export function setCronSecret() {
  vi.stubEnv('CRON_SECRET', CRON_SECRET_FIXTURE);
}

/**
 * Ejecuta un handler de defineCron directamente (sin ir por HTTP). Útil para
 * tests unitarios del handler sin depender del wrapper completo.
 *
 * NOTA: cuando quieras testear el wrapper (auth, cron_runs write, alertas),
 * usa el `GET` exportado de la route + makeCronRequest, no este helper.
 */
export async function runHandlerDirectly<T>(
  handler: (ctx: { supabase: ReturnType<typeof createSupabaseMock>; now: Date; log: ConsoleLog }) => Promise<T>,
  overrides: { supabase?: ReturnType<typeof createSupabaseMock>; now?: Date } = {},
): Promise<T> {
  const supabase = overrides.supabase ?? createSupabaseMock();
  const now      = overrides.now ?? new Date('2026-09-14T12:00:00Z');
  const log = {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  };
  return handler({ supabase, now, log });
}

interface ConsoleLog {
  info:  (msg: string, meta?: Record<string, unknown>) => void;
  warn:  (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}
