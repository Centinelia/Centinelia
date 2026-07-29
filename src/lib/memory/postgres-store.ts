/**
 * PostgresStore — implementación de MemoryStore sobre Supabase.
 *
 * Nada exótico: dos tablas (memory_entities + memory_facts), UPSERT por
 * canonical_name, query con filtro temporal (validAt entre valid_from y
 * valid_to). Recursive CTE queda disponible para futuros multi-hop.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { canonicalize, normalizePhone } from './types';
import type {
  MemoryStore, UpsertEntityInput, CreateFactInput,
} from './store';
import type {
  MemoryEntity, MemoryFact, MemoryQuery, MemoryQueryResult, ExtractedFact,
} from './types';

// ── Row helpers ─────────────────────────────────────────────────────────────

interface EntityRow {
  id:             string;
  agent_id:       string;
  entity_type:    string;
  name:           string;
  canonical_name: string;
  attributes:     Record<string, unknown>;
  created_at:     string;
  updated_at:     string;
}

interface FactRow {
  id:               string;
  agent_id:         string;
  subject_id:       string;
  predicate:        string;
  object_text:      string | null;
  object_entity_id: string | null;
  object_number:    number | null;
  object_date:      string | null;
  valid_from:       string;
  valid_to:         string | null;
  source_call_id:   string | null;
  confidence:       number;
  created_at:       string;
}

function toEntity(r: EntityRow): MemoryEntity {
  return {
    id:            r.id,
    agentId:       r.agent_id,
    entityType:    r.entity_type as MemoryEntity['entityType'],
    name:          r.name,
    canonicalName: r.canonical_name,
    attributes:    r.attributes ?? {},
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  };
}

function toFact(r: FactRow): MemoryFact {
  return {
    id:             r.id,
    agentId:        r.agent_id,
    subjectId:      r.subject_id,
    predicate:      r.predicate,
    objectText:     r.object_text,
    objectEntityId: r.object_entity_id,
    objectNumber:   r.object_number,
    objectDate:     r.object_date,
    validFrom:      r.valid_from,
    validTo:        r.valid_to,
    sourceCallId:   r.source_call_id,
    confidence:     r.confidence,
    createdAt:      r.created_at,
  };
}

// ── Implementation ──────────────────────────────────────────────────────────

export function createPostgresStore(): MemoryStore {
  const supabase = createAdminClient();

  return {
    async upsertEntity(input: UpsertEntityInput): Promise<MemoryEntity> {
      const canonical = canonicalize(input.name);
      const attrs     = input.attributes ?? {};

      // Merge attributes si el entity ya existe
      const { data: existing } = await supabase
        .from('memory_entities')
        .select('*')
        .eq('agent_id', input.agentId)
        .eq('canonical_name', canonical)
        .eq('entity_type', input.entityType)
        .maybeSingle();

      if (existing) {
        const mergedAttrs = { ...(existing.attributes as Record<string, unknown>), ...attrs };
        const { data: updated } = await supabase
          .from('memory_entities')
          .update({ name: input.name, attributes: mergedAttrs, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .single();
        return toEntity(updated as EntityRow);
      }

      const { data: inserted, error } = await supabase
        .from('memory_entities')
        .insert({
          agent_id:       input.agentId,
          entity_type:    input.entityType,
          name:           input.name,
          canonical_name: canonical,
          attributes:     attrs,
        })
        .select('*')
        .single();
      if (error) throw new Error(`upsertEntity: ${error.message}`);
      return toEntity(inserted as EntityRow);
    },

    async createFact(input: CreateFactInput): Promise<MemoryFact> {
      const { data, error } = await supabase
        .from('memory_facts')
        .insert({
          agent_id:         input.agentId,
          subject_id:       input.subjectId,
          predicate:        input.predicate,
          object_text:      input.objectText     ?? null,
          object_entity_id: input.objectEntityId ?? null,
          object_number:    input.objectNumber   ?? null,
          object_date:      input.objectDate     ?? null,
          valid_from:       input.validFrom      ?? new Date().toISOString(),
          source_call_id:   input.sourceCallId   ?? null,
          confidence:       input.confidence     ?? 1.0,
        })
        .select('*')
        .single();
      if (error) throw new Error(`createFact: ${error.message}`);
      return toFact(data as FactRow);
    },

    async query(q: MemoryQuery): Promise<MemoryQueryResult> {
      const validAt = q.validAt ?? new Date().toISOString();
      const limit   = q.limit ?? 50;

      // 1. Resolver la entity — por canonical_name, phone, o email
      let entityQ = supabase
        .from('memory_entities')
        .select('*')
        .eq('agent_id', q.agentId)
        .limit(1);

      if (q.entityCanonicalName) {
        entityQ = entityQ.eq('canonical_name', canonicalize(q.entityCanonicalName));
      } else if (q.entityPhone) {
        entityQ = entityQ.eq('attributes->>phone_number', normalizePhone(q.entityPhone));
      } else if (q.entityEmail) {
        entityQ = entityQ.eq('attributes->>email', q.entityEmail.toLowerCase());
      } else {
        return { entity: null, facts: [] };
      }

      const { data: entityRow } = await entityQ.maybeSingle();
      if (!entityRow) return { entity: null, facts: [] };

      // 2. Facts vigentes para esa entity
      let factQ = supabase
        .from('memory_facts')
        .select('*')
        .eq('agent_id', q.agentId)
        .eq('subject_id', entityRow.id)
        .lte('valid_from', validAt)
        .or(`valid_to.is.null,valid_to.gt.${validAt}`)
        .order('valid_from', { ascending: false })
        .limit(limit);

      if (q.predicates && q.predicates.length > 0) {
        factQ = factQ.in('predicate', q.predicates);
      }

      const { data: facts } = await factQ;

      return {
        entity: toEntity(entityRow as EntityRow),
        facts:  (facts ?? []).map(f => toFact(f as FactRow)),
      };
    },

    async applyExtracted(agentId: string, sourceCallId: string, facts: ExtractedFact[]): Promise<{ entitiesUpserted: number; factsCreated: number }> {
      let entitiesUpserted = 0;
      let factsCreated     = 0;

      for (const f of facts) {
        // Upsert subject entity
        const subject = await this.upsertEntity({
          agentId,
          entityType: f.subject.type,
          name:       f.subject.name,
        });
        entitiesUpserted++;

        // Upsert object entity si aplica
        let objectEntityId: string | undefined;
        if (f.object?.entity) {
          const obj = await this.upsertEntity({
            agentId,
            entityType: f.object.entity.type,
            name:       f.object.entity.name,
          });
          objectEntityId = obj.id;
          entitiesUpserted++;
        }

        // Create fact
        await this.createFact({
          agentId,
          subjectId:      subject.id,
          predicate:      f.predicate,
          objectText:     f.object?.text,
          objectEntityId,
          objectNumber:   f.object?.number,
          objectDate:     f.object?.date,
          sourceCallId,
          confidence:     f.confidence ?? 1.0,
        });
        factsCreated++;
      }

      return { entitiesUpserted, factsCreated };
    },

    async invalidateFact(factId: string, validTo?: string): Promise<void> {
      await supabase
        .from('memory_facts')
        .update({ valid_to: validTo ?? new Date().toISOString() })
        .eq('id', factId);
    },
  };
}
