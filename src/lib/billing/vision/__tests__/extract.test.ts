/**
 * extract.test.ts -- Tests para el Vision AI note extractor.
 *
 * Mockea @anthropic-ai/sdk completamente. No llama API real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock del SDK de Anthropic ---
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts?: any) {}
  }
  return { default: MockAnthropic };
});

// Importar despues del mock
import { extractNoteFromImage } from '../extract';

const HAPPY_NOTE = {
  cliente_texto: 'Tortas Dona Mari',
  productos: [{ nombre: 'tortilla maiz', cantidad: 5, unidad: 'kg' }],
  metodo_pago: 'transferencia',
  fecha: null,
  monto_total: 90,
  confianza: { cliente: 0.95, productos: 0.9, metodo_pago: 0.85, global: 0.9 },
  notas_raw: 'D. Mari 5kg tor maiz trans',
};

const LOW_CONFIDENCE_NOTE = {
  cliente_texto: null,
  productos: [],
  metodo_pago: null,
  fecha: null,
  monto_total: null,
  confianza: { cliente: 0.1, productos: 0.1, metodo_pago: 0.1, global: 0.1 },
  notas_raw: 'papel borroso ilegible',
};

function makeResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractNoteFromImage', () => {
  it('happy path: parsea ExtractedNote correctamente desde JSON valido', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(HAPPY_NOTE)));

    const buf = Buffer.from('fake-image');
    const result = await extractNoteFromImage(buf, 'image/jpeg');

    expect(result.cliente_texto).toBe('Tortas Dona Mari');
    expect(result.productos).toHaveLength(1);
    expect(result.productos[0].cantidad).toBe(5);
    expect(result.productos[0].unidad).toBe('kg');
    expect(result.metodo_pago).toBe('transferencia');
    expect(result.monto_total).toBe(90);
    expect(result.confianza.global).toBe(0.9);
    expect(result.notas_raw).toBe('D. Mari 5kg tor maiz trans');
  });

  it('confianza baja: todavia parsea sin filtrar', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(LOW_CONFIDENCE_NOTE)));

    const buf = Buffer.from('fake-image');
    const result = await extractNoteFromImage(buf, 'image/png');

    // No filtra en esta capa -- devuelve el objeto tal cual
    expect(result.confianza.global).toBe(0.1);
    expect(result.cliente_texto).toBeNull();
    expect(result.productos).toHaveLength(0);
  });

  it('JSON malformado: lanza error especifico', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('Lo siento, no puedo leer esa imagen.'));

    const buf = Buffer.from('fake-image');
    await expect(extractNoteFromImage(buf, 'image/jpeg')).rejects.toThrow(
      'Vision model returned non-JSON output',
    );
  });

  it('JSON parcialmente envuelto en prosa: regex extrae correctamente', async () => {
    const prosa = `Aqui esta el resultado de la notita:\n\n${JSON.stringify(HAPPY_NOTE)}\n\nEspero que sea util.`;
    mockCreate.mockResolvedValueOnce(makeResponse(prosa));

    const buf = Buffer.from('fake-image');
    const result = await extractNoteFromImage(buf, 'image/jpeg');

    expect(result.cliente_texto).toBe('Tortas Dona Mari');
    expect(result.confianza.global).toBe(0.9);
  });

  it('llama al API con imagen en base64 y mimeType correcto', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(HAPPY_NOTE)));

    const buf = Buffer.from('hello');
    await extractNoteFromImage(buf, 'image/png');

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];

    // Verifica estructura del mensaje con vision
    const userMsg = callArgs.messages[0];
    expect(userMsg.role).toBe('user');

    const imageBlock = userMsg.content.find((c: { type: string }) => c.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/png');
    expect(imageBlock.source.data).toBe(buf.toString('base64'));
  });
});
