import { MEEFI_USERS } from '../fixtures/meefi-users';

// Semántica ok=true con outcome: ver comment en meefi-search-help-center.ts.
// account_not_verified es la respuesta esperada del diagnóstico Bloque 1;
// user_not_found también es respuesta legítima (usuario tecleó mal el correo).
export async function executeMeefiSendPasswordResetLink(
  _ctx: any,
  input: { user_id: string },
) {
  const user = MEEFI_USERS.find(u => u.user_id === input.user_id);
  if (!user) return { ok: true as const, outcome: 'user_not_found' as const };
  if (user.flags.password_reset_locked) {
    return {
      ok: true as const,
      outcome: 'account_not_verified' as const,
      suggestion: 'verify_email_first',
      message:
        'La cuenta tiene el reset bloqueado hasta verificar el correo. Le pedimos al usuario que abra el correo de bienvenida y confirme, después reintentamos.',
    };
  }
  return {
    ok: true as const,
    outcome: 'sent' as const,
    delivered_to: user.email,
    link_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    message: `Link de restablecimiento enviado a ${user.email}. Vigencia 60 minutos.`,
  };
}
