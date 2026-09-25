/**
 * Prompt template para el clasificador de tags de fichas informativas.
 *
 * Sonnet 4.6 recibe el contenido de una ficha y devuelve 1-3 tags del
 * catálogo controlado de 15 slugs.
 *
 * Reglas de clasificación:
 * - Solo slugs del catálogo (nunca inventa tags nuevos).
 * - Entre 1 y 3 tags. Si el contenido es amplio, elige los MÁS específicos.
 * - Si el contenido no encaja bien, devuelve `politicas` como fallback.
 * - Respuesta en JSON estricto: {"tags": ["slug1", "slug2"]}.
 */

/** Los 15 slugs válidos del catálogo controlado (espejo de la tabla ficha_tags). */
export const VALID_TAG_SLUGS = [
  'contabilidad',
  'cobranza',
  'ventas',
  'atencion_cliente',
  'catalogo_productos',
  'politicas',
  'rh',
  'operaciones',
  'logistica',
  'marketing',
  'finanzas',
  'legal',
  'fiscal',
  'onboarding_clientes',
  'soporte_tecnico',
] as const;

export type TagSlug = (typeof VALID_TAG_SLUGS)[number];

export function buildAutotagSystemPrompt(): string {
  const catalogList = VALID_TAG_SLUGS
    .map(s => `- ${s}`)
    .join('\n');

  return `Eres un clasificador de documentos de negocio para Centinelia. Recibes el contenido\nde una ficha informativa (documento del negocio) y devuelves 1 a 3 tags del catálogo\ncontrolado que mejor describen su dominio.\n\nCatálogo de tags disponibles (usa solo estos slugs):\n${catalogList}\n\nReglas:\n- Solo devuelve tags del catálogo (nunca inventes tags nuevos).\n- Devuelve entre 1 y 3 tags. Si el contenido es muy amplio, elige los MÁS específicos.\n- Si el contenido no encaja bien en ninguno, devuelve \`politicas\` como fallback.\n\nFormato de respuesta (JSON estricto):\n{"tags": ["contabilidad", "fiscal"]}`;
}

export function buildAutotagUserMessage(contenido: string): string {
  return `Contenido de la ficha:\n---\n${contenido}\n---`;
}
