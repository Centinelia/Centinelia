/**
 * F12 battle test: create a sub-user for Pneuma Studio with modules=['of_bandeja']
 * only, mint a sub-user session, then hit 3 URLs and check redirect behavior:
 *   1. /portal/{token}/oficina/bandeja  → 200 (allowed)
 *   2. /portal/{token}/oficina/documentos → 3xx redirect (blocked, not in modules)
 *   3. /portal/{token}/usuarios → 3xx redirect (owner-only)
 * Cleans up the sub-user afterwards.
 */
import { loadEnv } from './_env';
loadEnv();

import { createClient } from '@supabase/supabase-js';
import { createSubUserSession, PORTAL_COOKIE } from '../../src/lib/portal/auth';

const APP           = process.env.BATTLE_TEST_URL ?? 'http://localhost:3000';
const PORTAL_EMAIL  = 'studio@pneumastudio.mx';
const PORTAL_TOKEN  = '8892c013-b122-4f11-a9d4-e88a04aff732';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Create ephemeral sub-user
  const suEmail = `battle-sub-${Date.now()}@pneumastudio.mx`;
  const { data: created, error: createErr } = await s
    .from('portal_users')
    .insert({
      account_id: PORTAL_EMAIL,
      email:        suEmail,
      name:         'Battle sub-user',
      password_hash: 'placeholder.placeholder', // we don't need to log in via password, we mint session directly
      modules:      ['of_bandeja'],
    })
    .select('id')
    .single();
  if (createErr) { console.error('create err:', createErr); return; }
  console.log(`Created sub-user ${created.id} with modules=[of_bandeja]`);

  const cookie = await createSubUserSession(PORTAL_EMAIL, created.id as string, ['of_bandeja']);

  const cases = [
    { url: `/portal/${PORTAL_TOKEN}/oficina/bandeja`,    expect: 'allowed' },
    { url: `/portal/${PORTAL_TOKEN}/oficina/documentos`, expect: 'redirect' },
    { url: `/portal/${PORTAL_TOKEN}/usuarios`,           expect: 'redirect (owner-only)' },
  ];

  for (const c of cases) {
    const res = await fetch(`${APP}${c.url}`, {
      redirect: 'manual',
      headers: { Cookie: `${PORTAL_COOKIE}=${cookie}` },
    });
    const loc = res.headers.get('location') ?? '';
    const isRedirect = res.status >= 300 && res.status < 400;
    console.log(`  ${c.url}`);
    console.log(`    → HTTP ${res.status}${loc ? ` → ${loc}` : ''}`);
    console.log(`    expected: ${c.expect}  actual: ${isRedirect ? 'redirect' : 'allowed'}`);
    console.log('');
  }

  // Cleanup
  await s.from('portal_users').delete().eq('id', created.id);
  console.log('Sub-user cleaned up.');
}
main().catch(err => { console.error(err); process.exit(1); });
