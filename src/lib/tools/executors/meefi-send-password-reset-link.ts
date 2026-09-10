import { MEEFI_USERS } from '../fixtures/meefi-users';

export async function executeMeefiSendPasswordResetLink(
  _ctx: any,
  input: { user_id: string },
) {
  const user = MEEFI_USERS.find(u => u.user_id === input.user_id);
  if (!user) return { ok: false as const, reason: 'user_not_found' };
  if (user.flags.password_reset_locked) {
    return {
      ok: false as const,
      reason: 'account_not_verified',
      suggestion: 'verify_email_first',
      message:
        'La cuenta tiene el reset bloqueado hasta verificar el correo. Le pedimos al usuario que abra el correo de bienvenida y confirme, después reintentamos.',
    };
  }
  return {
    ok: true as const,
    delivered_to: user.email,
    link_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    message: `Link de restablecimiento enviado a ${user.email}. Vigencia 60 minutos.`,
  };
}
