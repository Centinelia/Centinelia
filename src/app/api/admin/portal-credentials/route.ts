import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/portal/auth';
import { isAdmin } from '@/lib/admin/auth';

/**
 * Credenciales del portal a nivel cliente (portal_email), no por empleado.
 * Actualiza el portal_email y/o password en TODOS los voice_agents del pool.
 *
 * Body: { current_portal_email, new_email?, password? }
 * Si new_email se omite, solo cambia password.
 * Si password se omite, solo cambia email.
 * At least one required.
 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { current_portal_email, new_email, password } = await req.json() as {
    current_portal_email?: string;
    new_email?:            string;
    password?:             string;
  };

  if (!current_portal_email && !new_email) {
    return NextResponse.json({ error: 'current_portal_email o new_email requerido' }, { status: 400 });
  }
  if (password !== undefined && password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 });
  }
  if (!new_email && !password) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const update: Record<string, string> = {};
  if (new_email) update.portal_email        = new_email.toLowerCase().trim();
  if (password)  update.portal_password_hash = await hashPassword(password);

  // Onboarding: si aún no hay portal_email en la cuenta (current viene null/empty),
  // se usa el nuevo directo y hay que aplicarlo a alguna anchor row. Pero ese caso
  // se maneja desde la ruta legacy /agentes/[id]/portal-credentials.
  if (!current_portal_email) {
    return NextResponse.json({ error: 'current_portal_email requerido para bulk update' }, { status: 400 });
  }

  const { error, count } = await supabase
    .from('voice_agents')
    .update(update, { count: 'exact' })
    .eq('portal_email', current_portal_email.toLowerCase().trim());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count ?? 0 });
}
