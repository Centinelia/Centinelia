import { describe, it, expect } from 'vitest';
import { executeMeefiLookupUserAccount } from '../meefi-lookup-user-account';
import { executeMeefiCheckTransferStatus } from '../meefi-check-transfer-status';

describe('meefi-lookup-user-account', () => {
  it('regresa flags para usuario existente', async () => {
    const r = await executeMeefiLookupUserAccount({} as any, { email: 'demo1@meefi.io' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.user).toBeDefined();
    expect(r.user.flags.password_reset_locked).toBe(true);
  });

  it('regresa ok:false para usuario inexistente', async () => {
    const r = await executeMeefiLookupUserAccount({} as any, { email: 'noexiste@meefi.io' });
    expect(r.ok).toBe(false);
  });
});

describe('meefi-check-transfer-status', () => {
  it('encuentra transferencia por monto+fecha', async () => {
    const r = await executeMeefiCheckTransferStatus({} as any, {
      amount: 50000,
      date_approx: '2026-09-10',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transfer.status).toBe('pendiente_rieles');
  });

  it('regresa ok:false si no encuentra', async () => {
    const r = await executeMeefiCheckTransferStatus({} as any, { amount: 999999 });
    expect(r.ok).toBe(false);
  });
});

// search-help-center: no se cubre unit — depende de RPC Supabase (Task 11), se prueba en dry run.
