export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { syncAllEmailIntegrations, syncAllOrgInboxes } from '@/lib/email/email-sync';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Corren en paralelo: dos rutas de ingesta independientes.
  // 1. Per-agent (email_integrations): cada empleado sincroniza SU bandeja
  // 2. Org-shared (integration_accounts): la bandeja compartida se ingesta y
  //    el dispatcher rutea al meerkat correcto por rol.
  const [perAgent, orgShared] = await Promise.all([
    syncAllEmailIntegrations().catch(err => {
      console.error('[cron/email-sync] per-agent error:', err);
      return { synced: 0, errors: 1 };
    }),
    syncAllOrgInboxes().catch(err => {
      console.error('[cron/email-sync] org-shared error:', err);
      return { synced: 0, errors: 1 };
    }),
  ]);

  return NextResponse.json({
    ok:          true,
    per_agent:   perAgent,
    org_shared:  orgShared,
  });
}
