import { createAdminClient } from '@/lib/supabase/admin';

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

export async function getCustomerContext(
  portalEmail: string,
  callerPhone: string,
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const phoneNorm = normalizePhone(callerPhone);

    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, notes')
      .eq('portal_email', portalEmail)
      .eq('phone_normalized', phoneNorm)
      .maybeSingle();

    if (!customer) return null;

    const { data: interactions } = await supabase
      .from('customer_interactions')
      .select('agent_role, type, summary, outcome, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(6);

    if (!customer.name && !interactions?.length) return null;

    const lines: string[] = ['--- HISTORIAL DEL CLIENTE (información de tu equipo) ---'];
    if (customer.name)  lines.push(`Nombre conocido: ${customer.name}`);
    if (customer.notes) lines.push(`Notas: ${customer.notes}`);

    if (interactions?.length) {
      lines.push('Interacciones previas con tu equipo:');
      for (const i of interactions) {
        const date   = new Date(i.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
        const role   = i.agent_role ?? 'Agente';
        const detail = i.summary    ?? i.type;
        lines.push(`  • ${date} — ${role}: ${detail}`);
      }
    }

    lines.push('--- FIN DE HISTORIAL ---');
    return lines.join('\n');
  } catch {
    return null;
  }
}

export async function upsertCustomer(
  portalEmail: string,
  callerPhone: string,
  name?: string,
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const phoneNorm = normalizePhone(callerPhone);

    const { data } = await supabase
      .from('customers')
      .upsert(
        {
          portal_email:     portalEmail,
          phone_normalized: phoneNorm,
          updated_at:       new Date().toISOString(),
          ...(name ? { name } : {}),
        },
        { onConflict: 'portal_email,phone_normalized' },
      )
      .select('id')
      .maybeSingle();

    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function logInteraction(opts: {
  customerId: string;
  agentId:    string;
  agentRole?: string;
  type:       string;
  summary:    string;
  outcome?:   string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('customer_interactions').insert({
      customer_id: opts.customerId,
      agent_id:    opts.agentId,
      agent_role:  opts.agentRole ?? null,
      type:        opts.type,
      summary:     opts.summary,
      outcome:     opts.outcome ?? null,
    });
  } catch {
    // Non-blocking — never break the call flow
  }
}
