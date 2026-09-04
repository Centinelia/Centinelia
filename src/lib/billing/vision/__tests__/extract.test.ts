/**
 * extract.test.ts -- Tests para el Vision AI note extractor.
 *
 * Mockea @anthropic-ai/sdk completamente. No llama API real.
 *
 * v2 (2026-09-03): la vision devuelve `{ remisiones: [...] }` para soportar
 * fotos con múltiples notitas. `extractNoteFromImage` sigue existiendo pero
 * tira error si la foto tiene más de una remisión (evita bugs silenciosos).
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
import { extractNoteFromImage, extractRemisionesFromImage } from '../extract';

const HAPPY_REMISION = {
  folio_remision: '12828',
  cliente_texto: 'Tortas Dona Mari',
  fecha: '2026-09-03',
  productos: [
    { nombre: 'tortilla maiz', cantidad: 5, unidad: 'kg', precio_unitario: 18 },
  ],
  metodo_pago: 'transferencia',
  monto_total: 90,
  confianza: { cliente: 0.95, productos: 0.9, metodo_pago: 0.85, global: 0.9 },
  notas_raw: 'D. Mari 5kg tor maiz trans',
};

const SET_SINGLE = {
  remisiones: [HAPPY_REMISION],
  confianza_global: 0.9,
  notas_raw_all: '',
};

const SET_MULTI = {
  remisiones: [
    HAPPY_REMISION,
    { ...HAPPY_REMISION, folio_remision: '12829', cliente_texto: 'Otro Cliente' },
  ],
  confianza_global: 0.85,
  notas_raw_all: '2 remisiones apiladas',
};

const SET_EMPTY = {
  remisiones: [],
  confianza_global: 0.1,
  notas_raw_all: 'papel borroso ilegible',
};

function makeResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractRemisionesFromImage (multi)', () => {
  it('happy path: parsea set con múltiples remisiones', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(SET_MULTI)));

    const buf = Buffer.from('fake-image');
    const result = await extractRemisionesFromImage(buf, 'image/jpeg');

    expect(result.remisiones).toHaveLength(2);
    expect(result.remisiones[0].folio_remision).toBe('12828');
    expect(result.remisiones[1].folio_remision).toBe('12829');
    expect(result.remisiones[0].productos[0].precio_unitario).toBe(18);
    expect(result.confianza_global).toBe(0.85);
  });

  it('rechaza JSON sin remisiones[]', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('{"foo": "bar"}'));
    const buf = Buffer.from('fake-image');
    await expect(extractRemisionesFromImage(buf, 'image/jpeg')).rejects.toThrow(
      /missing remisiones/,
    );
  });

  it('rechaza texto no-JSON', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse('Lo siento, no puedo leer.'));
    const buf = Buffer.from('fake-image');
    await expect(extractRemisionesFromImage(buf, 'image/jpeg')).rejects.toThrow(
      /non-JSON or missing remisiones/,
    );
  });

  it('extrae JSON envuelto en prosa', async () => {
    const prosa = `Aquí está:\n${JSON.stringify(SET_SINGLE)}\nEspero sirva.`;
    mockCreate.mockResolvedValueOnce(makeResponse(prosa));
    const buf = Buffer.from('fake-image');
    const result = await extractRemisionesFromImage(buf, 'image/jpeg');
    expect(result.remisiones).toHaveLength(1);
  });
});

describe('extractNoteFromImage (legacy single)', () => {
  it('happy path: devuelve la remisión única', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(SET_SINGLE)));

    const buf = Buffer.from('fake-image');
    const result = await extractNoteFromImage(buf, 'image/jpeg');

    expect(result.cliente_texto).toBe('Tortas Dona Mari');
    expect(result.productos).toHaveLength(1);
    expect(result.productos[0].cantidad).toBe(5);
    expect(result.productos[0].unidad).toBe('kg');
    expect(result.productos[0].precio_unitario).toBe(18);
    expect(result.folio_remision).toBe('12828');
    expect(result.metodo_pago).toBe('transferencia');
    expect(result.monto_total).toBe(90);
  });

  it('tira error si hay múltiples remisiones (evita bug silencioso)', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(SET_MULTI)));
    const buf = Buffer.from('fake-image');
    await expect(extractNoteFromImage(buf, 'image/jpeg')).rejects.toThrow(
      /detectó 2 remisiones/,
    );
  });

  it('tira error si hay 0 remisiones', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(SET_EMPTY)));
    const buf = Buffer.from('fake-image');
    await expect(extractNoteFromImage(buf, 'image/jpeg')).rejects.toThrow(
      /0 remisiones/,
    );
  });

  it('llama al API con imagen en base64 y mimeType correcto', async () => {
    mockCreate.mockResolvedValueOnce(makeResponse(JSON.stringify(SET_SINGLE)));

    const buf = Buffer.from('hello');
    await extractNoteFromImage(buf, 'image/png');

    expect(mockCreate).toHaveBeenCalledOnce();
    const callArgs = mockCreate.mock.calls[0][0];
    const userMsg = callArgs.messages[0];
    expect(userMsg.role).toBe('user');
    const imageBlock = userMsg.content.find((c: { type: string }) => c.type === 'image');
    expect(imageBlock).toBeDefined();
    expect(imageBlock.source.type).toBe('base64');
    expect(imageBlock.source.media_type).toBe('image/png');
    expect(imageBlock.source.data).toBe(buf.toString('base64'));
  });
});
