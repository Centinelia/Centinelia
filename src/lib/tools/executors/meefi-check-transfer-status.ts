import { getMeefiTransfer, type MeefiTransfer } from '../fixtures/meefi-transfers';

// Semántica ok=true con outcome vs ok=false: ver comment en meefi-search-help-center.ts.
// "transfer no encontrada" es respuesta legítima cuando el usuario da datos que
// no matchean, no error técnico.
export async function executeMeefiCheckTransferStatus(
  _ctx: any,
  input: { amount?: number; date_approx?: string; transfer_id?: string },
): Promise<
  | { ok: true; outcome: 'found'; transfer: MeefiTransfer }
  | { ok: true; outcome: 'transfer_not_found' }
> {
  const t = getMeefiTransfer(input);
  if (!t) return { ok: true, outcome: 'transfer_not_found' };
  return { ok: true, outcome: 'found', transfer: t };
}
