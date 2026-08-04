import { describe, it, expect, vi } from 'vitest';
import { buildDocument } from '../document-builder';

vi.mock('@/lib/brand/kit', () => ({
  brandKitFromAgent: vi.fn(() => ({ color: '#6C3BFF', logoUrl: null, footer: 'Test Co', website: null, address: null })),
}));

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(async () => Buffer.from('fake-pdf-bytes')),
}));

vi.mock('@/lib/pdf/doc', () => ({
  GenericDocPDF: () => null,
  ProposalPDF:   () => null,
  LetterPDF:     () => null,
}));

function mockSupabase() {
  const ops: any[] = [];
  return {
    ops,
    storage: {
      from: () => ({
        upload:            vi.fn(async () => ({ error: null })),
        createSignedUrl:   vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/foo.pdf' }, error: null })),
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),  // no custom template
          }),
        }),
      }),
      insert: (row: any) => {
        ops.push({ table, op: 'insert', row });
        return { select: () => ({ single: async () => ({ data: { id: 'doc-1' }, error: null }) }) };
      },
    }),
  } as any;
}

describe('buildDocument', () => {
  it('renderiza PDF built-in y guarda en ops_documents cuando no hay custom template', async () => {
    const supabase = mockSupabase();
    const res = await buildDocument(
      'propuesta',
      { title: 'Prop ACME', sections: [{ heading: 'Objetivo', body: 'Body' }], closing: 'Saludos.' },
      { id: 'agent-1', agent_name: 'Noah', portal_email: 'test@x.com' },
      supabase,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.filename).toContain('propuesta');
    expect(res.mime_type).toBe('application/pdf');
    expect(supabase.ops.find((o: any) => o.table === 'ops_documents')).toBeTruthy();
  });
});
