/**
 * Standalone runner for navi social schema constraint tests.
 *
 * Does not require vitest. Uses node:test (built-in, Node 18+) and
 * resolves @supabase/supabase-js from centinelia/node_modules.
 *
 * Usage (from centinelia-navi worktree root):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node supabase/__tests__/run-navi-schema-tests.mjs
 *
 * Or with env from centinelia:
 *   node --env-file=../centinelia/.env.local \
 *     supabase/__tests__/run-navi-schema-tests.mjs
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve supabase-js from centinelia's node_modules (worktree shares main repo)
const centinelaRoot = path.resolve(__dirname, '..', '..', '..', 'centinelia');
const require = createRequire(path.join(centinelaRoot, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let orgEmail;
let naviId;
let agenciaId;

async function setup() {
  orgEmail = `nazre20+navi-test-${Date.now()}@gmail.com`;
  const { error: orgErr } = await supabase
    .from('organizations')
    .insert({ portal_email: orgEmail, name: 'Test Navi' });
  if (orgErr) throw new Error(`org insert failed: ${orgErr.message}`);

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
  if (naviErr) throw new Error(`navi insert failed: ${naviErr.message}`);
  naviId = navi.id;

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
  if (agErr) throw new Error(`navi_agencia insert failed: ${agErr.message}`);
  agenciaId = ag.id;
}

async function teardown() {
  await supabase.from('organizations').delete().eq('portal_email', orgEmail);
}

describe('navi-social-schema', async () => {
  before(setup);
  after(teardown);

  test('Navi estándar bloquea segunda cuenta IG', async () => {
    const first = await supabase.from('social_accounts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      provider: 'meta_instagram',
      external_account_id: 'ig-1',
      access_token: 'x',
    });
    assert.equal(first.error, null, `first insert should succeed but got: ${first.error?.message}`);

    const second = await supabase.from('social_accounts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      provider: 'meta_instagram',
      external_account_id: 'ig-2',
      access_token: 'x',
    });
    assert.ok(
      second.error?.message?.includes('máximo 1 cuenta IG'),
      `expected trigger error 'máximo 1 cuenta IG' but got: ${second.error?.message ?? 'null'}`
    );
  });

  test('Navi Agencia permite hasta 20 cuentas', async (t) => {
    for (let i = 0; i < 20; i++) {
      const r = await supabase.from('social_accounts').insert({
        portal_email: orgEmail,
        agent_id: agenciaId,
        provider: 'meta_instagram',
        external_account_id: `ig-ag-${i}`,
        access_token: 'x',
      });
      assert.equal(r.error, null, `insert #${i} should succeed but got: ${r.error?.message}`);
    }

    const twentyOne = await supabase.from('social_accounts').insert({
      portal_email: orgEmail,
      agent_id: agenciaId,
      provider: 'meta_instagram',
      external_account_id: 'ig-ag-21',
      access_token: 'x',
    });
    assert.ok(
      twentyOne.error?.message?.includes('máximo 20 cuentas IG'),
      `expected trigger error 'máximo 20 cuentas IG' but got: ${twentyOne.error?.message ?? 'null'}`
    );
  });

  test('content_drafts FK a editorial_calendar_slots respeta orden de migración', async () => {
    const { error } = await supabase.from('content_drafts').insert({
      portal_email: orgEmail,
      agent_id: naviId,
      social_account_id: '00000000-0000-0000-0000-000000000000',
      media_type: 'image',
      slot_id: '00000000-0000-0000-0000-000000000000',
    });
    assert.ok(
      /foreign key|violates/i.test(error?.message ?? ''),
      `expected FK violation but got: ${error?.message ?? 'null'}`
    );
  });
});
