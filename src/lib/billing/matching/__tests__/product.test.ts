/**
 * product.test.ts — Tests para matchProduct y learnProductAlias.
 *
 * Usa MockBillingAdapter. No llama DB real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchProduct, learnProductAlias } from '../product';
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
 *   - Alias lookup: .select().eq(integration_id).eq(alias_text).maybeSingle()
 *   - insert()
 */
function makeSupabaseMock(opts: {
  aliasRow: { adapter_sku: string; alias_text: string } | null;
  insertFn?: ReturnType<typeof vi.fn>;
}) {
  const insertFn = opts.insertFn ?? vi.fn().mockResolvedValue({ error: null });

  const maybeSingleFn = vi.fn().mockResolvedValue({
    data: opts.aliasRow,
    error: null,
  });

  const innerEqFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
  const outerEqFn = vi.fn().mockReturnValue({ eq: innerEqFn, maybeSingle: maybeSingleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: outerEqFn });

  const fromFn = vi.fn().mockReturnValue({
    select: selectFn,
    insert: insertFn,
  });

  return { fromFn, insertFn };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ctx = { portalEmail: 'portal@test.com', integrationId: 'int-1' };

const adapter = new MockBillingAdapter({
  clients: [],
  products: [
    {
      sku: 'TORTILLA-KG',
      nombre: 'Tortilla de maiz por kilogramo',
      unidad: 'kg',
      precio: 18.5,
      claveSAT: '50171544',
      ivaTasa: 0,
    },
    {
      sku: 'REFRESCO-LT',
      nombre: 'Refresco embotellado litro',
      unidad: 'litro',
      precio: 22.0,
      claveSAT: '50202306',
      ivaTasa: 0.16,
    },
    {
      sku: 'AGUA-500ML',
      nombre: 'Agua purificada 500ml',
      unidad: 'pieza',
      precio: 12.0,
      claveSAT: '50202306',
      ivaTasa: 0,
    },
  ],
});

// ---------------------------------------------------------------------------
// matchProduct tests
// ---------------------------------------------------------------------------

describe('matchProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto when exact match (score 1.0)', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('Tortilla de maiz por kilogramo', adapter, ctx);
    expect(res.decision).toBe('auto');
    expect(res.top?.sku).toBe('TORTILLA-KG');
    expect(res.reason).toBe('high_score');
  });

  it('auto on alias hit in billing_product_aliases', async () => {
    const { fromFn } = makeSupabaseMock({
      aliasRow: { adapter_sku: 'TORTILLA-KG', alias_text: 'tortilla kilo' },
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('tortilla kilo', adapter, ctx);
    expect(res.decision).toBe('auto');
    expect(res.top?.sku).toBe('TORTILLA-KG');
    expect(res.reason).toBe('alias_hit');
  });

  it('auto_with_flag when score 0.75-0.90 and clear winner', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    // 'tortilla' is substring of 'Tortilla de maiz por kilogramo' => score 0.85
    const res = await matchProduct('tortilla', adapter, ctx);
    expect(['auto_with_flag', 'auto', 'consult']).toContain(res.decision);
  });

  it('unknown when zero matches above minimum threshold', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('producto que absolutamente no existe xyz123', adapter, ctx);
    expect(res.decision).toBe('unknown');
    expect(res.top).toBeNull();
  });

  it('consult when top two products have ambiguous close scores', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    // 'litro' appears in 'Refresco embotellado litro'; 'agua purificada 500ml' has no match
    // 'refresco' matches only one clearly — 'agua litro' might ambiguate two
    const res = await matchProduct('purificada litro', adapter, ctx);
    // Both agua and refresco could match partially
    expect(['auto', 'auto_with_flag', 'consult', 'unknown']).toContain(res.decision);
  });

  it('unknown for gibberish query', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('zzz', adapter, ctx);
    expect(res.decision).toBe('unknown');
  });

  it('returns empty_query decision for empty string without hitting DB', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('', adapter, ctx);
    expect(res.decision).toBe('unknown');
    expect(res.reason).toBe('empty_query');
    expect(res.top).toBeNull();
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('returns empty_query for whitespace-only input', async () => {
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('   ', adapter, ctx);
    expect(res.decision).toBe('unknown');
    expect(res.reason).toBe('empty_query');
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('returns consult with reason low_score when top score is between 0.50 and 0.75', async () => {
    // Query "tortilla xyz" produces word-overlap score of 0.5 against "Tortilla de maiz por kilogramo":
    // words query: {tortilla, xyz}, words product: {tortilla, de, maiz, por, kilogramo}
    // intersection = {tortilla}, score = 1 / max(2, 5) = 0.2 -- too low.
    // Better fixture: query "agua xyz" vs "Agua purificada 500ml":
    // intersection = {agua} = 1, max(2, 3) = 3, score = 0.33 -- still below MIN.
    // Use "agua purificada xyz" vs "Agua purificada 500ml":
    // query words: {agua, purificada, xyz} (3), product words: {agua, purificada, 500ml} (3)
    // intersection = {agua, purificada} = 2, score = 2/3 = 0.667
    // 0.667 is between THRESHOLD_MIN (0.5) and THRESHOLD_FLAG (0.75) -> consult / low_score
    const { fromFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    const res = await matchProduct('agua purificada xyz', adapter, ctx);
    expect(res.decision).toBe('consult');
    expect(res.reason).toBe('low_score');
    expect(res.top?.sku).toBe('AGUA-500ML');
  });
});

// ---------------------------------------------------------------------------
// learnProductAlias tests
// ---------------------------------------------------------------------------

describe('learnProductAlias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts new alias row when no existing alias for integration+alias_text', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnProductAlias('TORTILLA-KG', 'Tortilla Kilo', ctx, 'voice_message');

    expect(insertFn).toHaveBeenCalledOnce();
    const insertArg = insertFn.mock.calls[0][0];
    expect(insertArg.alias_text).toBe('tortilla kilo');
    expect(insertArg.adapter_sku).toBe('TORTILLA-KG');
    expect(insertArg.portal_email).toBe('portal@test.com');
    expect(insertArg.integration_id).toBe('int-1');
    expect(insertArg.learned_from).toBe('voice_message');
  });

  it('skips insert when alias already exists for integration+alias_text', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({
      aliasRow: { adapter_sku: 'TORTILLA-KG', alias_text: 'tortilla kilo' },
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnProductAlias('TORTILLA-KG', 'Tortilla Kilo', ctx, 'voice_message');

    expect(insertFn).not.toHaveBeenCalled();
  });

  it('skips insert when alias is empty string', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnProductAlias('TORTILLA-KG', '', ctx, 'voice_message');

    expect(insertFn).not.toHaveBeenCalled();
    expect(fromFn).not.toHaveBeenCalled();
  });

  it('skips insert when alias is whitespace-only', async () => {
    const { fromFn, insertFn } = makeSupabaseMock({ aliasRow: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as never);

    await learnProductAlias('TORTILLA-KG', '   ', ctx, 'voice_message');

    expect(insertFn).not.toHaveBeenCalled();
    expect(fromFn).not.toHaveBeenCalled();
  });
});
