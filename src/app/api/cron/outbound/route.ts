import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { processDueOutboundContacts } from '@/lib/outbound/process-due-contacts';
import { createAdminClient } from '@/lib/supabase/admin';
import { finalizeOrphanIncidents } from '@/lib/incidents/finalize';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processDueOutboundContacts();

  let incidentsFinalized = 0;
  try {
    const supabase = createAdminClient();
    const fin = await finalizeOrphanIncidents(supabase);
    incidentsFinalized = fin.finalized;
  } catch (err) {
    console.error('[cron/outbound] finalizeOrphanIncidents failed:', err);
  }

  return NextResponse.json({ ok: true, ...result, incidents_finalized: incidentsFinalized });
}
