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

  const hasNaia = (all ?? []).some(
    (a: any) => (a.features as Record<string, unknown>)?.meerkat_role_id === 'naia',
  );

  const plan        = (ag as any)?.plan         ?? 'pro';
  const defaultTier = (ag as any)?.minutes_plan ?? 'starter';

  return (
    <div id="of-onboarding" className="flex flex-col gap-6 p-4 md:p-6">

      {/* Banner: Naia present or not */}
      {hasNaia ? (
        <div className="flex overflow-hidden rounded-2xl"
          style={{
            background: '#ffffff',
            border: '1px solid #E8E3F5',
            boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
          }}>
          <img src="/meerkats/naia.png" alt="Naia"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
          <div className="flex-1 min-w-0 py-4 pr-5 pl-3 flex flex-col justify-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>
              Onboarding
            </p>
            <p className="text-[14px] font-semibold leading-snug" style={{ color: '#1A0A3B' }}>
              Naia gestiona el onboarding de nuevos empleados, clientes y proveedores.
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: '#22c55e' }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#22c55e' }} />
                Disponible
              </span>
              <span className="text-[12px]" style={{ color: '#6B6480' }}>
                Puede iniciar onboardings por teléfono, chat y correo
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex overflow-hidden rounded-2xl"
          style={{
            background: '#ffffff',
            border: '1px solid #E8E3F5',
            boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
          }}>
          <img src="/meerkats/naia.png" alt="Naia"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end" />
          <div className="flex-1 min-w-0 py-4 pr-5 pl-3 flex flex-col justify-center gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
              Onboarding
            </p>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[14px] font-semibold leading-snug" style={{ color: '#1A0A3B' }}>
                Naia no está en tu equipo.
              </p>
              <MeerkatPicker
                token={token}
                plan={plan as 'pro'}
                defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                preselect="naia"
                triggerLabel="Contratar"
              />
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
              Sin Naia los onboardings se gestionan solo de forma manual. Naia puede iniciar y dar seguimiento al proceso de incorporación por teléfono, chat y correo.
            </p>
          </div>
        </div>
      )}

      <OnboardingSection token={token} />
    </div>
  );
}
