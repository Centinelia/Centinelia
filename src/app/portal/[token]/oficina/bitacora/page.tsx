export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import OficinaPageHero from '../OficinaPageHero';
import { loadBitacoraData } from './loadBitacoraData';
import { BitacoraClient } from './BitacoraClient';
import { DeliveryConfig } from './DeliveryConfig';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ week?: string }>;
}

const DEFAULT_DELIVERY_CFG = {
  enabled:                       false,
  day_of_week:                   6,
  hour:                          14,
  recipients:                    [] as string[],
  include_monthly_last_saturday: true,
};

export default async function BitacoraPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { week }  = await searchParams;
  const data = await loadBitacoraData(token, week);
  if (!data) notFound();

  // Cargar config de envío (independiente del enabled del feature — puede
  // mostrarse aunque no haya incidencias todavía).
  const resolved = await resolveOrgFromToken(token);
  const supabase = createAdminClient();
  const { data: org } = resolved
    ? await supabase.from('organizations').select('bitacora_weekly_config').eq('portal_email', resolved.portalEmail).maybeSingle()
    : { data: null };
  const deliveryCfg = (org?.bitacora_weekly_config as typeof DEFAULT_DELIVERY_CFG | null) ?? DEFAULT_DELIVERY_CFG;

  if (!data.enabled) {
    return (
      <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
        <OficinaPageHero
          icon={ClipboardList}
          eyebrow="Bitacora"
          title="Bitacora semanal"
        />
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}
        >
          <ClipboardList size={20} style={{ color: '#9B8FB5', margin: '0 auto 8px' }} />
          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
            Bitacora no habilitada para esta cuenta
          </p>
          <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
            El seguimiento de incidencias de clientes no esta activo en tu plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <OficinaPageHero
        icon={ClipboardList}
        eyebrow="Bitacora"
        title="Bitacora semanal"
        description="Registro de incidencias de clientes para la semana seleccionada. Puedes asignar o corregir el vendedor responsable directamente en la tabla."
      />
      <BitacoraClient token={token} initial={data} />
      <DeliveryConfig token={token} initial={deliveryCfg} />
    </div>
  );
}
