import type { createAdminClient } from '@/lib/supabase/admin';

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Resuelve un secret encriptado en Supabase Vault por (org_id, key).
 * Retorna null si no existe o si el vault no lo puede descifrar.
 * NUNCA loggear el retorno de esta función.
 */
export async function resolveSecretByKey(
  orgId:    string,
  key:      string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: secretRow } = await supabase
    .from('external_secrets')
    .select('vault_secret_id')
    .eq('org_id', orgId)
    .eq('key', key)
    .maybeSingle();
  if (!secretRow?.vault_secret_id) return null;

  // Vault: usa la view `vault.decrypted_secrets` con RLS
  const { data: decrypted } = await supabase
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', secretRow.vault_secret_id)
    .maybeSingle();
  return (decrypted?.decrypted_secret as string | undefined) ?? null;
}
