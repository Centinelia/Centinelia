import { getMeefiTransfer, type MeefiTransfer } from '../fixtures/meefi-transfers';

export async function executeMeefiCheckTransferStatus(
  _ctx: any,
  input: { amount?: number; date_approx?: string; transfer_id?: string },
): Promise<{ ok: true; transfer: MeefiTransfer } | { ok: false; reason: string }> {
  const t = getMeefiTransfer(input);
  if (!t) return { ok: false, reason: 'transfer_not_found' };
  return { ok: true, transfer: t };
}
