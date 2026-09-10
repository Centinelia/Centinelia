const TRANSFER_KEYWORDS = /transfer|pago|dinero|cobr/i;

export async function executeMeefiCaptureBugReport(
  _ctx: any,
  input: { user_id: string; description: string; technical_context?: Record<string, unknown> },
) {
  const bugId = `bug_${Math.random().toString(36).slice(2, 10)}`;
  const assignee = TRANSFER_KEYWORDS.test(input.description) ? 'emilio' : 'jaime';
  return {
    ok: true as const,
    bug_ticket_id: bugId,
    assignee_hint: assignee,
    context_snapshot: {
      description: input.description,
      technical: input.technical_context ?? {},
      captured_at: new Date().toISOString(),
    },
  };
}
