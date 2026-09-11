import { describe, it, expect } from 'vitest';
import { executeMeefiLookupUserAccount } from '../meefi-lookup-user-account';
import { executeMeefiCheckTransferStatus } from '../meefi-check-transfer-status';

// Semántica ok/outcome: los tools mock retornan ok=true con outcome distinto
// cuando la respuesta es semánticamente negativa pero técnicamente exitosa.
// ok=false queda reservado para errores técnicos (crash, DB down).

describe('meefi-lookup-user-account', () => {
  it('outcome=found + flags para usuario existente', async () => {
    const r = await executeMeefiLookupUserAccount({} as any, { email: 'demo1@meefi.io' });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('found');
    if (r.outcome !== 'found') return;
    expect(r.user).toBeDefined();
    expect(r.user.flags.password_reset_locked).toBe(true);
  });

  it('outcome=user_not_found para usuario inexistente', async () => {
    const r = await executeMeefiLookupUserAccount({} as any, { email: 'noexiste@meefi.io' });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('user_not_found');
  });
});

describe('meefi-check-transfer-status', () => {
  it('outcome=found para query que matchea', async () => {
    const r = await executeMeefiCheckTransferStatus({} as any, {
      amount: 50000,
    });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('found');
    if (r.outcome !== 'found') return;
    expect(r.transfer.status).toBe('pendiente_rieles');
  });

  it('outcome=transfer_not_found si no matchea', async () => {
    const r = await executeMeefiCheckTransferStatus({} as any, { amount: 999999 });
    expect(r.ok).toBe(true);
    expect(r.outcome).toBe('transfer_not_found');
  });
});

// search-help-center: no se cubre unit — depende de RPC Supabase (Task 11), se prueba en dry run.
