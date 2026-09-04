/**
 * vision/build-context.ts — Helper que arma un VisionContext a partir del
 * catálogo del adapter + reglas de aliases previamente aprendidas.
 *
 * Se llama justo antes de invocar extractRemisionesFromImage para que el LLM
 * coteje nombres manuscritos contra los clientes conocidos del negocio en
 * vez de adivinar.
 */

import type { BillingAdapter } from '../adapter';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VisionContext, VisionContextClient, VisionContextProduct } from './extract';

export interface BuildContextOpts {
  adapter: BillingAdapter;
  supabase?: SupabaseClient;
  /** Para filtrar aliases del `billing_client_rules` de esta integración. */
  integrationId?: string;
  /** Info del emisor (razón social + RFC del negocio) para que el LLM no la confunda con cliente. */
  emisor?: { nombre?: string; rfc?: string };
  /** Trunca la lista de clientes a los primeros N por tamaño de prompt. Default 200. */
  maxClientes?: number;
  /** Trunca la lista de productos a los primeros N. Default 100. */
  maxProductos?: number;
}

/**
 * Arma el VisionContext. Si el catálogo excede los límites, trunca
 * (los adapters piloto tortillería tienen ~50 clientes y ~20 productos,
 * cabe sin cortar).
 */
export async function buildVisionContextFromAdapter(
  opts: BuildContextOpts,
): Promise<VisionContext> {
  // Degradación graceful: si el catálogo falla (CSV corrupto en Dropbox,
  // Dropbox 500, timeout), NO tirar — devolver contexto vacío para que el
  // vision LLM al menos extraiga texto crudo. El caller decide qué hacer
  // sin cliente/producto matched. Auditoría 2026-09-04.
  let clients: Awaited<ReturnType<typeof opts.adapter.listAllClients>> = [];
  let products: Awaited<ReturnType<typeof opts.adapter.listAllProducts>> = [];
  try { clients = await opts.adapter.listAllClients(); }
  catch (err) {
    console.warn('[vision/build-context] listAllClients falló, sigo sin catálogo de clientes:',
      err instanceof Error ? err.message : String(err));
  }
  try { products = await opts.adapter.listAllProducts(); }
  catch (err) {
    console.warn('[vision/build-context] listAllProducts falló, sigo sin catálogo de productos:',
      err instanceof Error ? err.message : String(err));
  }

  const maxClientes = opts.maxClientes ?? 200;
  const maxProductos = opts.maxProductos ?? 100;

  // Aliases aprendidos: RFC → [aliases]. Si no hay supabase/integrationId, skip.
  const aliasByRfc = new Map<string, string[]>();
  if (opts.supabase && opts.integrationId) {
    const { data } = await opts.supabase
      .from('billing_client_rules')
      .select('rfc, aliases')
      .eq('integration_id', opts.integrationId);
    for (const row of data ?? []) {
      const rfc = row.rfc as string | null;
      const aliases = row.aliases as string[] | null;
      if (rfc && aliases && aliases.length > 0) aliasByRfc.set(rfc, aliases);
    }
  }

  const clientes: VisionContextClient[] = clients.slice(0, maxClientes).map((c) => ({
    rfc:     c.rfc,
    nombre:  c.razonSocial,
    aliases: aliasByRfc.get(c.rfc),
  }));

  const productos: VisionContextProduct[] = products.slice(0, maxProductos).map((p) => ({
    sku:             p.sku,
    nombre:          p.nombre,
    precio_unitario: p.precio,
  }));

  return {
    clientes,
    productos,
    ...(opts.emisor ? { emisor: opts.emisor } : {}),
  };
}
