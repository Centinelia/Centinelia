/**
 * Types del memory graph (F9.1).
 *
 * Modelo simple: entities (nodos) + facts (edges) con memoria temporal.
 * Predicate es un string libre pero convencionamos un vocabulario abajo para
 * que el extractor y el prompt-builder hablen la misma lengua.
 */

export type EntityType = 'customer' | 'business' | 'employee' | 'place' | 'other';

/** Vocabulario de predicates. El extractor debe usar SOLO estos. */
export const PREDICATES = [
  // Financieros
  'owes',                  // Juan owes $8,500
  'paid_on',               // Juan paid_on 2026-07-15 (object_date + object_number)
  'promised_to_pay_on',    // Juan promised_to_pay_on 2026-07-30
  'has_debt_of',           // Juan has_debt_of $8,500
  'has_credit_of',         // Juan has_credit_of $500

  // Contacto
  'lives_at',              // Juan lives_at Colonia Centro (object_text)
  'works_at',              // Juan works_at Constructora ABC (object_entity_id o object_text)
  'phone_is',              // Juan phone_is +52...
  'email_is',              // Juan email_is x@y.com

  // Eventos
  'called_about',          // Juan called_about "reclamo de cobro" (object_text)
  'complained_about',      // Juan complained_about "trato en sucursal"
  'requested',             // Juan requested "cita para el martes"
  'scheduled_for',         // Cita scheduled_for 2026-07-30 (object_date)
  'canceled',              // Juan canceled "cita del martes"

  // Preferencias / estado
  'prefers',               // Juan prefers "pago por WhatsApp"
  'speaks_language',       // Juan speaks_language "español"
  'account_status_is',     // Juan account_status_is "moroso" | "al corriente" | "en negociación"
] as const;

export type Predicate = typeof PREDICATES[number];

export interface MemoryEntity {
  id:             string;
  agentId:        string;
  entityType:     EntityType;
  name:           string;
  canonicalName:  string;
  attributes:     Record<string, unknown>;    // phone_number, email, rfc, address, ...
  createdAt:      string;
  updatedAt:      string;
}

export interface MemoryFact {
  id:             string;
  agentId:        string;
  subjectId:      string;
  predicate:      Predicate | string;         // string libre para forward-compat
  objectText?:    string | null;
  objectEntityId?: string | null;
  objectNumber?:  number | null;
  objectDate?:    string | null;
  validFrom:      string;
  validTo?:       string | null;
  sourceCallId?:  string | null;
  confidence:     number;
  createdAt:      string;
}

/** Payload que el extractor devuelve por cada fact detectado en un transcript. */
export interface ExtractedFact {
  subject:      { name: string; type: EntityType };
  predicate:    Predicate;
  object?:      {
    text?:      string;
    entity?:    { name: string; type: EntityType };
    number?:    number;
    date?:      string;   // ISO 8601
  };
  confidence?:  number;   // 0..1, default 1.0
}

/** Query parameters para consultar el grafo. */
export interface MemoryQuery {
  agentId:              string;
  entityCanonicalName?: string;      // "juan perez"
  entityPhone?:         string;      // "+528112345678"
  entityEmail?:         string;
  predicates?:          string[];    // filtrar por tipos de fact
  validAt?:             string;      // ISO 8601 — solo facts vigentes en este momento (default now)
  limit?:               number;      // default 50
}

export interface MemoryQueryResult {
  entity:  MemoryEntity | null;
  facts:   MemoryFact[];
}

/** Utilidad — normaliza un nombre para dedup: lowercase + sin acentos. */
export function canonicalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Utilidad — normaliza un teléfono (quita todo lo no dígito, mantiene +). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return digits.length >= 10 ? `+${digits.replace(/^\+?/, '')}` : raw;
}
