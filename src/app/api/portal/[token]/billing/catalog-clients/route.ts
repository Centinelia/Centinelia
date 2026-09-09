/**
 * GET /api/portal/[token]/billing/catalog-clients?q=<busqueda>
 *
 * Lista de clientes del catálogo (CONTPAQi) para autocomplete en la card
 * de pendientes. Si `q` se pasa, filtra por razon_social o RFC. Sin `q`,
 * retorna los primeros 100.
 *
 * Auth: portal session + org ownership.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { buildAdapter, type OrganizationIntegrationConfig } from '@/lib/billing/adapters';
import { hydrateDropboxRefresh } from '@/lib/billing/adapters/hydrate-refresh';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ config: OrganizationIntegrationConfig }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ clients: [] });

  try {
    // Hidratar refresh_token de Dropbox para que el adapter pueda renovar
    // access tokens expirados en el propio request.
    await hydrateDropboxRefresh(
      row.config as unknown as Record<string, unknown>,
      resolved.portalEmail,
      supabase,
    );
    const adapter = buildAdapter(row.config);
    const all = await (adapter as unknown as { listAllClients: () => Promise<Array<{ rfc: string; razonSocial: string; usoCFDI?: string; regimen?: string; codigoPostal?: string }>> }).listAllClients();
    const filtered = q
      ? all.filter(c =>
          c.razonSocial?.toLowerCase().includes(q) ||
          c.rfc?.toLowerCase().includes(q))
      : all;
    return NextResponse.json({
      clients: filtered.slice(0, 100).map(c => ({
        rfc:            c.rfc,
        razon_social:   c.razonSocial,
        uso_cfdi:       c.usoCFDI ?? null,
        regimen:        c.regimen ?? null,
        codigo_postal:  c.codigoPostal ?? null,
      })),
    });
  } catch (e) {
    // Fallo suave: sin catálogo sincronizado en Dropbox, retornamos array
    // vacío con 200 para que la UI no muestre error roto. Beatriz puede
    // escribir el cliente libre en el input. El Writer eventualmente sube
    // el catálogo y el autocomplete arranca a funcionar sin cambios en UI.
    const errMsg = (e as Error).message;
    console.warn('[catalog-clients] catálogo no disponible, devolviendo lista vacía:', errMsg);
    return NextResponse.json({
      clients: [],
      warning: 'Catálogo no sincronizado desde CONTPAQi. Puedes escribir el cliente manualmente.',
    });
  }
}
