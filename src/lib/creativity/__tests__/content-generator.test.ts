import { describe, it, expect, vi } from 'vitest';
import { generateStructuredContent } from '../content-generator';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const CTX_BASE = {
  agentName:    'Noah',
  businessName: 'Test Co',
  clientName:   'ACME',
  clientNeed:   'Necesitan CRM',
  servicesKb:   'Ofrecemos CRM + integración por 50k MXN',
  extraContext: null,
};

describe('generateStructuredContent', () => {
  it('devuelve StructuredContent con secciones cuando LLM retorna JSON válido', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'text',
        text: JSON.stringify({
          title:    'Propuesta CRM para ACME',
          sections: [
            { heading: 'Objetivo', body: 'Implementar CRM operativo en 30 días.' },
            { heading: 'Alcance',  body: 'Migración de datos y capacitación.', bullets: ['Setup', 'Migración', 'Training'] },
          ],
          closing: 'Quedamos atentos a cualquier duda.',
        }),
      }],
    });

    const result = await generateStructuredContent('propuesta', CTX_BASE);
    expect(result.title).toBe('Propuesta CRM para ACME');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[1].bullets).toEqual(['Setup', 'Migración', 'Training']);
    expect(result.closing).toBe('Quedamos atentos a cualquier duda.');
  });

  it('devuelve estructura mínima cuando LLM retorna JSON inválido', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'no soy JSON' }],
    });
    const result = await generateStructuredContent('cotizacion', CTX_BASE);
    expect(result.title).toBeTruthy();
    expect(result.sections).toEqual([]);
    expect(result.closing).toBeNull();
  });
});
