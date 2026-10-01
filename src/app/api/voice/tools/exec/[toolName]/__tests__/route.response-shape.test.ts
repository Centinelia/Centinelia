// Shape regression para exec/[toolName] route (2026-10-01 cleanup).
// Antes había 2 returns legacy en early errors (agent_id missing, agent
// not found) que no estaban migrados al helper toolResponse. Este test
// garantiza que ambos usan el wrap custom-LLM cuando viene toolCallList.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vapi/auth', () => ({
  requireVapiAuth: vi.fn(() => true),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/lib/tools/executor', () => ({
  executeAgentTool: vi.fn(() => Promise.resolve({ message: 'OK dummy', ok: true })),
}));

beforeEach(() => { vi.clearAllMocks(); });

const makeParams = (toolName: string) => Promise.resolve({ toolName });

describe('exec/[toolName] route — custom-llm response wrap', () => {
  it('agent_id missing: envuelve en {results:[{toolCallId,result}]} con toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/exec/dummy_tool', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          toolCallList: [{ id: 'call_exec_1', function: { arguments: '{}' } }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req, { params: makeParams('dummy_tool') });
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results[0].toolCallId).toBe('call_exec_1');
    expect(json.results[0].result).toMatch(/configuración.*agent_id/);
  });

  it('agent not found: envuelve en wrap con toolCallList', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/exec/dummy_tool?agent_id=a1', {
      method: 'POST',
      body: JSON.stringify({
        message: {
          toolCallList: [{ id: 'call_exec_2', function: { arguments: '{}' } }],
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req, { params: makeParams('dummy_tool') });
    const json = await res.json();
    expect(json).toHaveProperty('results');
    expect(json.results[0].toolCallId).toBe('call_exec_2');
    expect(json.results[0].result).toMatch(/agente no encontrado/);
  });

  it('sin toolCallList (fallback flat): no envuelve, mantiene {result}', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://x/api/voice/tools/exec/dummy_tool', {
      method: 'POST',
      body: JSON.stringify({}),  // sin agent_id → trigger early error
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req, { params: makeParams('dummy_tool') });
    const json = await res.json();
    expect(json).not.toHaveProperty('results');
    expect(json).toHaveProperty('result');
    expect(json.result).toMatch(/configuración.*agent_id/);
  });
});
