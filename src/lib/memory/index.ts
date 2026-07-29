/**
 * Memory graph — API público (F9.1).
 *
 * Entrypoints altos:
 *   - createPostgresStore()  → construir el store
 *   - extractFromTranscript() → LLM extraction desde un transcript
 *   - ingestCall()           → helper end-to-end: extract + apply
 *
 * Ver types.ts para el vocabulario de predicates.
 */

export { createPostgresStore } from './postgres-store';
export { extractFromTranscript } from './extract';
export type { MemoryStore, CreateFactInput, UpsertEntityInput } from './store';
export * from './types';

import { createPostgresStore } from './postgres-store';
import { extractFromTranscript } from './extract';

/**
 * Extrae facts de un transcript y los persiste en el memory graph.
 * Devuelve un resumen para poder auditar.
 */
export async function ingestCall(input: {
  agentId:       string;
  callId:        string;
  transcript:    string;
  callerName?:   string;
  callerNumber?: string;   // opcional, se usa como attribute del customer entity
}): Promise<{
  factsFound:       number;
  entitiesUpserted: number;
  factsCreated:     number;
  cacheReadTokens:  number;
  cacheCreatedTokens: number;
  inputTokens:      number;
  outputTokens:     number;
}> {
  const store = createPostgresStore();

  // Semilla: si tenemos callerNumber, aseguramos un entity para el customer
  // aunque el extractor no le encuentre nombre. Así queries futuras por
  // teléfono devuelven al menos el entity.
  if (input.callerNumber) {
    const displayName = input.callerName?.trim() || input.callerNumber;
    await store.upsertEntity({
      agentId:    input.agentId,
      entityType: 'customer',
      name:       displayName,
      attributes: {
        phone_number:     input.callerNumber,
        last_call_id:     input.callId,
        last_call_at:     new Date().toISOString(),
      },
    }).catch(err => console.warn('[memory/ingestCall] seed entity failed:', err));
  }

  const { facts, cacheReadTokens, cacheCreatedTokens, inputTokens, outputTokens } =
    await extractFromTranscript({
      transcript: input.transcript,
      callerName: input.callerName,
    });

  const { entitiesUpserted, factsCreated } = await store.applyExtracted(input.agentId, input.callId, facts);

  return {
    factsFound: facts.length,
    entitiesUpserted,
    factsCreated,
    cacheReadTokens,
    cacheCreatedTokens,
    inputTokens,
    outputTokens,
  };
}
