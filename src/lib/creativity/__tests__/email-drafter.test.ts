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
  it('inyecta saludo cuando la primera sección no arranca con uno', async () => {
    const result = await draftEmail(
      { title: 'Cot', sections: [{ heading: 'Precio', body: 'El precio es X.' }], closing: 'Saludos.' },
      { id: 'a1', agent_name: 'Noah' },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plain_body).toMatch(/^Hola,/);
    expect(result.html_body).toContain('Hola,');
  });

  it('respeta el saludo cuando el LLM ya lo puso', async () => {
    const result = await draftEmail(
      { title: 'Cot', sections: [{ heading: '', body: 'Buenos días Juan, quería contarte...' }], closing: 'Saludos.' },
      { id: 'a1', agent_name: 'Noah' },
      {} as any,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // El plain_body NO debe tener "Hola," duplicado — el saludo original ya está
    expect(result.plain_body.match(/Buenos días/g)?.length).toBe(1);
    expect(result.plain_body.startsWith('Hola,')).toBe(false);
  });

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
