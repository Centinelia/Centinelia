export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { executeAllRecoveryRules } from '@/lib/recovery/rules';

/**
 * Cron unificado de recovery. Corre las reglas declarativas de
 * src/lib/recovery/rules.ts y aplica transiciones automáticas para
 * stuck-states cross-machine.
 *
 * Recomendado: cada 15 min segun vercel.json cron schedule.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const summary  = await executeAllRecoveryRules(supabase);

  return NextResponse.json({
    ok: true,
    ...summary,
    ranAt: new Date().toISOString(),
  });
}
