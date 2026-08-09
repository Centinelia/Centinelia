export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { UserCheck } from 'lucide-react';
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
    <div id="of-onboarding" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <UserCheck size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Onboarding
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Incorporación de personas
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            Da la bienvenida a nuevos empleados, clientes o proveedores con un flujo automatizado por los tres canales.
          </p>
        </div>
      </header>

      {/* ── Card de estado de Naia (upsell o disponible) ─────────────────── */}
      {hasNaia ? (
        <div
          className="flex items-stretch rounded-2xl overflow-hidden"
          style={{
            background: '#ffffff',
            border: '1px solid #E8E3F5',
            boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
          }}
        >
          <img
            src="/meerkats/naia.png"
            alt="Naia"
            className="w-32 h-32 object-contain object-bottom shrink-0 self-end"
          />
          <div className="flex-1 min-w-0 py-4 pr-5 pl-3 flex flex-col justify-center gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
              Empleado responsable
            </p>
            <p className="text-[14px] font-semibold leading-snug" style={{ color: '#1A0A3B' }}>
              Naia gestiona el onboarding en todos los canales.
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.25)' }}>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22C55E' }} />
                Disponible
              </span>
              <span className="text-[12px]" style={{ color: '#6B6480' }}>
                Teléfono · Chat · Correo
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex items-stretch rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(236,72,153,0.08) 0%, rgba(168,85,247,0.06) 60%, #ffffff 100%)',
            border: '1px solid rgba(236,72,153,0.30)',
            boxShadow: '0 4px 20px rgba(236,72,153,0.08)',
          }}
        >
          <img
            src="/meerkats/naia.png"
            alt="Naia"
            className="w-36 h-36 object-contain object-bottom shrink-0 self-end"
          />
          <div className="flex-1 min-w-0 py-5 pr-5 pl-2 flex flex-col justify-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#DB2777', letterSpacing: '0.08em' }}>
              Contrata a Naia
            </p>
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Naia no está en tu equipo.
            </h2>
            <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
              Sin Naia los onboardings se gestionan solo de forma manual. Naia puede iniciar y dar seguimiento al proceso de incorporación por teléfono, chat y correo automáticamente.
            </p>
            <div className="mt-2">
              <MeerkatPicker
                token={token}
                plan={plan as 'pro'}
                defaultTier={defaultTier as 'starter' | 'growth' | 'scale'}
                preselect="naia"
                triggerLabel="Contratar Naia"
              />
            </div>
          </div>
        </div>
      )}

      <OnboardingSection token={token} />
    </div>
  );
}
