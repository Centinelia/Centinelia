export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/organizations/[email]/demo-pause
// Body: { paused: boolean, reason?: string }
//
// Kill switch org-wide para pilotos/demos. Bloquea voz + outbound + oficina
// SIN enviar correo al cliente (a diferencia de account_status='suspended',
// que es para incumplimiento y notifica al cliente).
//
// Ver src/lib/compliance/account-guard.ts para el comportamiento del gate.
// SQL directo alternativo (útil desde WhatsApp del owner):
//   UPDATE organizations SET demo_paused = TRUE WHERE portal_email = '...';
interface Params { params: Promise<{ email: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();

  const body = await req.json().catch(() => ({})) as { paused?: boolean; reason?: string };
  const paused = body.paused;
  if (typeof paused !== 'boolean') {
    return NextResponse.json({ error: 'paused (boolean) is required' }, { status: 400 });
  }
  const reason = body.reason?.trim() ?? null;

  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('portal_email, name, demo_paused')
    .eq('portal_email', email)
    .single();

  if (!org) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const wasPaused = Boolean(org.demo_paused);

  const { error: updateError } = await supabase
    .from('organizations')
    .update({ demo_paused: paused })
    .eq('portal_email', email);

  if (updateError) {
    console.error('[demo-pause] update error:', updateError);
    return NextResponse.json({ error: 'update_failed', message: updateError.message }, { status: 500 });
  }

  // Audit log (mismo patrón que enforce). Este cambio NO envía correo al cliente.
  void supabase.from('kyc_access_log').insert({
    admin_user:   'admin',
    target_email: email,
    action:       paused ? 'demo_pause' : 'demo_resume',
    notes:        reason,
  });

  return NextResponse.json({
    ok:            true,
    email,
    demo_paused:   paused,
    was_paused:    wasPaused,
    action:        paused ? 'demo_pause' : 'demo_resume',
  });
}
