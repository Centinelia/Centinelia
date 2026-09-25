/**
 * Unit tests para src/lib/agent-rules/service.ts.
 * Mockea Supabase y consumeAiOp — sin DB ni pool real.
 *
 * Cubre los invariantes del spec Sección 4.4 + 8.1:
 * - createRule inserta + cobra 1 op + invalida cache
 * - updateRule no cobra
 * - deleteRule no cobra
 * - listRulesForOrg filtra por portal_email
 * - getRulesForAgent llama el RPC con params correctos
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks ANTES de importar el módulo bajo test
const mockInsert   = vi.fn();
const mockUpdate   = vi.fn();
const mockDelete   = vi.fn();
const mockSelect   = vi.fn();
const mockEq       = vi.fn();
const mockOrder    = vi.fn();
const mockSingle   = vi.fn();
const mockRpc      = vi.fn();
const mockFrom     = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc:  mockRpc,
  }),
}));

vi.mock('@/lib/agent-rules/validation', () => ({
  validateCreateRuleInput: vi.fn(),
}));

vi.mock('@/lib/agent-rules/cache', () => ({
  invalidateRulesCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 300 }),
}));

import {
  createRule,
  updateRule,
  deleteRule,
  listRulesForOrg,
  getRulesForAgent,
} from '@/lib/agent-rules/service';
import { validateCreateRuleInput } from '@/lib/agent-rules/validation';
import { invalidateRulesCache } from '@/lib/agent-rules/cache';
import { consumeAiOp } from '@/lib/ai/ops-guard';

const mockValidate    = vi.mocked(validateCreateRuleInput);
const mockInvalidate  = vi.mocked(invalidateRulesCache);
const mockConsumeAiOp = vi.mocked(consumeAiOp);

const PORTAL_EMAIL = 'test@empresa.com';

const RULE_ROW = {
  id:           'rule-uuid-123',
  portal_email: PORTAL_EMAIL,
  regla:        'Nunca ofrecemos descuentos sin aprobación',
  detalles:     null,
  applies_to:   [],
  active:       true,
  created_at:   '2026-09-24T12:00:00Z',
  updated_at:   '2026-09-24T12:00:00Z',
  created_by:   null,
};

// Helper para construir una cadena de query Supabase simulada
function buildSupabaseChain(returnValue: { data: unknown; error: null | { message: string } }) {
  const chain = {
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    limit:       vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue(returnValue),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'primary-agent-id' }, error: null }),
  };
  return chain;
}

describe('agent-rules service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockResolvedValue({ ok: true });
  });

  // ─── createRule ───────────────────────────────────────────────────────────

  it('createRule llama validateCreateRuleInput con rosterCheck=true', async () => {
    const chain = buildSupabaseChain({ data: RULE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await createRule({
      portalEmail: PORTAL_EMAIL,
      regla:       'Regla de prueba',
      applies_to:  ['nala'],
    });

    expect(mockValidate).toHaveBeenCalledWith(
      expect.objectContaining({ regla: 'Regla de prueba' }),
      { rosterCheck: true },
    );
  });

  it('createRule lanza error si la validación falla', async () => {
    mockValidate.mockResolvedValue({ ok: false, error: 'La regla no puede estar vacía' });

    await expect(
      createRule({ portalEmail: PORTAL_EMAIL, regla: '', applies_to: [] }),
    ).rejects.toThrow('La regla no puede estar vacía');

    // No debe haber llamado a Supabase
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('createRule inserta en agent_rules y retorna el row', async () => {
    const chain = buildSupabaseChain({ data: RULE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await createRule({
      portalEmail: PORTAL_EMAIL,
      regla:       'Nunca ofrecemos descuentos sin aprobación',
      applies_to:  [],
    });

    expect(mockFrom).toHaveBeenCalledWith('agent_rules');
    expect(chain.insert).toHaveBeenCalled();
    expect(result.id).toBe('rule-uuid-123');
    expect(result.portal_email).toBe(PORTAL_EMAIL);
  });

  it('createRule llama consumeAiOp para cobrar 1 op de setup', async () => {
    const chain = buildSupabaseChain({ data: RULE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await createRule({
      portalEmail: PORTAL_EMAIL,
      regla:       'Regla de prueba',
      applies_to:  [],
    });

    // Fix I1 (Round 1): service.ts usa reason + rule_id estructurado + applies_to.
    expect(mockConsumeAiOp).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.objectContaining({ reason: 'rule_setup', rule_id: 'rule-uuid-123', applies_to: [] }),
    );
  });

  it('createRule invalida el cache después de insertar', async () => {
    const chain = buildSupabaseChain({ data: RULE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await createRule({
      portalEmail: PORTAL_EMAIL,
      regla:       'Regla para cache test',
      applies_to:  [],
    });

    expect(mockInvalidate).toHaveBeenCalledWith(PORTAL_EMAIL);
  });

  it('createRule lanza error si Supabase falla en insert', async () => {
    const chain = buildSupabaseChain({ data: null, error: { message: 'DB error' } });
    mockFrom.mockReturnValue(chain);

    await expect(
      createRule({ portalEmail: PORTAL_EMAIL, regla: 'Regla', applies_to: [] }),
    ).rejects.toThrow('DB error');
  });

  // ─── updateRule ───────────────────────────────────────────────────────────

  it('updateRule llama update en Supabase y retorna el row actualizado', async () => {
    const updated = { ...RULE_ROW, regla: 'Regla editada' };
    const chain = buildSupabaseChain({ data: updated, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await updateRule('rule-uuid-123', { regla: 'Regla editada' });

    expect(mockFrom).toHaveBeenCalledWith('agent_rules');
    expect(chain.update).toHaveBeenCalled();
    expect(result.regla).toBe('Regla editada');
  });

  it('updateRule NO llama consumeAiOp (editar no cobra)', async () => {
    const chain = buildSupabaseChain({ data: RULE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await updateRule('rule-uuid-123', { regla: 'Regla editada' });

    expect(mockConsumeAiOp).not.toHaveBeenCalled();
  });

  it('updateRule invalida el cache después de actualizar', async () => {
    const chain = buildSupabaseChain({ data: RULE_ROW, error: null });
    mockFrom.mockReturnValue(chain);

    await updateRule('rule-uuid-123', { regla: 'Regla editada' });

    expect(mockInvalidate).toHaveBeenCalledWith(PORTAL_EMAIL);
  });

  // ─── deleteRule ───────────────────────────────────────────────────────────

  it('deleteRule llama delete en Supabase y NO cobra', async () => {
    const selectChain = buildSupabaseChain({
      data: { portal_email: PORTAL_EMAIL },
      error: null,
    });
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    };
    // Primera llamada: select para obtener portal_email; segunda: delete
    mockFrom
      .mockReturnValueOnce(selectChain)
      .mockReturnValueOnce(deleteChain);

    await deleteRule('rule-uuid-123');

    expect(mockConsumeAiOp).not.toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalledWith(PORTAL_EMAIL);
  });

  // ─── listRulesForOrg ─────────────────────────────────────────────────────

  it('listRulesForOrg retorna array filtrado por portal_email', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [RULE_ROW], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    const result = await listRulesForOrg(PORTAL_EMAIL);

    expect(mockFrom).toHaveBeenCalledWith('agent_rules');
    expect(chain.eq).toHaveBeenCalledWith('portal_email', PORTAL_EMAIL);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('rule-uuid-123');
  });

  it('listRulesForOrg con activeOnly filtra por active=true', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(chain);

    await listRulesForOrg(PORTAL_EMAIL, { activeOnly: true });

    // Debe haber llamado .eq('active', true)
    expect(chain.eq).toHaveBeenCalledWith('active', true);
  });

  // ─── getRulesForAgent ────────────────────────────────────────────────────

  it('getRulesForAgent llama RPC get_rules_for_agent con params correctos', async () => {
    mockRpc.mockResolvedValue({ data: [RULE_ROW], error: null });

    const result = await getRulesForAgent(PORTAL_EMAIL, 'nala');

    expect(mockRpc).toHaveBeenCalledWith('get_rules_for_agent', {
      p_portal_email:     PORTAL_EMAIL,
      p_meerkat_role_id:  'nala',
    });
    expect(result).toHaveLength(1);
  });

  it('getRulesForAgent retorna array vacío si RPC no encuentra nada', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await getRulesForAgent(PORTAL_EMAIL, 'nia');

    expect(result).toEqual([]);
  });
});
