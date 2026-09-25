export const dynamic = 'force-dynamic';

/**
 * /portal/[token]/onboarding-wizard
 *
 * Wizard de 4 pantallas para la primera configuración del negocio
 * (Reglas base + Tareas base). Se muestra una sola vez al cliente;
 * una vez que completa o salta, `organizations.features.wizard_completed_at`
 * queda seteado y este wizard redirige al portal.
 *
 * El portal principal (page.tsx) puede redirigir aquí cuando
 * `wizard_completed_at` es null y ya hay meerkats client-facing activos.
 */

import { notFound, redirect } from 'next/navigation';
import { cookies }            from 'next/headers';
import { createAdminClient }  from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import OnboardingWizardClient from './OnboardingWizardClient';

interface Props { params: Promise<{ token: string }> }

export default async function OnboardingWizardPage({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  if (!session && process.env.NODE_ENV !== 'development') {
    redirect('/portal/login');
  }

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  const { portalEmail } = resolved;

  // Si el wizard ya se completó, no mostrarlo de nuevo
  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', portalEmail)
    .maybeSingle();

  const wizardCompletedAt = (org?.features as Record<string, unknown> | null)?.wizard_completed_at;
  if (wizardCompletedAt) {
    redirect(`/portal/${token}`);
  }

  // Obtener agentes activos del org para el multi-select de reglas
  const { data: agentsRaw } = await supabase
    .from('voice_agents')
    .select('id, agent_name, features')
    .eq('portal_email', portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true });

  const agents = (agentsRaw ?? [])
    .map(a => {
      const features = (a as any).features as Record<string, unknown> | null;
      const meerkatRoleId = (features?.meerkat_role_id as string | undefined) ?? '';
      return {
        id:            a.id as string,
        name:          ((a as any).agent_name as string | null)?.trim() || 'Empleado',
        meerkatRoleId,
      };
    })
    .filter(a => a.meerkatRoleId !== '');

  // Primer agente activo (para la bienvenida y creación de tareas)
  const primaryAgent = agents[0] ?? { id: '', name: 'tu empleado', meerkatRoleId: '' };

  return (
    <OnboardingWizardClient
      token={token}
      portalEmail={portalEmail}
      agentId={primaryAgent.id}
      agentName={primaryAgent.name}
      agents={agents}
    />
  );
}
