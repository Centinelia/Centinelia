const EVIDENCE = ['ine_frente', 'ine_reverso', 'selfie_con_ine', 'ultimos_4_cuenta'] as const;

export async function executeMeefiInitiate2faRecovery(
  _ctx: any,
  input: { user_id: string },
) {
  void input;
  const ticketId = `rec_${Math.random().toString(36).slice(2, 10)}`;
  return {
    ok: true as const,
    recovery_ticket_id: ticketId,
    evidence_checklist: [...EVIDENCE],
    next_action:
      'Solicitar al usuario los 4 documentos. Cuando estén completos, escalar con escalate_to_human topic recovery_2fa.',
  };
}
