// Cron diario que orquesta el lifecycle de contratos anuales:
//   - Reset mensual del pool cuando pool_reset_date <= today.
//   - Recordatorios de renovación 60d y 15d antes de end_date.
//   - Auto-expiración cuando end_date < today.
//   - Auto-activación de drafts con start_date <= today (renovaciones programadas).
//
// Idempotente. Corre 4am UTC (antes del reset-minutes de Stripe a las 12pm UTC).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { runLifecycleTick, activateScheduledDrafts } from '@/lib/annual-contracts/lifecycle';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tick = await runLifecycleTick();
  const activated = await activateScheduledDrafts();

  // Nota: el envío de correos (E2 60d/15d, E3 expired, E6 internal) se
  // implementa en Fase 4 cuando existan los templates. Los flags booleanos
  // ya están marcados aquí para prevenir re-envío.

  return NextResponse.json({
    pool_resets:        tick.pool_resets,
    reminders_60d_sent: tick.reminders_60d_sent.length,
    reminders_15d_sent: tick.reminders_15d_sent.length,
    auto_expired:       tick.auto_expired.length,
    drafts_activated:   activated.length,
  });
}
