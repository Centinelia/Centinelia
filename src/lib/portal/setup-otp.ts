import { createAdminClient } from '@/lib/supabase/admin';

const CODE_TTL_MS   = 15 * 60 * 1000; // 15 minutos
const MAX_ATTEMPTS  = 5;

// ── Code generation (6 dígitos criptográficos, sin ambigüedad) ──────────

/** Genera un código de 6 dígitos (000000-999999) usando crypto.getRandomValues. */
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

/** SHA-256 + hex. Suficiente para hashes de códigos de 6 dígitos con TTL corto. */
async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── API ──────────────────────────────────────────────────────────────────

export interface IssuedCode {
  /** Código en claro (para enviar por email). NO guardar. */
  code:      string;
  expiresAt: Date;
}

/**
 * Genera un nuevo código para {portalEmail}, lo hashea y guarda con expiry.
 * Invalida cualquier código pendiente anterior del mismo email (marca used_at=now).
 * Retorna el código en claro (para que el caller lo envíe por correo).
 */
export async function issueSetupCode(portalEmail: string): Promise<IssuedCode> {
  const supabase  = createAdminClient();
  const code      = generateCode();
  const codeHash  = await hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await supabase
    .from('portal_setup_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('portal_email', portalEmail)
    .is('used_at', null);

  const { error } = await supabase.from('portal_setup_codes').insert({
    portal_email: portalEmail,
    code_hash:    codeHash,
    expires_at:   expiresAt.toISOString(),
  });
  if (error) throw new Error(`No se pudo emitir código: ${error.message}`);

  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'invalid' };

/**
 * Verifica {code} contra el código pendiente más reciente de {portalEmail}.
 * En caso de éxito, marca el código como usado.
 * En caso de código incorrecto, incrementa attempts. Si supera MAX_ATTEMPTS,
 * el código queda inválido y el usuario debe pedir uno nuevo.
 */
export async function verifySetupCode(portalEmail: string, code: string): Promise<VerifyResult> {
  const supabase = createAdminClient();
  const codeHash = await hashCode(code);

  const { data: row } = await supabase
    .from('portal_setup_codes')
    .select('id, code_hash, expires_at, attempts')
    .eq('portal_email', portalEmail)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { id: string; code_hash: string; expires_at: string; attempts: number } | null };

  if (!row) return { ok: false, reason: 'no_code' };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  if (row.code_hash !== codeHash) {
    await supabase.from('portal_setup_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
    return { ok: false, reason: 'invalid' };
  }

  await supabase.from('portal_setup_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
  return { ok: true };
}

/**
 * Enmascara un email para display público: `us***@ex***.com`.
 * Muestra los primeros 2 chars del local part + los primeros 2 del dominio.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const [domainName, ...tldParts] = domain.split('.');
  const tld = tldParts.join('.');
  const maskedLocal  = local.length <= 2 ? local : `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 4))}`;
  const maskedDomain = domainName.length <= 2 ? domainName : `${domainName.slice(0, 2)}${'*'.repeat(Math.min(domainName.length - 2, 3))}`;
  return `${maskedLocal}@${maskedDomain}${tld ? `.${tld}` : ''}`;
}
