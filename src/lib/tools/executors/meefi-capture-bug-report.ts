import { consumeAiOp } from '@/lib/ai/ops-guard';

const TRANSFER_KEYWORDS = /transfer|pago|dinero|cobr/i;

export async function executeMeefiCaptureBugReport(
  ctx: any,
  input: { user_id: string; description: string; technical_context?: Record<string, unknown> },
) {
  const bugId = `bug_${Math.random().toString(36).slice(2, 10)}`;
  const assignee = TRANSFER_KEYWORDS.test(input.description) ? 'emilio' : 'jaime';
  const agentId: string = ctx?.agent?.id ?? ctx?.agent_id ?? '';
  if (agentId) {
    try {
      await consumeAiOp(agentId, 1, {
        source:       'meefi_bug_report',
        reference_id: bugId,
        label:        'Reporte de bug Meefi capturado',
      });
    } catch (err) {
      console.error('meefi_capture_bug_report consumeAiOp failed silently:', err);
    }
  }
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
