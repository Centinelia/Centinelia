/**
 * GET /api/portal/[token]/writer-download
 * Devuelve signed URL (10min TTL) del installer del writer .NET desde el bucket
 * privado `writer-installers`. Query `?version=<v>` optional; sin él, usa el
 * contenido de `latest.txt` para tomar la versión vigente.
 *
 * Auth: portal session + org ownership.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

const BUCKET = 'writer-installers';

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

  const supabase = createAdminClient();
  const url = new URL(req.url);
  let version = url.searchParams.get('version');

  if (!version) {
    // Lee la versión vigente desde latest.txt.
    const { data: latest, error: latestErr } = await supabase.storage.from(BUCKET).download('writer/latest.txt');
    if (latestErr || !latest) {
      return NextResponse.json({ error: 'No hay installer disponible aún. Contacta a Centinelia.' }, { status: 503 });
    }
    version = (await latest.text()).trim();
  }

  const key = `writer/centinelia-writer-v${version}.zip`;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, 600); // 10 min

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: `installer v${version} no encontrado` }, { status: 404 });
  }

  return NextResponse.json({
    version,
    filename: `centinelia-writer-v${version}.zip`,
    url:      signed.signedUrl,
    expires_in_sec: 600,
  });
}
