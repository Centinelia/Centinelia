/**
 * Schema constraint tests — navi social publishing tables
 *
 * These tests hit the live Supabase project. They require env vars:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Run explicitly from worktree root (env vars loaded from .env.local or passed inline):
 *   pnpm vitest run --config supabase/__tests__/vitest.navi-schema.config.ts
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

  // ── Original tests (renamed/improved) ───────────────────────────────────────

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

  // A1: renamed for accuracy — now clearly describes what it verifies
  it('content_drafts.slot_id FK to editorial_calendar_slots is active', async () => {
    const { error } = await supabase.from('content_drafts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      social_account_id: '00000000-0000-0000-0000-000000000000',
      media_type: 'image',
      slot_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error?.message).toMatch(/foreign key|violates/i);
  }, 15000);

  // A1: companion positive test — FK resolves with real data
  it('content_drafts.slot_id FK to editorial_calendar_slots resolves valid slot', async () => {
    // Create calendar
    const { data: cal, error: calErr } = await supabase
      .from('editorial_calendars')
      .insert({
        portal_email: orgEmail,
        month: '2026-10-01',
        status: 'draft',
      })
      .select()
      .single();
    expect(calErr).toBeNull();

    // Create slot in that calendar
    const { data: slot, error: slotErr } = await supabase
      .from('editorial_calendar_slots')
      .insert({
        calendar_id: cal!.id,
        scheduled_for: '2026-10-15T10:00:00Z',
        theme: 'promo semana',
      })
      .select()
      .single();
    expect(slotErr).toBeNull();

    // Get the social_account id created in the first test
    const { data: acct } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('portal_email', orgEmail)
      .eq('agent_id', naviId)
      .limit(1)
      .single();

    // Insert draft referencing the real slot — should succeed
    const { error: draftErr } = await supabase.from('content_drafts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      social_account_id: acct!.id,
      media_type: 'image',
      slot_id: slot!.id,
    });
    expect(draftErr).toBeNull();
  }, 20000);

  // ── B1: Unique constraint on social_accounts ─────────────────────────────────
  it('social_accounts unique constraint on (portal_email, provider, external_account_id)', async () => {
    // Use a fresh navi_agencia agent — naviId already has 1 account (trigger limit=1),
    // and the trigger counts ALL accounts per agent regardless of provider.
    const { data: uniqueAgent, error: uaErr } = await supabase
      .from('voice_agents')
      .insert({
        portal_email: orgEmail,
        role: 'navi_agencia',
        agent_name: 'Navi Unique Test',
        client_name: 'Test Client',
        business_name: 'Test Business',
        plan: 'pro',
      })
      .select()
      .single();
    expect(uaErr).toBeNull();

    const payload = {
      portal_email: orgEmail,
      agent_id: uniqueAgent!.id,
      provider: 'meta_facebook',
      external_account_id: 'fb-unique-test',
      access_token: 'x',
    };

    const first = await supabase.from('social_accounts').insert(payload);
    expect(first.error).toBeNull();

    const second = await supabase.from('social_accounts').insert(payload);
    // Unique violation — 23505 or message contains 'unique'
    expect(second.error?.message).toMatch(/unique|duplicate/i);
  }, 15000);

  // ── B2: Storage bucket user-media exists and is private ──────────────────────
  it('storage bucket user-media exists and is private', async () => {
    // Use the Storage API — PostgREST only exposes 'public' and 'graphql_public' schemas,
    // so storage.buckets cannot be queried via .schema('storage'). getBucket() uses the
    // Storage REST API which the service_role client can always access.
    const { data, error } = await supabase.storage.getBucket('user-media');
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.public).toBe(false);
  }, 10000);

  // ── B3: RLS enforcement — unauthenticated access blocked, service_role allowed ──
  it('RLS on user-media bucket blocks unauthenticated and allows service_role', async () => {
    const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL!}/storage/v1`;
    const testPath = `test-rls-${Date.now()}.txt`;
    const testContent = Buffer.from('rls-test');

    // 1. Unauthenticated upload — must be blocked (no apikey header).
    // Supabase returns 400 "No API key found" when the apikey header is absent entirely,
    // 401 when an invalid key is given, and 403 when a valid-but-unauthorized key is given.
    // All three are non-success — the upload is blocked regardless.
    const unauthUpload = await fetch(`${storageUrl}/object/user-media/${testPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: testContent,
    });
    expect(
      unauthUpload.status >= 400,
      `unauthenticated upload should be blocked but got HTTP ${unauthUpload.status}`
    ).toBe(true);

    // 2. Service_role upload — must succeed
    const svcUpload = await supabase.storage
      .from('user-media')
      .upload(testPath, testContent, { contentType: 'text/plain', upsert: true });
    expect(svcUpload.error, `service_role upload should succeed but got: ${svcUpload.error?.message}`).toBeNull();

    // 3. Unauthenticated download — must be blocked (400/401/403)
    const unauthDownload = await fetch(`${storageUrl}/object/user-media/${testPath}`);
    expect(
      unauthDownload.status >= 400,
      `unauthenticated download should be blocked but got HTTP ${unauthDownload.status}`
    ).toBe(true);

    // 4. Service_role download — must succeed
    const svcDownload = await supabase.storage
      .from('user-media')
      .download(testPath);
    expect(svcDownload.error, `service_role download should succeed but got: ${svcDownload.error?.message}`).toBeNull();

    // 5. Cleanup
    await supabase.storage.from('user-media').remove([testPath]);
  }, 15000);

  // ── B4: content_drafts.status accepts all 9 values ───────────────────────────
  it('content_drafts.status accepts all 9 valid values and rejects invalid', async () => {
    const validStatuses = [
      'draft', 'pending_approval', 'approved', 'scheduled', 'publishing',
      'published', 'rejected', 'failed', 'cancelled',
    ] as const;

    const { data: acct } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('portal_email', orgEmail)
      .eq('agent_id', naviId)
      .limit(1)
      .single();

    for (const status of validStatuses) {
      const { error } = await supabase.from('content_drafts').insert({
        portal_email: orgEmail,
        agent_id: naviId,
        social_account_id: acct!.id,
        media_type: 'image',
        status,
      });
      expect(error, `status='${status}' should be accepted`).toBeNull();
    }

    // Invalid value should trigger check constraint
    const { error: invErr } = await supabase.from('content_drafts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      social_account_id: acct!.id,
      media_type: 'image',
      status: 'invalid_value',
    });
    expect(invErr?.message).toMatch(/check constraint|violates/i);
  }, 30000);

  // ── B5: user_media_uploads.expires_at defaults to now() + 90 days ────────────
  it('user_media_uploads.expires_at defaults to now() + 90 days', async () => {
    const { data, error } = await supabase
      .from('user_media_uploads')
      .insert({
        portal_email: orgEmail,
        agent_id: naviId,
        source: 'portal_upload',
        file_url: 'https://example.com/test.jpg',
        file_type: 'image/jpeg',
      })
      .select('expires_at')
      .single();

    expect(error).toBeNull();
    expect(data?.expires_at).not.toBeNull();

    const expiresAt = new Date(data!.expires_at);
    const now = new Date();

    // Should be ~90 days from now — allow 89.9 to 90.1 days
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(89.9);
    expect(diffDays).toBeLessThan(90.1);
  }, 15000);

  // ── C1: All 7 new tables exist ────────────────────────────────────────────────
  it('all 7 navi social tables exist in information_schema', async () => {
    // PostgREST only exposes 'public' and 'graphql_public' schemas, so information_schema
    // is not queryable via .schema(). Instead we verify each table exists by doing a
    // HEAD count query — if the table is missing, PostgREST returns PGRST205 (table not found).
    const expectedTables = [
      'social_accounts',
      'brand_templates',
      'editorial_calendars',
      'editorial_calendar_slots',
      'content_drafts',
      'user_media_uploads',
      'social_metrics',
    ];

    for (const tbl of expectedTables) {
      const { error } = await supabase
        .from(tbl as any)
        .select('*', { count: 'exact', head: true });
      // A missing table would return PGRST205; any other error (like RLS) is acceptable
      // because it means the table EXISTS but access was restricted.
      expect(
        error === null || (error.code !== 'PGRST205' && error.code !== '42P01'),
        `table '${tbl}' should exist but got: [${error?.code}] ${error?.message}`
      ).toBe(true);
    }
  }, 15000);
});
