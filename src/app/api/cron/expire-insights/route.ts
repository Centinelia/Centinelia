export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Expira insights que llevan >EXPIRE_DAYS sin acción del usuario.
// Evita el backlog contemplativo — si no lo atendiste en 2 semanas, el
// dato probablemente ya no es relevante y ocupa espacio del cap.
const EXPIRE_DAYS = 14;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff   = new Date(Date.now() - EXPIRE_DAYS * 86400000).toISOString();

  const { data, error } = await supabase
    .from('agent_recommendations')
    .update({ status: 'expirada', resolved_at: new Date().toISOString() })
    .eq('status', 'nueva')
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, expired: (data ?? []).length });
}
