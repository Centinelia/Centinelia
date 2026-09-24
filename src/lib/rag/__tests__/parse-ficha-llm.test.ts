import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock del Anthropic SDK: devolvemos respuestas controladas para cada test.
vi.mock('@anthropic-ai/sdk', () => {
  const state = {
    responseText: '',
    shouldThrow: false as boolean | Error,
  };
  class Anthropic {
    messages = {
      create: vi.fn(async () => {
        if (state.shouldThrow) {
          throw state.shouldThrow === true ? new Error('mock error') : state.shouldThrow;
        }
        return {
          content: [{ type: 'text', text: state.responseText }],
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          stop_reason: 'end_turn',
        };
      }),
    };
  }
  return {
    default:     Anthropic,
    __setResponse: (text: string) => { state.responseText = text; state.shouldThrow = false; },
    __setError:    (err: Error | true) => { state.shouldThrow = err; },
    __state:       state,
  };
});

vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: vi.fn(async () => {}),
}));

import { parseFichaWithLLM } from '../parse-ficha-llm';
import * as anthMock from '@anthropic-ai/sdk';

const setResponse = (text: string) => (anthMock as unknown as { __setResponse: (t: string) => void }).__setResponse(text);
const setError    = (err: Error | true) => (anthMock as unknown as { __setError: (e: Error | true) => void }).__setError(err);

describe('parseFichaWithLLM', () => {
  beforeEach(() => setResponse(''));

  it('parsea un JSON válido con todos los campos', async () => {
    setResponse(JSON.stringify({
      codigo: 'TS-SFT-RIN-02',
      titulo: 'Pago del Impuesto Predial',
      dependencia: 'Secretaría de Finanzas',
      unidadAdministrativa: 'Dirección de Recaudación Inmobiliaria',
      contactoNombre: 'Elvira Guadalupe',
      contactoPuesto: 'Directora',
      contactoCorreo: 'predial@santiago.gob.mx',
      contactoTelefono: '8121335851',
      contactoExtension: '2174',
      ligaEnLinea: 'https://pagopredial.santiago.gob.mx/',
      direccion: 'Calle Mina 224',
      horario: 'Lunes a Viernes 8-15',
      costoDescripcion: 'Variable',
      plazoRespuesta: '1 día',
      sections: [
        { type: 'descripcion', content: 'Trámite de pago del predial.' },
        { type: 'requisitos',  content: 'Nombre del propietario, expediente catastral.' },
      ],
    }));
    const p = await parseFichaWithLLM('texto crudo del PDF');
    expect(p.codigo).toBe('TS-SFT-RIN-02');
    expect(p.titulo).toBe('Pago del Impuesto Predial');
    expect(p.contactoCorreo).toBe('predial@santiago.gob.mx');
    expect(p.contactoExtension).toBe('2174');
    expect(p.sections).toHaveLength(2);
    expect(p.sections[0].type).toBe('descripcion');
    expect(p.rawText).toBe('texto crudo del PDF');
  });

  it('strips markdown fences si el modelo las mete', async () => {
    setResponse('```json\n{"titulo": "Trámite X", "sections": []}\n```');
    const p = await parseFichaWithLLM('texto');
    expect(p.titulo).toBe('Trámite X');
  });

  it('genera slug del título si no hay código explícito', async () => {
    setResponse(JSON.stringify({ titulo: 'Pago del Impuesto Predial', sections: [] }));
    const p = await parseFichaWithLLM('texto');
    expect(p.codigo).toBe('pago_del_impuesto_predial');
  });

  it('slug quita acentos y caracteres especiales', async () => {
    setResponse(JSON.stringify({ titulo: 'Adquisición de Inmuebles / ISAI', sections: [] }));
    const p = await parseFichaWithLLM('texto');
    expect(p.codigo).toMatch(/^adquisicion_de_inmuebles/);
    expect(p.codigo).not.toMatch(/[óáéíúñ\/]/);
  });

  it('convierte strings vacíos y null a null en campos opcionales', async () => {
    setResponse(JSON.stringify({
      titulo: 'X',
      dependencia: '',
      contactoCorreo: null,
      contactoTelefono: '   ',
      sections: [],
    }));
    const p = await parseFichaWithLLM('texto');
    expect(p.dependencia).toBeNull();
    expect(p.contactoCorreo).toBeNull();
    expect(p.contactoTelefono).toBeNull();
  });

  it('filtra secciones con content vacío', async () => {
    setResponse(JSON.stringify({
      titulo: 'X',
      sections: [
        { type: 'descripcion', content: 'ok' },
        { type: 'requisitos',  content: '' },
        { type: 'costo',       content: '   ' },
        { type: 'pasos',       content: 'ok2' },
      ],
    }));
    const p = await parseFichaWithLLM('texto');
    expect(p.sections).toHaveLength(2);
    expect(p.sections.map((s) => s.type)).toEqual(['descripcion', 'pasos']);
  });

  it('normaliza sections con type desconocido a "otros"', async () => {
    setResponse(JSON.stringify({
      titulo: 'X',
      sections: [
        { type: 'weird_type', content: 'contenido' },
      ],
    }));
    const p = await parseFichaWithLLM('texto');
    expect(p.sections[0].type).toBe('otros');
  });

  it('lanza error si el título no viene', async () => {
    setResponse(JSON.stringify({ codigo: 'X', sections: [] }));
    await expect(parseFichaWithLLM('texto')).rejects.toThrow(/título no extraído/);
  });

  it('lanza error si el JSON del modelo es inválido', async () => {
    setResponse('esto no es JSON');
    await expect(parseFichaWithLLM('texto')).rejects.toThrow(/JSON inválido/);
  });

  it('lanza error si el texto de entrada está vacío', async () => {
    await expect(parseFichaWithLLM('')).rejects.toThrow(/texto vacío/);
    await expect(parseFichaWithLLM('   ')).rejects.toThrow(/texto vacío/);
  });

  it('propaga error del SDK y lo loggea', async () => {
    setError(new Error('rate limit'));
    await expect(parseFichaWithLLM('texto')).rejects.toThrow(/rate limit/);
  });
});
