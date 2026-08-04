// src/lib/nox/__tests__/brief-renderer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderBrief } from '../brief-renderer';
import type { BriefData } from '../brief-collector';

// Shared mock fn so all Anthropic instances use the same spy
const mockCreate = vi.fn(async () => ({
  content: [{ type: 'text', text: JSON.stringify({
    accion: ['Responder correo urgente de ACME (recibido hace 3h)'],
    prep:   ['Reunión 10am con proveedor, llevar cotización revisada'],
    fyi:    ['3 correos informativos procesados por Nia'],
  }) }],
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

const EMPTY_SOURCE = { items: [], truncated: false };
const emptyData: BriefData = {
  urgentEmails: EMPTY_SOURCE,
  upcomingEvents: EMPTY_SOURCE,
  pendingTasks: EMPTY_SOURCE,
  unresolvedEscalations: EMPTY_SOURCE,
  pendingContractDrafts: EMPTY_SOURCE,
};

describe('renderBrief', () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  it('produce markdown con 3 headers y buckets desglosados', async () => {
    const brief = await renderBrief(emptyData, { agentName: 'Nox', businessName: 'Test Co', tz: 'America/Monterrey', ownerName: 'Nazre', kbSnippet: null });
    expect(brief.markdown).toContain('## Requiere acción');
    expect(brief.markdown).toContain('## Necesita preparación');
    expect(brief.markdown).toContain('## Al tanto');
    expect(brief.buckets.accion).toHaveLength(1);
    expect(brief.buckets.prep).toHaveLength(1);
    expect(brief.buckets.fyi).toHaveLength(1);
  });

  it('devuelve buckets vacíos + mensaje "sin novedades" cuando LLM regresa vacío', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ accion: [], prep: [], fyi: [] }) }] });
    const brief = await renderBrief(emptyData, { agentName: 'Nox', businessName: 'Test Co', tz: 'America/Monterrey', ownerName: null, kbSnippet: null });
    expect(brief.buckets.accion).toEqual([]);
    expect(brief.markdown).toContain('Sin novedades');
  });
});
