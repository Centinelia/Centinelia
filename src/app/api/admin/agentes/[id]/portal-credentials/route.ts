import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/portal/auth';

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id }            = await params;
  const { email, password } = await req.json() as { email?: string; password?: string };

  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
  if (password !== undefined && password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });

  const supabase = createAdminClient();
  const portalEmail = email.toLowerCase().trim();

  // Update email en el agent (per-agent)
  const { error: agentErr } = await supabase
    .from('voice_agents')
    .update({ portal_email: portalEmail })
    .eq('id', id);
  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });

  // Password se guarda org-level (fuente de verdad). Dual-write al agente
  // por retrocompat con código legacy.
  if (password) {
    const hash = await hashPassword(password);
    await supabase
      .from('organizations')
      .update({ portal_password_hash: hash })
      .eq('portal_email', portalEmail);
    await supabase
      .from('voice_agents')
      .update({ portal_password_hash: hash })
      .eq('id', id);
  }

  return NextResponse.json({ ok: true });
}
