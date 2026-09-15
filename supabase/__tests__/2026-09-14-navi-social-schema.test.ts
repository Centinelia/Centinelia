/**
 * Schema constraint tests — navi social publishing tables
 *
 * These tests hit the live Supabase project. They require env vars:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Run explicitly from worktree root (env vars loaded from .env.local or passed inline):
 *   pnpm vitest run supabase/__tests__/2026-09-14-navi-social-schema.test.ts
 *
 * The test org is synthetic (nazre20+navi-test-<ts>@gmail.com).
 * Cleanup runs in afterAll via organizations DELETE (cascades to agents + social_accounts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

const supabase = createAdminClient();

describe('navi-social-schema', () => {
  let orgEmail: string;
  let naviId: string;
  let agenciaId: string;

  beforeAll(async () => {
    orgEmail = `nazre20+navi-test-${Date.now()}@gmail.com`;

    await supabase.from('organizations').insert({ portal_email: orgEmail, name: 'Test Navi' });

    const { data: navi, error: naviErr } = await supabase
      .from('voice_agents')
      .insert({
        portal_email: orgEmail,
        role: 'navi',
        agent_name: 'Navi Test',
        client_name: 'Test Client',
        business_name: 'Test Business',
        plan: 'pro',
      })
      .select()
      .single();
    if (naviErr) throw new Error(`Failed to create navi agent: ${naviErr.message}`);
    naviId = navi!.id;

    const { data: ag, error: agErr } = await supabase
      .from('voice_agents')
      .insert({
        portal_email: orgEmail,
        role: 'navi_agencia',
        agent_name: 'Navi Agencia Test',
        client_name: 'Test Client',
        business_name: 'Test Business',
        plan: 'pro',
      })
      .select()
      .single();
    if (agErr) throw new Error(`Failed to create navi_agencia agent: ${agErr.message}`);
    agenciaId = ag!.id;
  }, 30000);

  afterAll(async () => {
    // Deleting the org cascades / nullifies FKs down to social_accounts, voice_agents
    await supabase.from('organizations').delete().eq('portal_email', orgEmail);
  }, 30000);

  it('Navi estándar bloquea segunda cuenta IG', async () => {
    const first = await supabase.from('social_accounts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      provider: 'meta_instagram',
      external_account_id: 'ig-1',
      access_token: 'x',
    });
    expect(first.error).toBeNull();

    const second = await supabase.from('social_accounts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      provider: 'meta_instagram',
      external_account_id: 'ig-2',
      access_token: 'x',
    });
    expect(second.error?.message).toContain('máximo 1 cuenta IG');
  }, 30000);

  it('Navi Agencia permite hasta 20 cuentas', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await supabase.from('social_accounts').insert({
        portal_email: orgEmail,
        agent_id: agenciaId,
        provider: 'meta_instagram',
        external_account_id: `ig-ag-${i}`,
        access_token: 'x',
      });
      expect(r.error).toBeNull();
    }

    const twentyOne = await supabase.from('social_accounts').insert({
      portal_email: orgEmail,
      agent_id: agenciaId,
      provider: 'meta_instagram',
      external_account_id: 'ig-ag-21',
      access_token: 'x',
    });
    expect(twentyOne.error?.message).toContain('máximo 20 cuentas IG');
  }, 60000);

  it('content_drafts FK a editorial_calendar_slots respeta orden de migración', async () => {
    const { error } = await supabase.from('content_drafts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      social_account_id: '00000000-0000-0000-0000-000000000000',
      media_type: 'image',
      slot_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error?.message).toMatch(/foreign key|violates/i);
  }, 15000);
});
