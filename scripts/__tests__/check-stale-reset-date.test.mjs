import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { findStaleResetDateReads } from '../check-stale-reset-date.mjs';

async function makeFixture(files) {
  const root = await mkdtemp(join(tmpdir(), 'reset-date-lint-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

describe('check-stale-reset-date linter', () => {
  it('flagea .from("voice_agents").select con minutes_reset_date sin helper', async () => {
    const root = await makeFixture({
      'src/app/api/cron/evil/route.ts': `
        import { createAdminClient } from '@/lib/supabase/admin';
        const supabase = createAdminClient();
        const { data } = await supabase.from('voice_agents')
          .select('id, minutes_reset_date, agent_name')
          .eq('active', true);
        console.log(data[0].minutes_reset_date);
      `,
    });
    const { violations } = await findStaleResetDateReads({ root, targets: [join(root, 'src')] });
    expect(violations).toContain('src/app/api/cron/evil/route.ts');
  });

  it('NO flagea cuando el archivo también importa loadAccountCycle', async () => {
    const root = await makeFixture({
      'src/app/api/cron/good/route.ts': `
        import { loadAccountCycle } from '@/lib/portal/account-cycle';
        import { createAdminClient } from '@/lib/supabase/admin';
        const supabase = createAdminClient();
        const { data } = await supabase.from('voice_agents')
          .select('id, minutes_reset_date, agent_name')
          .eq('active', true);
        const cycle = await loadAccountCycle(supabase, 'x@x.com', { agentResetDate: data[0].minutes_reset_date });
      `,
    });
    const { violations } = await findStaleResetDateReads({ root, targets: [join(root, 'src')] });
    expect(violations).not.toContain('src/app/api/cron/good/route.ts');
  });

  it('NO flagea lecturas de account_minutes', async () => {
    const root = await makeFixture({
      'src/app/api/cron/ok/route.ts': `
        import { createAdminClient } from '@/lib/supabase/admin';
        const supabase = createAdminClient();
        const { data } = await supabase.from('account_minutes')
          .select('minutes_used, minutes_included, minutes_reset_date')
          .eq('portal_email', 'x@x.com');
      `,
    });
    const { violations } = await findStaleResetDateReads({ root, targets: [join(root, 'src')] });
    expect(violations).toHaveLength(0);
  });

  it('NO flagea escrituras (update/insert) al campo', async () => {
    const root = await makeFixture({
      'src/app/api/seed/route.ts': `
        import { createAdminClient } from '@/lib/supabase/admin';
        const supabase = createAdminClient();
        await supabase.from('voice_agents').insert({
          id: 'x',
          minutes_reset_date: '2026-11-01',
        });
      `,
    });
    const { violations } = await findStaleResetDateReads({ root, targets: [join(root, 'src')] });
    expect(violations).toHaveLength(0);
  });

  it('respeta allow-list', async () => {
    const root = await makeFixture({
      'src/legit/reader.ts': `
        import { createAdminClient } from '@/lib/supabase/admin';
        const supabase = createAdminClient();
        await supabase.from('voice_agents').select('id, minutes_reset_date');
      `,
    });
    const allowList = new Set(['src/legit/reader.ts']);
    const { violations } = await findStaleResetDateReads({ root, targets: [join(root, 'src')], allowList });
    expect(violations).toHaveLength(0);
  });

  it('escaneo real del repo pasa (0 violaciones)', async () => {
    // Smoke: el checkeo real contra src/ del repo real debe pasar en CI.
    const root = process.cwd();
    const { violations } = await findStaleResetDateReads({ root, targets: [join(root, 'src')] });
    expect(violations).toHaveLength(0);
  });
});
