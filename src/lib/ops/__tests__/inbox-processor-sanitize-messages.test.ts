/**
 * Regression Nash #127 (2026-10-08): error 400 Anthropic "tool_use sin
 * tool_result" en inbox-processor. 3 ocurrencias esa tarde en
 * camila@acproyectos.com. sanitizeMessages previene el 400 agregando
 * tool_result sintético a huérfanos + mergeando roles consecutivos.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeMessages } from '../inbox-processor';

describe('sanitizeMessages — Nash #127 regression', () => {
  it('deja mensajes balanced sin cambios', () => {
    const msgs = [
      { role: 'user' as const, content: 'hola' },
      { role: 'assistant' as const, content: [
        { type: 'tool_use' as const, id: 'tu1', name: 'inv_x', input: {} },
      ]},
      { role: 'user' as const, content: [
        { type: 'tool_result' as const, tool_use_id: 'tu1', content: '{}' },
      ]},
    ];
    const result = sanitizeMessages(msgs);
    expect(result).toHaveLength(3);
    expect(result[1].content).toEqual(msgs[1].content);
  });

  it('agrega tool_result sintético a tool_use huérfano (sin message siguiente)', () => {
    const msgs = [
      { role: 'user' as const, content: 'hola' },
      { role: 'assistant' as const, content: [
        { type: 'tool_use' as const, id: 'tu_orphan', name: 'inv_x', input: {} },
      ]},
    ];
    const result = sanitizeMessages(msgs);
    expect(result).toHaveLength(3);
    expect(result[2].role).toBe('user');
    const content = result[2].content as Array<{ type: string; tool_use_id?: string; content?: string }>;
    expect(content[0].type).toBe('tool_result');
    expect(content[0].tool_use_id).toBe('tu_orphan');
    expect(content[0].content).toContain('tool_use_unresolved_in_loop_rebalanced');
  });

  it('agrega tool_result sintético a tool_use huérfano (message siguiente es user sin tool_result)', () => {
    const msgs = [
      { role: 'user' as const, content: 'hola' },
      { role: 'assistant' as const, content: [
        { type: 'tool_use' as const, id: 'tu_orphan', name: 'inv_x', input: {} },
      ]},
      { role: 'user' as const, content: 'texto plano, no tool_result' },
    ];
    const result = sanitizeMessages(msgs);
    // Después del rebalance queda: assistant tool_use → user con tool_result
    // sintético. El "texto plano" user se mergea con el user sintético.
    expect(result).toHaveLength(3);
    const content3 = result[2].content as Array<{ type: string; tool_use_id?: string }>;
    // Debe haber al menos un tool_result con tu_orphan
    const hasOrphanResult = content3.some(b => b.type === 'tool_result' && b.tool_use_id === 'tu_orphan');
    expect(hasOrphanResult).toBe(true);
  });

  it('mergea 2 user messages consecutivos (último del loop + forceDraftMsg)', () => {
    const msgs = [
      { role: 'user' as const, content: 'hola' },
      { role: 'assistant' as const, content: [
        { type: 'tool_use' as const, id: 'tu1', name: 'inv_x', input: {} },
      ]},
      { role: 'user' as const, content: [
        { type: 'tool_result' as const, tool_use_id: 'tu1', content: '{}' },
      ]},
      { role: 'user' as const, content: 'Ya ejecutaste la tool. Redacta reply.' },
    ];
    const result = sanitizeMessages(msgs);
    // Los 2 user del final se mergean en uno
    expect(result).toHaveLength(3);
    expect(result[2].role).toBe('user');
    const content = result[2].content as Array<{ type: string }>;
    expect(content.length).toBeGreaterThanOrEqual(2);  // tool_result + text
  });

  it('maneja content string + content array al mergear', () => {
    const msgs = [
      { role: 'user' as const, content: 'uno' },
      { role: 'user' as const, content: [
        { type: 'text' as const, text: 'dos' },
      ]},
    ];
    const result = sanitizeMessages(msgs);
    expect(result).toHaveLength(1);
    const content = result[0].content as Array<{ type: string; text?: string }>;
    expect(content).toEqual([
      { type: 'text', text: 'uno' },
      { type: 'text', text: 'dos' },
    ]);
  });

  it('función es pura — no muta el input', () => {
    const original = [
      { role: 'user' as const, content: 'hola' },
      { role: 'assistant' as const, content: [
        { type: 'tool_use' as const, id: 'tu_orphan', name: 'inv_x', input: {} },
      ]},
      { role: 'user' as const, content: 'texto plano' },
    ];
    const snapshot = JSON.parse(JSON.stringify(original));
    sanitizeMessages(original);
    expect(JSON.parse(JSON.stringify(original))).toEqual(snapshot);
  });

  it('regression Nash #127 iter 1: nudge F3 push de response.content con tool_use mixto', () => {
    // Caso real 2026-10-08 20:55:
    //   iter 0 produce response con stop_reason=end_turn pero content tiene
    //   text + 2 tool_use blocks (edge case Anthropic). nudge F3 pushea TODO
    //   el response.content al assistant turn + user "no llamaste tool".
    //   iter 1 crashea con 400 "tool_use ids were found without tool_result".
    const msgs = [
      { role: 'user' as const, content: 'procesa factura' },
      { role: 'assistant' as const, content: [
        { type: 'text' as const, text: 'OK voy a procesar' },
        { type: 'tool_use' as const, id: 'toolu_017H2H2QzszFa8fuwN5PqWXE', name: 'inv_x', input: {} },
        { type: 'tool_use' as const, id: 'toolu_017LowsH26E6ZHcBpnQKYA7E', name: 'inv_y', input: {} },
      ]},
      { role: 'user' as const, content: 'Espera — no llamaste ninguna herramienta...' },
    ];
    const result = sanitizeMessages(msgs);
    // Debe haber tool_result para ambos tool_use entre assistant y user del nudge
    const assistant = result.find(m => m.role === 'assistant')!;
    const assistantIdx = result.indexOf(assistant);
    const nextUser = result[assistantIdx + 1];
    expect(nextUser.role).toBe('user');
    const content = nextUser.content as Array<{ type: string; tool_use_id?: string }>;
    const resultIds = content.filter(b => b.type === 'tool_result').map(b => b.tool_use_id);
    expect(resultIds).toContain('toolu_017H2H2QzszFa8fuwN5PqWXE');
    expect(resultIds).toContain('toolu_017LowsH26E6ZHcBpnQKYA7E');
  });

  it('múltiples tool_use en mismo assistant con tool_result parcial', () => {
    const msgs = [
      { role: 'user' as const, content: 'procesa' },
      { role: 'assistant' as const, content: [
        { type: 'tool_use' as const, id: 'tu1', name: 'a', input: {} },
        { type: 'tool_use' as const, id: 'tu2', name: 'b', input: {} },
      ]},
      { role: 'user' as const, content: [
        { type: 'tool_result' as const, tool_use_id: 'tu1', content: '{}' },
        // tu2 falta → debe agregarse sintético
      ]},
    ];
    const result = sanitizeMessages(msgs);
    const content = result[2].content as Array<{ type: string; tool_use_id?: string }>;
    const ids = content
      .filter(b => b.type === 'tool_result')
      .map(b => b.tool_use_id);
    expect(ids).toContain('tu1');
    expect(ids).toContain('tu2');
  });
});
