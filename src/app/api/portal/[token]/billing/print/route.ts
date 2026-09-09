/**
 * POST /api/portal/[token]/billing/print
 * body: { uuid?, serie?, folio?, cliente_rfc?, fecha_desde?, fecha_hasta?, copies?, printer_name? }
 *
 * Encola un job de impresión de CFDI para que el Writer local lo procese.
 * Ver contract completo en src/lib/billing/print-queue.ts.
 *
 * Auth: portal session + org ownership.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { hydrateDropboxRefresh } from '@/lib/billing/adapters/hydrate-refresh';
import { DropboxClient } from '@/lib/billing/storage/dropbox';
import { LocalFilesStorage } from '@/lib/billing/storage/local-files';
import { decryptDropboxToken, type OrganizationIntegrationConfig } from '@/lib/billing/adapters';
import { enqueuePrintJob, type CfdiPrintRef } from '@/lib/billing/print-queue';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as {
    uuid?: string; serie?: string; folio?: string;
    cliente_rfc?: string; fecha_desde?: string; fecha_hasta?: string;
    copies?: number; printer_name?: string;
  };

  const supabase = createAdminClient();
  const { data: integ } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ config: OrganizationIntegrationConfig }>();
  if (!integ) return NextResponse.json({ error: 'No hay integración CONTPAQi configurada.' }, { status: 400 });

  // Hidratar refresh_token para que las llamadas Dropbox no revienten con 401.
  const cfg = integ.config as unknown as Record<string, unknown>;
  await hydrateDropboxRefresh(cfg, resolved.portalEmail, supabase);

  // Construir storage backend según config (Dropbox o local).
  const backend = cfg['storage_backend'] ?? 'dropbox';
  let storage: DropboxClient | LocalFilesStorage;
  let basePath: string;
  if (backend === 'local_files') {
    const local = cfg['local_base_path'] as string | undefined;
    if (!local) return NextResponse.json({ error: 'local_base_path missing' }, { status: 500 });
    storage = new LocalFilesStorage(local);
    basePath = '';
  } else {
    const dbxToken = decryptDropboxToken(cfg['dropbox_token'] as string);
    if (!dbxToken) return NextResponse.json({ error: 'dropbox_token missing' }, { status: 500 });
    const refreshRaw = cfg['dropbox_refresh_token'] as string | undefined;
    const onRefresh = cfg['on_dropbox_refresh'] as ((n: string) => void | Promise<void>) | undefined;
    const refresh = refreshRaw ? { refreshToken: decryptDropboxToken(refreshRaw)!, onRefresh } : undefined;
    storage = new DropboxClient(dbxToken, refresh);
    basePath = (cfg['dropbox_base_path'] as string | undefined) ?? '/Facturacion';
  }

  const ref: CfdiPrintRef = {
    uuid:        body.uuid?.trim(),
    serie:       body.serie?.trim(),
    folio:       body.folio?.trim(),
    clienteRfc:  body.cliente_rfc?.trim(),
    fechaDesde:  body.fecha_desde?.trim(),
    fechaHasta:  body.fecha_hasta?.trim(),
  };

  try {
    const result = await enqueuePrintJob({
      storage,
      basePath,
      ref,
      copies:      body.copies,
      printerName: body.printer_name ?? null,
      requestedBy: session.portalEmail,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
