export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { createAdminClient } from '@/lib/supabase/admin';
import { MODULE_CATALOG, modulesForVertical, type ModuleDefinition } from '@/lib/modules/catalog';
import { ModulosClient } from './ModulosClient';

interface Props { params: Promise<{ token: string }> }

export default async function ModulosPage({ params }: Props) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('features, invoicing_provider, quickbooks_connected, google_sheets_connected, cloud_catalog_provider')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: Record<string, unknown> | null };

  // Vertical del org (para filtrar módulos gobierno vs universal)
  const { data: primaryAgent } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .limit(1)
    .maybeSingle();
  const vertical = (primaryAgent?.features as { vertical?: string } | null)?.vertical;

  const features = (org?.features as Record<string, unknown>) ?? {};
  const setupState = {
    quickbooks:      !!(org?.quickbooks_connected),
    google_sheets:   !!(org?.google_sheets_connected),
    cloud_catalog:   !!(org?.cloud_catalog_provider),
    invoicing:       !!(org?.invoicing_provider),
  };

  function checkSetup(flag: string): boolean {
    if (flag === 'quickbooks')          return setupState.quickbooks;
    if (flag === 'ciclo_oc_cfdi')       return setupState.quickbooks;
    if (flag === 'google_sheets')       return setupState.google_sheets;
    if (flag === 'cloud_catalog')       return setupState.cloud_catalog;
    if (flag === 'invoicing_provider')  return setupState.invoicing;
    if (flag === 'external_tramites')   return false;
    return true;
  }

  const catalog = modulesForVertical(vertical).map((m: ModuleDefinition) => ({
    ...m,
    isActive:      features[m.featureFlag] === true,
    setupComplete: checkSetup(m.featureFlag),
  }));

  const activeCount = catalog.filter(m => m.isActive).length;

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">
      <header className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <Package size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Módulos
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Amplía lo que tus empleados hacen por ti
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            La base de cada empleado (recepción, agendar, tomar pedidos) siempre está incluida. Estos módulos agregan
            capacidades específicas — actívalos cuando los ocupes.
          </p>
        </div>
        <div className="hidden md:flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: '#9B8FB5' }}>Activos</span>
          <span className="text-3xl font-bold" style={{ color: '#6C3BFF' }}>{activeCount}<span className="text-lg" style={{ color: '#9B8FB5' }}>/{catalog.length}</span></span>
        </div>
      </header>

      <ModulosClient token={token} initial={catalog} />
    </div>
  );
}
