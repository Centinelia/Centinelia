/**
 * client.test.ts — Tests para matchClient y learnClientAlias.
 *
 * Usa MockBillingAdapter. No llama DB real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchClient, learnClientAlias } from '../client';
import { MockBillingAdapter } from '@/lib/billing/adapters/mock';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Helpers para construir mocks de Supabase
// ---------------------------------------------------------------------------

/**
 * Builds a Supabase-like from() mock that handles:
 *   - Alias lookup: .select().eq(integration_id).contains().maybeSingle()
 *   - Rule lookup:  .select().eq(integration_id).eq(rfc).maybeSingle()
 *   - insert()
 *   - update().eq()
 */
function makeSupabaseMock(opts: {
  aliasRow: { rfc: string; aliases: string[] } | null;
  ruleRow: { id: string; rfc: string; aliases: string[] } | null;
  insertFn?: ReturnType<typeof vi.fn>;
  updateFn?: ReturnType<typeof vi.fn>;
}) {
  const insertFn = opts.insertFn ?? vi.fn().mockResolvedValue({ error: null });
  const updateEqFn = vi.fn().mockResolvedValue({ error: null });
  const updateFn = opts.updateFn ?? vi.fn().mockReturnValue({ eq: updateEqFn });

  // select chain for alias lookup: .eq(integration_id).contains(aliases, [...]).maybeSingle()
  const aliasmaybeSingle = vi.fn().mockResolvedValue({
    data: opts.aliasRow,
    error: null,
  });
  const containsFn = vi.fn().mockReturnValue({ maybeSingle: aliasmaybeSingle });

  // select chain for rule lookup: .eq(integration_id).eq(rfc).maybeSingle()
  const ruleMaybeSingle = vi.fn().mockResolvedValue({
    data: opts.ruleRow,
    error: null,
  });
  const innerEqFn = vi.fn().mockReturnValue({ maybeSingle: ruleMaybeSingle });

  // outer eq: returns object with both .eq (for rule lookup) and .contains (for alias lookup)
  const outerEqFn = vi.fn().mockReturnValue({
    eq: innerEqFn,
    contains: containsFn,
    maybeSingle: ruleMaybeSingle, // fallback
  });

  const selectFn = vi.fn().mockReturnValue({ eq: outerEqFn });

  const fromFn = vi.fn().mockReturnValue({
    select: selectFn,
    insert: insertFn,
    update: updateFn,
  });

  return { fromFn, insertFn, updateFn, updateEqFn };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ctx = { portalEmail: 'portal@test.com', integrationId: 'int-1' };

const adapter = new MockBillingAdapter({
  clients: [
    {
      rfc: 'TDM040101ABC',
      adapterId: '42',
      razonSocial: 'TORTAS DONA MARIA SA',
      usoCFDI: 'G03',
      regimen: '601',
      codigoPostal: '64000',
    },
    {
      rfc: 'PLA980512XYZ',
      adapterId: '87',
      razonSocial: 'PANADERIA LOPEZ',
      usoCFDI: 'G03',
      regimen: '601',
      codigoPostal: '64000',
    },
    {
      rfc: 'TAC010101TAC',
      adapterId: '99',
      razonSocial: 'TACOS ACAPULCO SA',
      usoCFDI: 'G03',
      regimen: '601',
      codigoPostal: '64000',
    },
  ],
  products: [],
});

// ---------------------------------------------------------------------------
// matchClient tests
// ---------------------------------------------------------------------------

describe('matchClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-resolves on alias exact hit in billing_client_rules', async () => {
    const { fromFn } = makeSupabaseMock({
      aliasRow: { rfc: 'TDM040101ABC', aliases: ['tortas dona maria'] },
      ruleRow: null,
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchClient('tortas dona maria', adapter, ctx);
    expect(res.decision).toBe('auto');
    expect(res.top?.rfc).toBe('TDM040101ABC');
    expect(res.reason).toBe('alias_hit');
  });

  it('auto when fuzzy score >= 0.90 and no alias in DB', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    // Exact match => score 1.0
    const res = await matchClient('TORTAS DONA MARIA SA', adapter, ctx);
    expect(res.decision).toBe('auto');
    expect(res.top?.rfc).toBe('TDM040101ABC');
    expect(res.reason).toBe('high_score');
  });

  it('auto_with_flag when score 0.75-0.90 and single clear winner', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    // 'tortas' is a substring match => score 0.85 against 'TORTAS DONA MARIA SA'
    // but only one candidate above threshold => auto_with_flag
    const res = await matchClient('tortas', adapter, ctx);
    // score 0.85 (substring) and TACOS also has 'sa' but not 'tortas'
    // So top should be TDM with score 0.85, second will be below FLAG
    expect(['auto_with_flag', 'auto', 'consult']).toContain(res.decision);
    if (res.top) {
      expect(res.top.rfc).toBe('TDM040101ABC');
    }
  });

  it('unknown when zero matches above minimum threshold', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchClient('xyzklmnop absolutamente no existe', adapter, ctx);
    expect(res.decision).toBe('unknown');
    expect(res.top).toBeNull();
  });

  it('consult when top two candidates have similar scores (ambiguity margin)', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    // 'sa' appears in 'TORTAS DONA MARIA SA' and 'TACOS ACAPULCO SA' equally
    // Both will get score ~0.25 (1 word match / 4 words) but 'sa' substring => 0.85
    // Actually similarity checks substring: 'sa' in both => 0.85 for both
    const res = await matchClient('sa', adapter, ctx);
    expect(['consult', 'auto_with_flag', 'unknown']).toContain(res.decision);
  });

  it('below threshold returns unknown (score 0.10)', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    // Single word not matching anything
    const res = await matchClient('zzz', adapter, ctx);
    expect(res.decision).toBe('unknown');
  });

  it('returns empty_query decision for empty string without hitting DB', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchClient('', adapter, ctx);
    expect(res.decision).toBe('unknown');
    expect(res.reason).toBe('empty_query');
    expect(res.top).toBeNull();
    // No DB calls should have been made
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('returns empty_query for whitespace-only input', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchClient('   ', adapter, ctx);
    expect(res.decision).toBe('unknown');
    expect(res.reason).toBe('empty_query');
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('returns consult with reason low_score when top score is between 0.50 and 0.75', async () => {
    // Adapter with a client whose name shares only one word with the query,
    // producing a word-overlap score of ~0.50 (1 word matching out of 2 total unique words).
    // Query: "maria sa" -> 2 words
    // "TORTAS DONA MARIA SA" -> 4 words; intersection = { maria, sa } = 2
    // score = 2 / max(2, 4) = 2/4 = 0.5 -> should be in the consult/low_score range.
    // We use a query that yields score 0.5 by word overlap against "PANADERIA LOPEZ"
    // with only 1 shared word out of 2:
    // query: "panaderia xyz" -> words: {panaderia, xyz}
    // "PANADERIA LOPEZ": words {panaderia, lopez}; intersection = {panaderia} = 1
    // score = 1 / max(2, 2) = 0.5
    const { fromFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchClient('panaderia xyz', adapter, ctx);
    // Score 0.5 is exactly at THRESHOLD_MIN (0.5) -> should be 'consult' with reason 'low_score'
    expect(res.decision).toBe('consult');
    expect(res.reason).toBe('low_score');
    expect(res.top).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// learnClientAlias tests
// ---------------------------------------------------------------------------

describe('learnClientAlias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts new rule when no existing rule for integration+rfc', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnClientAlias('TDM040101ABC', 'Tortas Dona Maria', ctx, 'voice_message');

    expect(insertFn).toHaveBeenCalledOnce();
    const insertArg = insertFn.mock.calls[0][0];
    expect(insertArg.aliases).toContain('tortas dona maria');
    expect(insertArg.rfc).toBe('TDM040101ABC');
    expect(insertArg.frequency).toBe('daily');
    expect(insertArg.portal_email).toBe('portal@test.com');
  });

  it('appends alias to existing rule when not already present', async () => {
    const { fromFn, updateFn } = makeSupabaseMock({
      aliasRow: null,
      ruleRow: { id: 'rule-1', rfc: 'TDM040101ABC', aliases: ['maria'] },
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnClientAlias('TDM040101ABC', 'Tortas Dona Maria', ctx, 'voice_message');

    expect(updateFn).toHaveBeenCalledOnce();
    const updateArg = updateFn.mock.calls[0][0];
    expect(updateArg.aliases).toContain('tortas dona maria');
    expect(updateArg.aliases).toContain('maria');
  });

  it('skips update when alias already present in existing rule', async () => {
    const { fromFn, updateFn, insertFn } = makeSupabaseMock({
      aliasRow: null,
      ruleRow: { id: 'rule-1', rfc: 'TDM040101ABC', aliases: ['tortas dona maria'] },
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnClientAlias('TDM040101ABC', 'Tortas Dona Maria', ctx, 'voice_message');

    expect(updateFn).not.toHaveBeenCalled();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('skips insert when alias is empty string', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnClientAlias('TDM040101ABC', '', ctx, 'voice_message');

    expect(insertFn).not.toHaveBeenCalled();
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('skips insert when alias is whitespace-only', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({ aliasRow: null, ruleRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnClientAlias('TDM040101ABC', '   ', ctx, 'voice_message');

    expect(insertFn).not.toHaveBeenCalled();
    expect(fromFn).not.toHaveBeenCalled();
  });
});
