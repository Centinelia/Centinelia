import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { getOrgToken } from '@/lib/portal/org-token';
import {
  sendEmail,
  accountWarningHtml,
  accountSuspendedHtml,
  accountTerminatedHtml,
} from '@/lib/email/send';

interface Params { params: Promise<{ email: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail).toLowerCase().trim();

  const { action, reason, suspend_until } = await req.json() as {
    action:         'warn' | 'suspend' | 'terminate' | 'lift_rate_limit' | 'reinstate';
    reason?:        string;
    suspend_until?: string | null;
  };

  if (!['warn', 'suspend', 'terminate', 'lift_rate_limit', 'reinstate'].includes(action))
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  if (!['lift_rate_limit', 'reinstate'].includes(action) && !reason?.trim())
    return NextResponse.json({ error: 'reason is required' }, { status: 400 });

  const supabase = createAdminClient();

  // Get org + client info for the email
  const { data: org } = await supabase
    .from('organizations')
    .select('portal_email, name, account_status')
    .eq('portal_email', email)
    .single();

  if (!org) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('client_name, portal_token')
    .eq('portal_email', email)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const clientName   = agent?.client_name ?? email;
  const businessName = org.name ?? email;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.centinelia.mx';
  const orgToken     = await getOrgToken(email, supabase);
  const tokenForUrl  = orgToken ?? agent?.portal_token ?? null;
  const portalUrl    = tokenForUrl ? `${appUrl}/portal/${tokenForUrl}` : appUrl;

  if (action === 'lift_rate_limit') {
    await supabase
      .from('organizations')
      .update({ outbound_limit_until: null })
      .eq('portal_email', email);
    return NextResponse.json({ ok: true, action, email });
  }

  if (action === 'reinstate') {
    await supabase
      .from('organizations')
      .update({
        account_status:   'active',
        suspended_at:     null,
        suspended_until:  null,
        suspension_reason: null,
      })
      .eq('portal_email', email);
    // Re-activate agents that were deactivated by suspension (not by the owner)
    await supabase
      .from('voice_agents')
      .update({ active: true })
      .eq('portal_email', email);
    return NextResponse.json({ ok: true, action, email });
  }

  if (action === 'warn') {
    await supabase.rpc('warn_organization', { p_email: email, p_reason: reason!.trim() });
    await sendEmail({
      to:      email,
      subject: 'Aviso de cumplimiento — Centinelia',
      html:    accountWarningHtml({ clientName, businessName, reason: reason!.trim(), portalUrl }),
    });
  } else if (action === 'suspend') {
    const until = suspend_until ?? null;
    await supabase.rpc('suspend_organization', {
      p_email:  email,
      p_reason: reason!.trim(),
      p_until:  until,
    });
    const untilFormatted = until
      ? new Date(until).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;
    await sendEmail({
      to:      email,
      subject: 'Tu cuenta de Centinelia ha sido suspendida',
      html:    accountSuspendedHtml({ clientName, businessName, reason: reason!.trim(), until: untilFormatted }),
    });
  } else {
    await supabase.rpc('terminate_organization', { p_email: email, p_reason: reason!.trim() });
    await sendEmail({
      to:      email,
      subject: 'Rescisión de contrato — Centinelia',
      html:    accountTerminatedHtml({ clientName, businessName, reason: reason!.trim() }),
    });
  }

  // Audit log
  void supabase.from('kyc_access_log').insert({
    admin_user:   'admin',
    target_email: email,
    action,
    notes: reason?.trim() ?? null,
  });

  return NextResponse.json({ ok: true, action, email });
}
