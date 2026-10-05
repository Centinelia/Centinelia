import { describe, it, expect } from 'vitest';
import { extractVapiContext } from '../vapi-context';

describe('extractVapiContext', () => {
  describe('resolved identifiers', () => {
    it('extrae assistantId desde body.call.assistantId (shape documentado customLLM)', () => {
      const r = extractVapiContext(
        { messages: [], call: { id: 'call-1', assistantId: 'asst-abc' } },
        {},
      );
      expect(r.vapiAssistantId).toBe('asst-abc');
      expect(r.vapiCallId).toBe('call-1');
    });

    it('extrae assistantId desde body.message.call.assistantId (shape webhook anidado)', () => {
      const r = extractVapiContext(
        { messages: [], message: { call: { id: 'call-2', assistantId: 'asst-xyz' } } },
        {},
      );
      expect(r.vapiAssistantId).toBe('asst-xyz');
      expect(r.vapiCallId).toBe('call-2');
    });

    it('extrae assistantId desde body.metadata.assistantId (algunos setups)', () => {
      const r = extractVapiContext(
        { messages: [], metadata: { assistantId: 'asst-meta', callId: 'call-meta' } },
        {},
      );
      expect(r.vapiAssistantId).toBe('asst-meta');
      expect(r.vapiCallId).toBe('call-meta');
    });

    it('extrae assistantId desde header x-vapi-assistant-id (fallback)', () => {
      const r = extractVapiContext(
        { messages: [] },
        { 'x-vapi-assistant-id': 'asst-hdr', 'x-vapi-call-id': 'call-hdr' },
      );
      expect(r.vapiAssistantId).toBe('asst-hdr');
      expect(r.vapiCallId).toBe('call-hdr');
    });

    it('devuelve null cuando no viene el assistantId en ningún lado', () => {
      const r = extractVapiContext({ messages: [], model: 'claude-haiku-4-5' }, {});
      expect(r.vapiAssistantId).toBeNull();
      expect(r.vapiCallId).toBeNull();
    });
  });

  describe('diagnostic snapshot', () => {
    it('refleja la ausencia de call/message/metadata cuando Vapi solo manda OpenAI-compat puro', () => {
      // Caso observado 2026-10-05: Vapi manda body SIN call/message/metadata.
      // El diag debe permitir identificar esto en producción.
      const r = extractVapiContext({ messages: [{ role: 'user', content: 'hola' }], model: 'x' }, {});
      expect(r.vapiDiag.has_call).toBe(false);
      expect(r.vapiDiag.has_message).toBe(false);
      expect(r.vapiDiag.has_metadata).toBe(false);
      expect(r.vapiDiag.resolved_assistant_id).toBeNull();
      expect(r.vapiDiag.body_keys).toContain('messages');
    });

    it('captura solo headers x-vapi-* (no filtra otros headers sensibles)', () => {
      const r = extractVapiContext(
        { messages: [] },
        {
          'x-vapi-call-id':         'call-1',
          'x-vapi-signature':       'sig-abc',
          'authorization':          'Bearer super-secret',
          'cookie':                 'session=xxx',
          'content-type':           'application/json',
        },
      );
      expect(r.vapiDiag.vapi_headers).toEqual({
        'x-vapi-call-id':   'call-1',
        'x-vapi-signature': 'sig-abc',
      });
      expect(r.vapiDiag.vapi_headers).not.toHaveProperty('authorization');
      expect(r.vapiDiag.vapi_headers).not.toHaveProperty('cookie');
    });

    it('trunca body_sample a 800 chars para no explotar meta.jsonb en payloads grandes', () => {
      const bigMessages = Array.from({ length: 50 }, (_, i) => ({
        role: 'user',
        content: 'contenido largo '.repeat(20) + i,
      }));
      const r = extractVapiContext({ messages: bigMessages }, {});
      expect(r.vapiDiag.body_sample.length).toBeLessThanOrEqual(800);
    });

    it('resolved_* del diag coincide con los valores top-level (invariante)', () => {
      const r = extractVapiContext(
        { messages: [], call: { id: 'c', assistantId: 'a' } },
        {},
      );
      expect(r.vapiDiag.resolved_assistant_id).toBe(r.vapiAssistantId);
      expect(r.vapiDiag.resolved_call_id).toBe(r.vapiCallId);
    });
  });

  describe('regression: shape observado en producción 2026-10-05', () => {
    it('body OpenAI-compat puro (sin call/message/metadata) → ambos resolved son null + diag revela ausencia', () => {
      // Shape real observado en 1,886 calls prod: Vapi NO manda ningún contenedor
      // de contexto. Este test fija ese comportamiento para no engañarnos con
      // un fix de código que "parecería" funcionar sin resolver el root cause.
      const observed = {
        model:    'claude-haiku-4-5-20251001',
        messages: [{ role: 'user', content: 'bueno' }],
        tools:    [{ type: 'function', function: { name: 'foo' } }],
        stream:   true,
      };
      const r = extractVapiContext(observed, {});

      expect(r.vapiAssistantId).toBeNull();
      expect(r.vapiCallId).toBeNull();
      expect(r.vapiDiag.has_call).toBe(false);
      expect(r.vapiDiag.has_message).toBe(false);
      expect(r.vapiDiag.has_metadata).toBe(false);
      expect(r.vapiDiag.body_keys.sort()).toEqual(['messages', 'model', 'stream', 'tools']);
    });
  });
});
