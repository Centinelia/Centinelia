/**
 * scripts/sync-dropbox-token-to-billing.ts
 *
 * Puentea el access_token de Dropbox desde el portal OAuth
 * (`integration_accounts`) hacia el pipeline Nala
 * (`organization_integrations.config.dropbox_token`).
 *
 * Uso:
 *   npx tsx scripts/sync-dropbox-token-to-billing.ts <portal_email>
 *   npx tsx scripts/sync-dropbox-token-to-billing.ts --all
 *
 * Lógica en src/lib/dropbox/token-sync.ts (compartida con el cron
 * /api/cron/sync-dropbox-tokens).
 */
import './_bootstrap';
import { syncTokenFor, syncAllActiveTokens } from '@/lib/dropbox/token-sync';

const arg = process.argv[2];

if (!arg) {
  console.error('uso: npx tsx scripts/sync-dropbox-token-to-billing.ts <portal_email>|--all');
  process.exit(1);
}

async function main(): Promise<void> {
  if (arg === '--all') {
    const { results, summary } = await syncAllActiveTokens();
    for (const r of results) {
      const suffix = r.error ? `: ${r.error}` : r.refreshed ? ' (refreshed)' : '';
      console.log(`[${r.portal_email}] ${r.outcome}${suffix}`);
    }
    console.log(`\nresumen: ok=${summary.ok} skip=${summary.skip} error=${summary.error}`);
    process.exit(summary.error > 0 ? 3 : 0);
  }

  const r = await syncTokenFor(arg);
  const suffix = r.error ? `: ${r.error}` : r.refreshed ? ' (refreshed)' : '';
  console.log(`[${r.portal_email}] ${r.outcome}${suffix}`);
  if (r.expires_at) console.log(`  expira: ${r.expires_at}`);
  process.exit(r.outcome === 'ok' ? 0 : r.outcome === 'error' ? 2 : 3);
}

main().catch(err => {
  console.error('sync failed:', err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(4);
});
