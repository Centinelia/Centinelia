export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import OnboardingSection     from '../../OnboardingSection';
import MeerkatPicker         from '../../agentes/MeerkatPicker';

interface Props { params: Promise<{ token: string }> }

export default async function OnboardingPage({ params }: Props) {
  const { token } = await params;

  const supabase     = createAdminClient();
  const { data: ag } = await supabase
    .from('voice_agents')
    .select('portal_email, plan, minutes_plan')
    .eq('portal_token', token)
    .single();

  const { data: all } = ag?.portal_email
    ? await supabase.from('voice_agents').select('id, business_name, features').eq('portal_email', ag.portal_email as string)
    : { data: [] };

  const agents = (all ?? []).map((a: any) => ({
    id:            a.id,
    business_name: a.business_name,
  }));

  const hasNaia = (all ?? []).some(
    (a: any) => (a.features as Record<string, unknown>)?.meerkat_role_id === 'naia',
  );

  const plan        = (ag as any)?.plan         ?? 'comercial';
  const defaultTier = (ag as any)?.minutes_plan ?? 'starter';

  return (
    <div id="of-onboarding" className="flex flex-col gap-6 p-4 md:p-6">

      {/* Banner — Naia present or not */}
      {hasNaia ? (
        <div className="flex rounded-xl overflow-hidden"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
          <img src="/meerkats/naia.png" alt="Naia"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
          <div className="flex-1 min-w-0 py-4 pr-4 pl-3 flex flex-col justify-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-4)' }}>
              Onboarding
            </p>
            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
              Naia gestiona el onboarding de nuevos empleados, clientes y proveedores.
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#22c55e' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#22c55e' }} />
                Disponible
              </span>
              <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Puede iniciar onboardings por teléfono, chat y correo</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex rounded-xl overflow-hidden"
          style={{ background: 'linear-gradient(to right, rgba(236,72,153,0.07), rgba(245,158,11,0.07))', border: '1px solid rgba(236,72,153,0.25)' }}>
          <img src="/meerkats/naia.png" alt="Naia"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
          <div className="flex-1 min-w-0 py-4 pr-4 pl-3 flex flex-col justify-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(236,72,153,0.7)' }}>
              Onboarding
            </p>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold leading-snug" style={{ color: '#ec4899' }}>
                Naia no está en tu equipo.
              </p>
              <MeerkatPicker
                token={token}
                plan={plan as 'comercial' | 'pro'}
                defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                preselect="naia"
                triggerLabel="Contratar"
              />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Sin Naia los onboardings se gestionan solo de forma manual. Naia puede iniciar y dar seguimiento al proceso de incorporación por teléfono, chat y correo.
            </p>
          </div>
        </div>
      )}

      <OnboardingSection token={token} agents={agents} />
    </div>
  );
}
