/**
 * GET /api/portal/[token]/facturacion-emision/xml?path=<relative>
 *
 * Descarga un XML de importación previamente generado en el storage
 * backend del adapter (Dropbox o local files). El `path` es relativo al
 * `basePath` — típicamente `/Importables_CONTPAQi/pendientes/facturas_*.xml`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { DropboxClient } from '@/lib/billing/storage/dropbox';
import { LocalFilesStorage } from '@/lib/billing/storage/local-files';
import { decryptDropboxToken, type OrganizationIntegrationConfig } from '@/lib/billing/adapters';
import { basename } from 'node:path';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!auth.portalEmail || auth.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const path = req.nextUrl.searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  // Path traversal fix (auditoría 2026-09-04): antes `path.includes('/pendientes/')`
  // aceptaba `../../etc/passwd/Importables_CONTPAQi/pendientes/x.xml`. Ahora:
  //   (a) NO permite `..` en ninguna parte del path.
  //   (b) Debe empezar con `/` seguido de segmentos válidos.
  //   (c) Debe contener `/Importables_CONTPAQi/pendientes/` como segmento
  //       propio (no substring cualquiera).
  const pathOk =
    !path.includes('..') &&
    path.startsWith('/') &&
    /(^|\/)Importables_CONTPAQi\/pendientes\/[^/]+\.xml$/.test(path);
  if (!pathOk) {
    return NextResponse.json({ error: 'path not allowed' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle() as { data: { config: OrganizationIntegrationConfig } | null };

  if (!integration) {
    return NextResponse.json({ error: 'No CONTPAQi integration' }, { status: 400 });
  }

  const cfg = integration.config;
  const backend = cfg.storage_backend ?? 'dropbox';
  let buffer: Buffer;
  try {
    if (backend === 'local_files') {
      if (!cfg.local_base_path) {
        return NextResponse.json({ error: 'local_base_path missing' }, { status: 500 });
      }
      buffer = await new LocalFilesStorage(cfg.local_base_path).readFile(path);
    } else {
      if (!cfg.dropbox_token) {
        return NextResponse.json({ error: 'dropbox_token missing' }, { status: 500 });
      }
      buffer = await new DropboxClient(decryptDropboxToken(cfg.dropbox_token)!).readFile(path);
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Read failed: ${(err as Error).message}` },
      { status: 404 },
    );
  }

  const filename = basename(path);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
