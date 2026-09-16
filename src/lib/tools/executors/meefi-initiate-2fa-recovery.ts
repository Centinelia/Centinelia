import { consumeAiOp } from '@/lib/ai/ops-guard';

const EVIDENCE = ['ine_frente', 'ine_reverso', 'selfie_con_ine', 'ultimos_4_cuenta'] as const;

export async function executeMeefiInitiate2faRecovery(
  ctx: any,
  input: { user_id: string },
) {
  void input;
  const ticketId = `rec_${Math.random().toString(36).slice(2, 10)}`;
  const agentId: string = ctx?.agent?.id ?? ctx?.agent_id ?? '';
  if (agentId) {
    try {
      await consumeAiOp(agentId, 1, {
        source:       'meefi_2fa_recovery',
        reference_id: ticketId,
        label:        'Recuperación 2FA Meefi iniciada',
      });
    } catch (err) {
      console.error('meefi_initiate_2fa_recovery consumeAiOp failed silently:', err);
    }
  }
  return {
    ok: true as const,
    recovery_ticket_id: ticketId,
    evidence_checklist: [...EVIDENCE],
    next_action:
      'Solicitar al usuario los 4 documentos. Cuando estén completos, escalar con escalate_to_human topic recovery_2fa.',
  };
}
