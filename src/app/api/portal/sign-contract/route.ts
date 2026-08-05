import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, limiters } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, limiters.auth);
  if (rl) return rl;

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? null;

  const supabase = createAdminClient();

  // Resolve the org (portal_email) from the token. El contrato ahora vive
  // per-organizacion, no per-empleado. Ver [[contract-at-organization-level]].
  const { data: agent, error: agentErr } = await supabase
    .from('voice_agents')
    .select('portal_email, client_name')
    .eq('portal_token', token)
    .single();

  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  const acceptedAt = new Date().toISOString();

  if (agent.portal_email) {
    // Upsert org-level firma (fuente de verdad).
    const { error: orgErr } = await supabase
      .from('organizations')
      .upsert(
        {
          portal_email:         agent.portal_email,
          contract_accepted_at: acceptedAt,
          contract_ip:          ip,
          contract_signer_name: agent.client_name ?? null,
        },
        { onConflict: 'portal_email' },
      );
    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

    // Best-effort mirror a voice_agents de todos los empleados del cliente
    // para que codigo legacy que aun lee de voice_agents.contract_accepted_at
    // siga funcionando durante la transicion.
    await supabase
      .from('voice_agents')
      .update({ contract_accepted_at: acceptedAt, contract_ip: ip })
      .eq('portal_email', agent.portal_email);
  } else {
    // Demo/standalone sin portal_email: mantiene el flujo legacy per-agente.
    const { error } = await supabase
      .from('voice_agents')
      .update({ contract_accepted_at: acceptedAt, contract_ip: ip })
      .eq('portal_token', token);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
