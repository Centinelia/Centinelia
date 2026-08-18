/**
 * client.ts — Fuzzy matcher y alias learning para clientes de facturacion.
 *
 * Expone matchClient y learnClientAlias.
 * Usa createAdminClient (service role) para leer y escribir en billing_client_rules.
 * Scope de tablas: portal_email + integration_id (no organization_id UUID).
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { BillingAdapter, BillingClient } from '../adapter';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface OrgCtx {
  portalEmail: string;
  integrationId: string;
}

export type MatchDecision = 'auto' | 'auto_with_flag' | 'consult' | 'unknown';

export interface MatchResult<T> {
  decision: MatchDecision;
  top: T | null;
  candidates: T[];
  reason: string;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const THRESHOLD_AUTO = 0.9;
const THRESHOLD_FLAG = 0.75;
const THRESHOLD_MIN = 0.5;
const AMBIGUITY_MARGIN = 0.05;

// ---------------------------------------------------------------------------
// matchClient
// ---------------------------------------------------------------------------

/**
 * Intenta resolver rawText a un BillingClient concreto.
 *
 * Logica:
 * 1. Alias exact hit en billing_client_rules — retorna 'auto'.
 * 2. Fuzzy search via adapter.searchClient.
 *    - score >= AUTO: 'auto'.
 *    - score >= FLAG + diferencia con 2do < AMBIGUITY_MARGIN: 'consult' (ambiguo).
 *    - score >= FLAG: 'auto_with_flag'.
 *    - score >= MIN: 'consult'.
 *    - else: 'unknown'.
 */
export async function matchClient(
  rawText: string,
  adapter: BillingAdapter,
  ctx: OrgCtx
): Promise<MatchResult<BillingClient>> {
  const supabase = createAdminClient();
  const normalizedQuery = rawText.trim().toLowerCase();

  // 1) Alias exact hit
  const { data: rule } = await supabase
    .from('billing_client_rules')
    .select('rfc, aliases')
    .eq('integration_id', ctx.integrationId)
    .contains('aliases', [normalizedQuery])
    .maybeSingle();

  if (rule?.rfc) {
    const client = await adapter.getClientByRFC(rule.rfc as string);
    if (client) {
      return {
        decision: 'auto',
        top: client,
        candidates: [client],
        reason: 'alias_hit',
      };
    }
  }

  // 2) Fuzzy search
  const results = await adapter.searchClient(rawText, 5);

  if (results.length === 0) {
    return { decision: 'unknown', top: null, candidates: [], reason: 'no_match' };
  }

  const top = results[0];
  const second = results[1];

  if (top.score >= THRESHOLD_AUTO) {
    return { decision: 'auto', top, candidates: results, reason: 'high_score' };
  }

  if (second && top.score - second.score < AMBIGUITY_MARGIN && top.score >= THRESHOLD_FLAG) {
    return { decision: 'consult', top, candidates: results, reason: 'ambiguous' };
  }

  if (top.score >= THRESHOLD_FLAG) {
    return { decision: 'auto_with_flag', top, candidates: results, reason: 'medium_score' };
  }

  if (top.score >= THRESHOLD_MIN) {
    return { decision: 'consult', top, candidates: results, reason: 'low_score' };
  }

  return { decision: 'unknown', top: null, candidates: results, reason: 'below_threshold' };
}

// ---------------------------------------------------------------------------
// learnClientAlias
// ---------------------------------------------------------------------------

/**
 * Persiste un alias aprendido en billing_client_rules.
 *
 * - Si ya existe fila para (integration_id, rfc): agrega el alias al array si no esta.
 * - Si no existe fila: crea una nueva con frequency='daily' y aliases=[normalizedAlias].
 */
export async function learnClientAlias(
  rfc: string,
  alias: string,
  ctx: OrgCtx,
  learnedFrom: string
): Promise<void> {
  const supabase = createAdminClient();
  const normalized = alias.trim().toLowerCase();

  const { data: existing } = await supabase
    .from('billing_client_rules')
    .select('id, aliases')
    .eq('integration_id', ctx.integrationId)
    .eq('rfc', rfc)
    .maybeSingle();

  if (existing) {
    const currentAliases = (existing.aliases as string[]) ?? [];
    if (!currentAliases.includes(normalized)) {
      await supabase
        .from('billing_client_rules')
        .update({ aliases: [...currentAliases, normalized] })
        .eq('id', existing.id);
    }
    // If alias already present, skip silently.
    return;
  }

  // No existing rule — create one.
  await supabase.from('billing_client_rules').insert({
    portal_email: ctx.portalEmail,
    integration_id: ctx.integrationId,
    rfc,
    frequency: 'daily',
    aliases: [normalized],
    created_by: learnedFrom,
  });
}
