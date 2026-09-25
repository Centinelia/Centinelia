/**
 * Infraestructura de evaluación del retrieval de fichas informativas.
 *
 * TODO Fase 8: infra completa de eval con test cases curados.
 * Ver spec regla 8 (Evals periódicas) y
 * docs/superpowers/specs/2026-09-24-reglas-tareas-y-tags-fichas-design.md Sección 6.5.
 *
 * La función mide recall@5 y precision@5 sobre un set de casos de prueba.
 * - recall@5:    fracción de fichas esperadas que aparecen en los top-5 resultados.
 * - precision@5: fracción de los top-5 resultados que son fichas esperadas.
 *
 * En Fase 8 se implementará:
 *   1. Set de casos curados por org (almacenado en DB o fixture).
 *   2. Runner que llama a searchFichas por cada caso y acumula métricas.
 *   3. Comparación contra baseline pre-Fase 4 para detectar regresiones.
 *   4. CI gate: recall@5 < 0.7 falla el build.
 */

export interface EvalTestCase {
  /** Pregunta que el meerkat haría al retrieval. */
  query:            string;
  /** IDs de fichas que se esperan en los resultados top-K. */
  expectedFichaIds: string[];
}

export interface EvalResult {
  recall_at_5:    number;
  precision_at_5: number;
}

/**
 * Evalúa el retrieval contra los casos de prueba dados.
 *
 * STUB — no implementado en Fase 4. Retorna métricas vacías.
 * Ver TODO arriba.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function evalRetrievalRecall(
  _testCases: EvalTestCase[],
): Promise<EvalResult> {
  // TODO Fase 8: infra completa de eval con test cases curados. Ver spec regla 8.
  return { recall_at_5: 0, precision_at_5: 0 };
}
