// Fix P8 audit 2026-08-10 — LFPDPPP proof of consent.
// Cada aceptación de T&C / aviso privacidad / AUP se registra con IP + timestamp
// + versiones aceptadas. Usable en audit INAI / dispute con cliente.

import type { createAdminClient } from '@/lib/supabase/admin';

// Versiones actuales de documentos legales — bump al modificar el texto.
// Al bumper, todos los usuarios NO tienen la nueva versión y deben re-consentir.
export const LEGAL_DOC_VERSIONS = {
  terms_of_service:   'v2.1',   // src/app/legal/page.tsx sección T&C
  aviso_privacidad:   'v2.0',   // src/app/legal/page.tsx sección Aviso
  aup:                'v1.0',   // src/app/legal/page.tsx sección Política de Uso Aceptable
} as const;

export interface ConsentEntry {
  portalEmail?:  string | null;
  agentId?:      string | null;
  actorType:     'client_owner' | 'sub_user' | 'anon_registrant';
  ipAddress?:    string | null;
  userAgent?:    string | null;
  // Override si aceptó versiones específicas (default = current)
  overrideVersions?: Partial<typeof LEGAL_DOC_VERSIONS>;
}

export async function logConsent(
  supabase: ReturnType<typeof createAdminClient>,
  entry: ConsentEntry,
): Promise<void> {
  try {
    await supabase.from('consent_log').insert({
      portal_email:       entry.portalEmail ?? null,
      agent_id:           entry.agentId ?? null,
      actor_type:         entry.actorType,
      accepted_documents: { ...LEGAL_DOC_VERSIONS, ...(entry.overrideVersions ?? {}) },
      ip_address:         entry.ipAddress ?? null,
      user_agent:         entry.userAgent ?? null,
    });
  } catch (err) {
    // Best-effort. Nunca bloquear registration/onboarding por fallo en log.
    console.error('[legal/consent-log] insert failed', err);
  }
}

/**
 * Registra revocación de consentimiento (cliente pide "borrar mis datos", etc.)
 * No modifica la row original (immutable); crea una nueva marcando revocación
 * de todas las prev-versions del portalEmail.
 */
export async function revokeConsent(
  supabase: ReturnType<typeof createAdminClient>,
  portalEmail: string,
  reason: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabase.from('consent_log').update({ revoked_at: now })
      .eq('portal_email', portalEmail)
      .is('revoked_at', null);
    await supabase.from('platform_incidents').insert({
      title:                 `Consent revoked — ${portalEmail}`,
      description:           `Cliente revocó consentimiento. Reason: ${reason}. Todos los rows en consent_log marcados con revoked_at=${now}. Iniciar procedimiento ARCO cancelación.`,
      priority:              'high',
      source:                'error_log',
      source_id:             `consent_revoke_${portalEmail}`,
      affected_portal_email: portalEmail,
      status:                'open',
      assigned_to:           'owner',
    });
  } catch (err) {
    console.error('[legal/consent-log] revoke failed', err);
  }
}
