export const dynamic = 'force-dynamic';
// 2026-10-08 Nazre: 60s era insuficiente para flujos reales con 2+ attachments
// (OC+Factura TRANE). El loop LLM + tool exec + force-draft puede tomar 90-120s.
// Vercel mataba el flow a los 60s → ops cobradas sin ops_inbox row creado →
// orphan processing → re-poll creaba race condition. Subir a 300s (plan Pro
// limit es 300s por function) elimina el crash en el flujo normal.
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { syncAllEmailIntegrations } from '@/lib/email/email-sync';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Solo per-agent (email_integrations): cada empleado sincroniza SU bandeja.
  //
  // Org-shared (integration_accounts capability='email') fue deprecada 2026-09-04.
  // Solo Pneuma la usaba y estaba apuntando al Gmail personal de Nazre, así que
  // todo el ruido (bancos, aerolíneas, LinkedIn, marketing MX) entraba a la
  // bandeja de los meerkats. Ver [[org-level-email-deprecated]].
  const perAgent = await syncAllEmailIntegrations().catch(err => {
    console.error('[cron/email-sync] per-agent error:', err);
    return { synced: 0, errors: 1 };
  });

  return NextResponse.json({ ok: true, per_agent: perAgent });
}
