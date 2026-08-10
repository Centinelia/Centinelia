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

  // Check si ya hay password: org primero, fallback voice_agents.
  const { data: org } = await supabase
    .from('organizations')
    .select('portal_password_hash')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { portal_password_hash: string | null } | null };

  let alreadyRegistered = !!org?.portal_password_hash;
  if (!alreadyRegistered) {
    const { data: legacy } = await supabase
      .from('voice_agents').select('portal_password_hash')
      .eq('portal_email', resolved.portalEmail)
      .not('portal_password_hash', 'is', null).limit(1).maybeSingle() as { data: { portal_password_hash: string | null } | null };
    alreadyRegistered = !!legacy?.portal_password_hash;
  }
  if (alreadyRegistered) redirect(`/portal/login?from=/portal/${resolved.orgToken}`);

  return (
    <SetupForm
      token={resolved.orgToken}
      businessName={agent.business_name}
      maskedEmail={maskEmail(resolved.portalEmail)}
    />
  );
}
