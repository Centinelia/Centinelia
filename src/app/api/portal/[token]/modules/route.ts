import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { getModule, MODULE_CATALOG } from '@/lib/modules/catalog';

export const dynamic = 'force-dynamic';

/**
 * GET — devuelve el estado de todos los módulos del catálogo para esta org
 * (qué está activo, disponible, o requiere setup previo).
 *
 * POST — activa o desactiva un módulo. Body: { module_id, enabled }.
 * Cuando enabled=true y el módulo requiere setup (ej: QB no conectado),
 * devuelve 409 con el requerimiento faltante.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('features, invoicing_provider, quickbooks_connected, google_sheets_connected, cloud_catalog_provider')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: Record<string, unknown> | null };

  const features = (org?.features as Record<string, unknown>) ?? {};
  const setupState = {
    quickbooks:      !!(org?.quickbooks_connected),
    google_sheets:   !!(org?.google_sheets_connected),
    cloud_catalog:   !!(org?.cloud_catalog_provider),
    invoicing:       !!(org?.invoicing_provider),
  };

  const modules = MODULE_CATALOG.map(m => {
    const isActive = features[m.featureFlag] === true;
    return {
      ...m,
      isActive,
      setupComplete: checkSetup(m.featureFlag, setupState),
    };
  });

  return NextResponse.json({ modules });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const body = await req.json().catch(() => ({} as { module_id?: string; enabled?: boolean }));
  const moduleId = typeof body.module_id === 'string' ? body.module_id : '';
  const enabled  = body.enabled === true;

  const mod = getModule(moduleId);
  if (!mod) return NextResponse.json({ error: `módulo "${moduleId}" no existe en el catálogo` }, { status: 400 });

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('features, invoicing_provider, quickbooks_connected, google_sheets_connected, cloud_catalog_provider')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: Record<string, unknown> | null };
  if (!org) return NextResponse.json({ error: 'org not found' }, { status: 404 });

  // Si el cliente quiere ACTIVAR y el módulo requiere setup, verifica que las
  // integraciones necesarias existan. Si no, 409 con la lista faltante.
  if (enabled && mod.requiresSetup) {
    const setupState = {
      quickbooks:      !!(org?.quickbooks_connected),
      google_sheets:   !!(org?.google_sheets_connected),
      cloud_catalog:   !!(org?.cloud_catalog_provider),
      invoicing:       !!(org?.invoicing_provider),
    };
    if (!checkSetup(mod.featureFlag, setupState)) {
      return NextResponse.json({
        error: `El módulo "${mod.name}" requiere completar setup previo: ${mod.requirements.join(' · ')}`,
        setup_missing: true,
      }, { status: 409 });
    }
  }

  const currentFeatures = (org.features as Record<string, unknown>) ?? {};
  const nextFeatures = { ...currentFeatures, [mod.featureFlag]: enabled };

  const { error } = await supabase
    .from('organizations')
    .update({ features: nextFeatures })
    .eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: 'no se pudo actualizar' }, { status: 500 });

  return NextResponse.json({
    ok:          true,
    module_id:   mod.id,
    enabled,
    feature_key: mod.featureFlag,
  });
}

/**
 * Verifica si las integraciones prerequisito de un módulo están conectadas.
 * Si el módulo no tiene requiresSetup=true, siempre true.
 */
function checkSetup(flag: string, state: { quickbooks: boolean; google_sheets: boolean; cloud_catalog: boolean; invoicing: boolean }): boolean {
  if (flag === 'quickbooks')          return state.quickbooks;
  if (flag === 'ciclo_oc_cfdi')       return state.quickbooks;
  if (flag === 'google_sheets')       return state.google_sheets;
  if (flag === 'cloud_catalog')       return state.cloud_catalog;
  if (flag === 'invoicing_provider')  return state.invoicing;
  if (flag === 'external_tramites')   return false; // requiere integración custom que no expone flag simple
  return true;
}
