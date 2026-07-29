/**
 * MemoryStore — interfaz abstracta del memory graph (F9.1).
 *
 * Hoy la implementamos sobre Postgres/Supabase (postgres-store.ts). Si más
 * adelante escalamos a Neo4j + Graphiti, implementamos neo4j-store.ts con la
 * misma interfaz y el resto del código no cambia.
 */

import type {
  MemoryEntity, MemoryFact, MemoryQuery, MemoryQueryResult,
  ExtractedFact, EntityType,
} from './types';

export interface UpsertEntityInput {
  agentId:     string;
  entityType:  EntityType;
  name:        string;
  attributes?: Record<string, unknown>;
}

export interface CreateFactInput {
  agentId:        string;
  subjectId:      string;
  predicate:      string;
  objectText?:    string;
  objectEntityId?: string;
  objectNumber?:  number;
  objectDate?:    string;
  validFrom?:     string;   // default: now
  sourceCallId?:  string;
  confidence?:    number;   // default: 1.0
}

export interface MemoryStore {
  /** Upsert un entity — matchea por (agent_id, canonical_name, entity_type). */
  upsertEntity(input: UpsertEntityInput): Promise<MemoryEntity>;

  /** Crea un nuevo fact. No dedupea — la caller decide si es novedad. */
  createFact(input: CreateFactInput): Promise<MemoryFact>;

  /** Query: da entity + facts vigentes en `validAt` (default: now). */
  query(q: MemoryQuery): Promise<MemoryQueryResult>;

  /** Aplica un batch de extracted facts. Upserta entities, crea facts, dedupea básica. */
  applyExtracted(agentId: string, sourceCallId: string, facts: ExtractedFact[]): Promise<{
    entitiesUpserted: number;
    factsCreated:     number;
  }>;

  /** Marca un fact como no vigente (setea valid_to = now). Útil cuando el extractor detecta contradicción. */
  invalidateFact(factId: string, validTo?: string): Promise<void>;
}
