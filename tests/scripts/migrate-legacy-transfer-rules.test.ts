/**
 * Unit tests para scripts/migrate-legacy-transfer-rules.ts.
 *
 * Mockea Supabase + Anthropic + logLlmCall.
 * No toca DB real ni llama LLM real.
 *
 * Casos cubiertos:
 * 1. Agent sin meerkat_role_id → skipped_no_role
 * 2. Texto claro → active=true, status=migrated
 * 3. Texto ambiguo → active=false, status=migrated
 * 4. Idempotencia: regla ya existe → skipped_duplicate
 * 5. Dry-run no inserta
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

// ─── Mocks deben declararse con vi.hoisted para evitar hoist issues ──────────

const { mockMessagesCreate, mockSupabaseFrom, mockLogLlmCall } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockSupabaseFrom:   vi.fn(),
  mockLogLlmCall:     vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
    constructor(_opts: unknown) {}
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockImplementation(() => ({
    from: mockSupabaseFrom,
  })),
}));

vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: mockLogLlmCall,
}));

// Importar DESPUÉS de los mocks
import {
  classifyTransferRules,
  isDuplicate,
  migrateAgent,
  type AgentRow,
} from '../../scripts/migrate-legacy-transfer-rules';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockAnthropicResponse(classification: 'clara' | 'ambigua', reason = 'test reason') {
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ classification, reason }) }],
    usage:   { input_tokens: 100, output_tokens: 20 },
  });
}

// Crea un mock de supabase chain reutilizable
function buildSupabaseChain(opts: {
  maybySingleData?: unknown;
  insertData?: unknown;
  insertError?: { message: string } | null;
}) {
  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    not:         vi.fn().mockReturnThis(),
    gt:          vi.fn().mockReturnThis(),
    contains:    vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: opts.maybySingleData ?? null, error: null }),
    single:      vi.fn().mockResolvedValue({ data: opts.insertData ?? null, error: opts.insertError ?? null }),
  };
  return chain;
}

// Mock de cliente Anthropic sin instanciar la clase real
function buildMockAnthropic(): Anthropic {
  return { messages: { create: mockMessagesCreate } } as unknown as Anthropic;
}

function buildMockSupabase(): SupabaseClient {
  return { from: mockSupabaseFrom } as unknown as SupabaseClient;
}

const BASE_AGENT: AgentRow = {
  id:             'agent-uuid-001',
  portal_email:   'empresa@example.com',
  transfer_rules: 'Transfiere siempre si el cliente menciona una queja.',
  features:       { meerkat_role_id: 'nelia' },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('migrate-legacy-transfer-rules', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key';
    process.env.ANTHROPIC_API_KEY         = 'fake-anthropic-key';
  });

  // ── classifyTransferRules ─────────────────────────────────────────────────

  describe('classifyTransferRules', () => {
    it('retorna clasificacion clara correctamente', async () => {
      mockAnthropicResponse('clara', 'es un imperativo claro');
      const anthropic = buildMockAnthropic();

      const result = await classifyTransferRules(anthropic, 'Transfiere si el cliente pide hablar con el gerente.', 'agent-1', 'test@test.com');

      expect(result.classification).toBe('clara');
      expect(result.reason).toBe('es un imperativo claro');
    });

    it('retorna clasificacion ambigua correctamente', async () => {
      mockAnthropicResponse('ambigua', 'notas sueltas sin formato imperativo');
      const anthropic = buildMockAnthropic();

      const result = await classifyTransferRules(anthropic, 'a veces transfiere cuando el dueno dice', 'agent-1', 'test@test.com');

      expect(result.classification).toBe('ambigua');
    });

    it('llama logLlmCall con source correcto (obligatorio por lint)', async () => {
      mockAnthropicResponse('clara');
      const anthropic = buildMockAnthropic();

      await classifyTransferRules(anthropic, 'texto claro', 'agent-1', 'test@test.com');

      expect(mockLogLlmCall).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'migrate_transfer_rules' }),
      );
    });

    it('lanza error si Sonnet devuelve JSON invalido', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'no es json valido' }],
        usage:   { input_tokens: 10, output_tokens: 5 },
      });
      const anthropic = buildMockAnthropic();

      await expect(
        classifyTransferRules(anthropic, 'texto', 'agent-1', null),
      ).rejects.toThrow('JSON inválido de Sonnet');
    });
  });

  // ── isDuplicate ───────────────────────────────────────────────────────────

  describe('isDuplicate', () => {
    it('retorna true si ya existe una regla con el mismo texto y meerkat', async () => {
      const chain = buildSupabaseChain({ maybySingleData: { id: 'existing-rule-id' } });
      mockSupabaseFrom.mockReturnValue(chain);

      const result = await isDuplicate(buildMockSupabase(), 'empresa@example.com', 'nelia', 'texto regla');

      expect(result).toBe(true);
    });

    it('retorna false si no existe', async () => {
      const chain = buildSupabaseChain({ maybySingleData: null });
      mockSupabaseFrom.mockReturnValue(chain);

      const result = await isDuplicate(buildMockSupabase(), 'empresa@example.com', 'nelia', 'texto nuevo');

      expect(result).toBe(false);
    });
  });

  // ── migrateAgent ──────────────────────────────────────────────────────────

  describe('migrateAgent', () => {
    it('skipped_no_role si agent no tiene meerkat_role_id en features', async () => {
      const agent: AgentRow = { ...BASE_AGENT, features: null };

      const result = await migrateAgent(buildMockSupabase(), buildMockAnthropic(), agent, false);

      expect(result.status).toBe('skipped_no_role');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('skipped_no_role si features existe pero sin meerkat_role_id', async () => {
      const agent: AgentRow = { ...BASE_AGENT, features: { otro_campo: 'valor' } };

      const result = await migrateAgent(buildMockSupabase(), buildMockAnthropic(), agent, false);

      expect(result.status).toBe('skipped_no_role');
    });

    it('skipped_duplicate si la regla ya existe en agent_rules', async () => {
      const chain = buildSupabaseChain({ maybySingleData: { id: 'existing' } });
      mockSupabaseFrom.mockReturnValue(chain);

      const result = await migrateAgent(buildMockSupabase(), buildMockAnthropic(), BASE_AGENT, false);

      expect(result.status).toBe('skipped_duplicate');
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('texto claro → active=true, status=migrated, ruleId correcto', async () => {
      // Primera llamada from: isDuplicate → null (no duplicado)
      const duplicateChain = buildSupabaseChain({ maybySingleData: null });
      // Segunda llamada from: insert → exito
      const insertChain    = buildSupabaseChain({ insertData: { id: 'new-rule-id' } });
      mockSupabaseFrom
        .mockReturnValueOnce(duplicateChain)
        .mockReturnValueOnce(insertChain);

      mockAnthropicResponse('clara');

      const result = await migrateAgent(buildMockSupabase(), buildMockAnthropic(), BASE_AGENT, false);

      expect(result.status).toBe('migrated');
      expect(result.classification).toBe('clara');
      expect(result.ruleId).toBe('new-rule-id');

      // Verificar que insert recibio active=true
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ active: true }),
      );
    });

    it('texto ambiguo → active=false, detalles con mensaje de migracion', async () => {
      const duplicateChain = buildSupabaseChain({ maybySingleData: null });
      const insertChain    = buildSupabaseChain({ insertData: { id: 'new-rule-id-ambig' } });
      mockSupabaseFrom
        .mockReturnValueOnce(duplicateChain)
        .mockReturnValueOnce(insertChain);

      mockAnthropicResponse('ambigua');

      const result = await migrateAgent(buildMockSupabase(), buildMockAnthropic(), BASE_AGENT, false);

      expect(result.status).toBe('migrated');
      expect(result.classification).toBe('ambigua');

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          active:   false,
          detalles: expect.stringContaining('Regla migrada de la sección Reglas de transferencia anterior'),
        }),
      );
    });

    it('dry_run no llama a insert en Supabase', async () => {
      const duplicateChain = buildSupabaseChain({ maybySingleData: null });
      mockSupabaseFrom.mockReturnValue(duplicateChain);

      mockAnthropicResponse('clara');

      const result = await migrateAgent(buildMockSupabase(), buildMockAnthropic(), BASE_AGENT, true);

      expect(result.status).toBe('dry_run');
      // Solo se llamo la cadena de isDuplicate, nunca insert
      expect(duplicateChain.insert).not.toHaveBeenCalled();
    });

    it('idempotencia: segundo run del mismo agente → skipped_duplicate', async () => {
      // Primera corrida: sin duplicado → migra
      const dup1 = buildSupabaseChain({ maybySingleData: null });
      const ins1 = buildSupabaseChain({ insertData: { id: 'rule-1' } });
      // Segunda corrida: ya existe → skip
      const dup2 = buildSupabaseChain({ maybySingleData: { id: 'rule-1' } });

      mockSupabaseFrom
        .mockReturnValueOnce(dup1)
        .mockReturnValueOnce(ins1)
        .mockReturnValueOnce(dup2);

      mockAnthropicResponse('clara');
      const anthropic = buildMockAnthropic();
      const supabase  = buildMockSupabase();

      const first  = await migrateAgent(supabase, anthropic, BASE_AGENT, false);
      const second = await migrateAgent(supabase, anthropic, BASE_AGENT, false);

      expect(first.status).toBe('migrated');
      expect(second.status).toBe('skipped_duplicate');
    });

    it('insert con created_by = migration_2026-09-25', async () => {
      const duplicateChain = buildSupabaseChain({ maybySingleData: null });
      const insertChain    = buildSupabaseChain({ insertData: { id: 'new-rule' } });
      mockSupabaseFrom
        .mockReturnValueOnce(duplicateChain)
        .mockReturnValueOnce(insertChain);

      mockAnthropicResponse('clara');

      await migrateAgent(buildMockSupabase(), buildMockAnthropic(), BASE_AGENT, false);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ created_by: 'migration_2026-09-25' }),
      );
    });

    it('insert incluye applies_to con el meerkat_role_id del agente', async () => {
      const duplicateChain = buildSupabaseChain({ maybySingleData: null });
      const insertChain    = buildSupabaseChain({ insertData: { id: 'new-rule' } });
      mockSupabaseFrom
        .mockReturnValueOnce(duplicateChain)
        .mockReturnValueOnce(insertChain);

      mockAnthropicResponse('clara');

      await migrateAgent(buildMockSupabase(), buildMockAnthropic(), BASE_AGENT, false);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ applies_to: ['nelia'] }),
      );
    });
  });

});
