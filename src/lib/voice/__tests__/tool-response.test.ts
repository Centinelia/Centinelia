import { describe, it, expect } from 'vitest';
import { extractToolCall, toolResponse } from '../tool-response';

describe('extractToolCall', () => {
  it('extrae toolCallId, args parseados (string JSON), sessionId y callerNumber del body Vapi', () => {
    const body = {
      message: {
        call: { id: 'sess-1', customer: { number: '+528112803360' } },
        toolCallList: [{
          id: 'call_abc123',
          function: { name: 'buscar_cliente', arguments: '{"identificador":"Nash"}' },
        }],
      },
    };
    const r = extractToolCall(body);
    expect(r.toolCallId).toBe('call_abc123');
    expect(r.args).toEqual({ identificador: 'Nash' });
    expect(r.sessionId).toBe('sess-1');
    expect(r.callerNumber).toBe('+528112803360');
  });

  it('acepta args como object (no string) — algunos paths legacy', () => {
    const body = {
      message: {
        toolCallList: [{ id: 'call_1', function: { arguments: { key: 'val' } } }],
      },
    };
    const r = extractToolCall(body);
    expect(r.args).toEqual({ key: 'val' });
  });

  it('devuelve {} si arguments es string JSON invalido', () => {
    const body = {
      message: {
        toolCallList: [{ id: 'call_x', function: { arguments: 'not-json' } }],
      },
    };
    const r = extractToolCall(body);
    expect(r.args).toEqual({});
    expect(r.toolCallId).toBe('call_x');
  });

  it('devuelve {} si arguments es string vacio (tool_use con input={})', () => {
    const body = {
      message: {
        toolCallList: [{ id: 'call_empty', function: { arguments: '' } }],
      },
    };
    const r = extractToolCall(body);
    expect(r.args).toEqual({});
    expect(r.toolCallId).toBe('call_empty');
  });

  it('acepta toolCallList al top-level (no dentro de message) para backwards-compat', () => {
    const body = {
      toolCallList: [{ id: 'call_top', function: { arguments: '{}' } }],
    };
    const r = extractToolCall(body);
    expect(r.toolCallId).toBe('call_top');
    expect(r.args).toEqual({});
  });

  it('toolCallId="" y sessionId=null cuando el body no trae toolCallList (legacy/test paths)', () => {
    const body = { arg1: 'value' };
    const r = extractToolCall(body);
    expect(r.toolCallId).toBe('');
    expect(r.sessionId).toBe(null);
    expect(r.callerNumber).toBe('');
    // args cae a body mismo cuando no hay toolCall.function.arguments
    expect(r.args).toEqual({ arg1: 'value' });
  });

  it('callerNumber sale de message.customer.number como fallback si no viene call.customer', () => {
    const body = {
      message: {
        customer: { number: '+528111111111' },
        toolCallList: [{ id: 'call_1', function: { arguments: '{}' } }],
      },
    };
    const r = extractToolCall(body);
    expect(r.callerNumber).toBe('+528111111111');
  });

  it('resiliente a body null/undefined/vacio (nunca throws)', () => {
    expect(() => extractToolCall(null)).not.toThrow();
    expect(() => extractToolCall(undefined)).not.toThrow();
    expect(() => extractToolCall({})).not.toThrow();
    const r = extractToolCall({});
    expect(r.toolCallId).toBe('');
    expect(r.args).toEqual({});
  });
});

describe('toolResponse', () => {
  it('envuelve en {results:[{toolCallId,result}]} cuando hay toolCallId (custom-llm path)', async () => {
    const res = toolResponse('call_abc123', 'Nombre: Nash Reanzar');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      results: [{ toolCallId: 'call_abc123', result: 'Nombre: Nash Reanzar' }],
    });
  });

  it('devuelve formato flat {result, ...extra} como fallback si toolCallId vacio (legacy)', async () => {
    const res = toolResponse('', 'Sin match', { found: false, nombre: null });
    const json = await res.json();
    expect(json).toEqual({ result: 'Sin match', found: false, nombre: null });
  });

  it('ignora extra fields cuando hay toolCallId (Vapi los descarta de todas formas)', async () => {
    const res = toolResponse('call_1', 'msg', { found: true, nombre: 'X' });
    const json = await res.json();
    // El extra NO viaja dentro del wrap; solo toolCallId + result.
    expect(json).toEqual({
      results: [{ toolCallId: 'call_1', result: 'msg' }],
    });
    expect(json.found).toBeUndefined();
  });
});
