import { describe, it, expect, vi } from 'vitest';
import { buildDeck } from '../deck-builder';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

vi.mock('@/lib/documents/slides', () => ({
  generateSlides: vi.fn(async () => Buffer.from('fake-pptx-bytes')),
}));

vi.mock('@/lib/brand/kit', () => ({
  brandKitFromAgent: vi.fn(() => ({ businessName: 'Test Co', color: '#6C3BFF', logoUrl: null, footerText: null, colorSecondary: null, phone: null, website: null, address: null })),
}));

function mockSupabase() {
  return {
    storage: {
      from: () => ({
        upload:          vi.fn(async () => ({ error: null })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/deck.pptx' }, error: null })),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'doc-1' }, error: null }) }) }),
    }),
  } as any;
}

describe('buildDeck', () => {
  it('genera pitch deck PowerPoint cuando LLM devuelve JSON válido', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Propuesta ACME',
        slides: [
          { title: 'Portada', bullets: ['ACME'] },
          { title: 'Problema', bullets: ['Necesitan CRM', 'Falta integración'] },
        ],
      }) }],
    });
    const result = await buildDeck(
      { agentId: 'a1', agentName: 'Noah', businessName: 'Test Co', portalEmail: 'test@x.com', clientName: 'ACME', clientNeed: 'CRM', servicesKb: 'Ofrecemos CRM', extraContext: null },
      mockSupabase(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mime_type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(result.filename).toContain('pitch-deck');
    expect(result.document_id).toBe('doc-1');
  });

  it('retorna error cuando LLM devuelve JSON inválido', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'no soy json' }] });
    const result = await buildDeck(
      { agentId: 'a1', agentName: 'Noah', businessName: 'Test Co', portalEmail: 'test@x.com', clientName: 'ACME', clientNeed: 'X', servicesKb: null, extraContext: null },
      mockSupabase(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });
});
