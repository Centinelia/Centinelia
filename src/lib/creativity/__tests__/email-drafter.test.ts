import { describe, it, expect, vi } from 'vitest';
import { draftEmail } from '../email-drafter';

vi.mock('@/lib/email/send', () => ({
  shell:         (html: string) => `<html>${html}</html>`,
  heading:       (t: string) => `<h1>${t}</h1>`,
  infoCard:      (b: string) => `<div>${b}</div>`,
  mdToEmailHtml: (md: string) => `<p>${md}</p>`,
  agentBrandedFrom: (name: string | null) => `${name ?? 'Centinelia'} <no-reply@centinelia.mx>`,
}));

describe('draftEmail', () => {
  it('produce subject + html + plain con secciones', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } as any;
    const result = await draftEmail(
      { title: 'Seguimiento propuesta', sections: [{ heading: 'Contexto', body: 'Después de la llamada...' }], closing: 'Saludos, Noah.' },
      { id: 'a1', agent_name: 'Noah' },
      supabase,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.subject).toBe('Seguimiento propuesta');
    expect(result.html_body).toContain('Contexto');
    expect(result.plain_body).toContain('Después de la llamada');
    expect(result.plain_body).toContain('Saludos, Noah.');
  });
});
