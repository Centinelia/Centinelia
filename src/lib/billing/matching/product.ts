/**
 * product.ts — Fuzzy matcher y alias learning para productos de facturacion.
 *
 * Expone matchProduct y learnProductAlias.
 * Usa createAdminClient (service role) para leer y escribir en billing_product_aliases.
 * Scope de tablas: portal_email + integration_id.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { BillingAdapter, BillingProduct } from '../adapter';
import type { OrgCtx, MatchDecision, MatchResult } from './client';

// Re-export shared types for consumers
export type { OrgCtx, MatchDecision, MatchResult };

// ---------------------------------------------------------------------------
// Thresholds (mismo que client.ts)
// ---------------------------------------------------------------------------

const THRESHOLD_AUTO = 0.9;
const THRESHOLD_FLAG = 0.75;
const THRESHOLD_MIN = 0.5;
const AMBIGUITY_MARGIN = 0.05;

// ---------------------------------------------------------------------------
// matchProduct
// ---------------------------------------------------------------------------

/**
 * Intenta resolver rawText a un BillingProduct concreto.
 *
 * Logica:
 * 1. Alias exact hit en billing_product_aliases — retorna 'auto'.
 * 2. Fuzzy search via adapter.searchProduct.
 *    - score >= AUTO: 'auto'.
 *    - score >= FLAG + diferencia con 2do < AMBIGUITY_MARGIN: 'consult' (ambiguo).
 *    - score >= FLAG: 'auto_with_flag'.
 *    - score >= MIN: 'consult'.
 *    - else: 'unknown'.
 */
export async function matchProduct(
  rawText: string,
  adapter: BillingAdapter,
  ctx: OrgCtx
): Promise<MatchResult<BillingProduct>> {
  if (!rawText || !rawText.trim()) {
    return { decision: 'unknown', top: null, candidates: [], reason: 'empty_query' };
  }

  const supabase = createAdminClient();
  const normalizedQuery = rawText.trim().toLowerCase();

  // 1) Alias exact hit in billing_product_aliases
  const { data: aliasRow } = await supabase
    .from('billing_product_aliases')
    .select('adapter_sku, alias_text')
    .eq('integration_id', ctx.integrationId)
    .eq('alias_text', normalizedQuery)
    .maybeSingle();

  if (aliasRow?.adapter_sku) {
    const product = await adapter.getProductBySKU(aliasRow.adapter_sku as string);
    if (product) {
      return {
        decision: 'auto',
        top: product,
        candidates: [product],
        reason: 'alias_hit',
      };
    }
  }

  // 2) Fuzzy search
  const results = await adapter.searchProduct(rawText, 5);

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
// learnProductAlias
// ---------------------------------------------------------------------------

/**
 * Persiste un alias aprendido en billing_product_aliases.
 *
 * - Si ya existe fila para (integration_id, alias_text): skip (idempotente).
 * - Si no existe: INSERT con sku, portal_email, integration_id, learned_from.
 */
export async function learnProductAlias(
  sku: string,
  alias: string,
  ctx: OrgCtx,
  learnedFrom: string
): Promise<void> {
  if (!alias || !alias.trim()) return;

  const supabase = createAdminClient();
  const normalized = alias.trim().toLowerCase();

  const { data: existing } = await supabase
    .from('billing_product_aliases')
    .select('adapter_sku')
    .eq('integration_id', ctx.integrationId)
    .eq('alias_text', normalized)
    .maybeSingle();

  if (existing) {
    // Alias already recorded — skip to avoid duplicate.
    return;
  }

  await supabase.from('billing_product_aliases').insert({
    alias_text: normalized,
    adapter_sku: sku,
    portal_email: ctx.portalEmail,
    integration_id: ctx.integrationId,
    learned_from: learnedFrom,
  });
}
