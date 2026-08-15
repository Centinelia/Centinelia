import type { SupabaseClient } from '@supabase/supabase-js';

export interface GuardrailInput {
  total: number;
  uso_cfdi: string;
  cliente_rfc: string;
  portal_email: string;
}

export interface GuardrailLimits {
  monto_max_mxn: number;
  blocked_uso_cfdi: string[];
  max_stamps_per_day: number;
  max_stamps_per_hour_per_rfc: number;
}

export interface GuardrailResult { pass: boolean; reasons: string[]; }

export async function evaluateGuardrails(
  input: GuardrailInput, limits: GuardrailLimits, supabase: SupabaseClient,
): Promise<GuardrailResult> {
  const reasons: string[] = [];

  if (input.total > limits.monto_max_mxn) {
    reasons.push(`monto ${input.total} excede tope ${limits.monto_max_mxn}`);
  }
  if (limits.blocked_uso_cfdi.includes(input.uso_cfdi)) {
    reasons.push(`uso CFDI ${input.uso_cfdi} bloqueado para auto`);
  }

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: perHour } = await supabase
    .from('factura_requests')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', input.portal_email)
    .eq('cliente_rfc', input.cliente_rfc)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', hourAgo);
  if ((perHour ?? 0) >= limits.max_stamps_per_hour_per_rfc) {
    reasons.push(`rate limit: ${perHour} CFDI a este RFC en la última hora`);
  }

  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const { count: perDay } = await supabase
    .from('factura_requests')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', input.portal_email)
    .eq('status', 'stamped')
    .gte('fecha_timbrado', dayAgo);
  if ((perDay ?? 0) >= limits.max_stamps_per_day) {
    reasons.push(`rate limit diario: ${perDay} CFDI hoy`);
  }

  return { pass: reasons.length === 0, reasons };
}
