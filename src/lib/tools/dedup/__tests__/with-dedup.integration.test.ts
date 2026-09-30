import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { assertNotProdOrAllowed } from '@/lib/test-helpers/prod-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomUUID } from 'node:crypto';
import { withDedup } from '../with-dedup';

const TEST_PORTAL = `dedup-test-${Date.now()}@example.com`;
const TEST_AGENT: string = randomUUID();

describe('withDedup integration', () => {
  beforeAll(async () => {
    await assertNotProdOrAllowed();
    const supa = createAdminClient();

    await supa.from('organizations').upsert({
      portal_email: TEST_PORTAL,
      dedup_middleware_enabled: true,
    });
    await supa.from('voice_agents').insert({
      id:            TEST_AGENT,
      portal_email:  TEST_PORTAL,
      agent_name:    'Test',
      business_name: 'Test Biz',
    });
  });

  afterAll(async () => {
    const supa = createAdminClient();
    await supa.from('tool_call_dedup').delete().eq('agent_id', TEST_AGENT);
    await supa.from('voice_agents').delete().eq('id', TEST_AGENT);
    await supa.from('organizations').delete().eq('portal_email', TEST_PORTAL);
  });

  it('2 llamadas back-to-back al mismo hash → 1 row en tool_call_dedup, 2do retorna cached', async () => {
    const supa = createAdminClient();
    const ctx = {
      agentId:     TEST_AGENT,
      portalEmail: TEST_PORTAL,
      toolName:    'registrar_incidencia',
      args:        { contact_phone: '8129262462', business_name: 'Tecate' },
      channel:     'voice' as const,
      toolCallId:  'test-1',
    };
    const handler1 = vi.fn(async () => ({ ok: true, id: 'inc-first' }));
    const handler2 = vi.fn(async () => ({ ok: true, id: 'inc-second' }));

    const r1 = await withDedup(ctx, handler1);
    const r2 = await withDedup({ ...ctx, toolCallId: 'test-2' }, handler2);

    expect(r1).toEqual({ ok: true, id: 'inc-first' });
    expect(r2).toEqual({ ok: true, id: 'inc-first' });
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).not.toHaveBeenCalled();

    const { data } = await supa.from('tool_call_dedup')
      .select('id').eq('agent_id', TEST_AGENT);
    expect(data).toHaveLength(1);
  });

  it('args distintos → 2 rows separadas', async () => {
    const supa = createAdminClient();
    await supa.from('tool_call_dedup').delete().eq('agent_id', TEST_AGENT);
    const base = {
      agentId:     TEST_AGENT,
      portalEmail: TEST_PORTAL,
      toolName:    'registrar_incidencia',
      channel:     'voice' as const,
    };

    await withDedup({ ...base, args: { contact_phone: '111' } },
      async () => ({ ok: true, phone: '111' }));
    await withDedup({ ...base, args: { contact_phone: '222' } },
      async () => ({ ok: true, phone: '222' }));

    const { data } = await supa.from('tool_call_dedup')
      .select('id').eq('agent_id', TEST_AGENT);
    expect(data).toHaveLength(2);
  });
});
