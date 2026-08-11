import { createAdminClient } from '@/lib/supabase/admin';
import { notFound, redirect } from 'next/navigation';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { maskEmail } from '@/lib/portal/setup-otp';
import SetupForm from './SetupForm';

interface Props { params: Promise<{ token: string }> }

export default async function SetupPage({ params }: Props) {
  const { token } = await params;

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  const supabase = createAdminClient();

  // Business name para display: primer agente activo.
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!agent) notFound();

  // Check si ya hay password. organizations es la SINGLE SOURCE OF TRUTH.
  // ANTES: dual-write con voice_agents.portal_password_hash. Si el hash quedaba
  // en voice_agents pero no en organizations (backfill parcial, race post-fix),
  // page redirigía a /login → user llegaba por welcome, veía LOGIN sin haber
  // creado password → loop cerrado sin forgot-password. Fix: single source.
  // Los agentes legacy con hash en voice_agents se backfillean silenciosamente
  // al org row para migración progresiva. Ver Scope D2 HIGH-3.
  const { data: org } = await supabase
    .from('organizations')
    .select('portal_password_hash')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { portal_password_hash: string | null } | null };

  if (!org?.portal_password_hash) {
    const { data: legacy } = await supabase
      .from('voice_agents').select('portal_password_hash')
      .eq('portal_email', resolved.portalEmail)
      .not('portal_password_hash', 'is', null).limit(1).maybeSingle() as { data: { portal_password_hash: string | null } | null };
    if (legacy?.portal_password_hash) {
      // Backfill al org (single source). No bloquea la UI: si el update falla,
      // caemos al setup igual — mejor eso que loop cerrado por dual-write bug.
      await supabase
        .from('organizations')
        .update({ portal_password_hash: legacy.portal_password_hash })
        .eq('portal_email', resolved.portalEmail);
      redirect(`/portal/login?from=/portal/${resolved.orgToken}`);
    }
  } else {
    redirect(`/portal/login?from=/portal/${resolved.orgToken}`);
  }

  return (
    <SetupForm
      token={resolved.orgToken}
      businessName={agent.business_name}
      maskedEmail={maskEmail(resolved.portalEmail)}
    />
  );
}
