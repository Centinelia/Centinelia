/**
 * GET /api/portal/[token]/writer-download
 * Descarga el zip del writer .NET **pre-configurado** con `centinelia-config.json`
 * inyectado (endpoint + api_token + dropbox_base_path + portal_email del cliente).
 * Al arrancar el writer lee este archivo y auto-configura sin que Beatriz teclee nada.
 *
 * Requiere que `organization_integrations type='contpaqi'` con `writer_api_token`
 * exista para el portal — si no, retorna 409 pidiendo terminar setup primero.
 *
 * Auth: portal session + org ownership.
 * Wizard Setup CONTPAQi fase 2 (2026-09-07 noche).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import JSZip from 'jszip';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

const BUCKET = 'writer-installers';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

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

  // 1. Sacar config del cliente (endpoint, api_token, dropbox_base_path).
  const { data: integ, error: integErr } = await supabase
    .from('organization_integrations')
    .select('config')
    .eq('portal_email', resolved.portalEmail)
    .eq('type', 'contpaqi')
    .maybeSingle<{ config: Record<string, unknown> }>();
  if (integErr) return NextResponse.json({ error: integErr.message }, { status: 500 });
  const cfg = integ?.config;
  const apiToken = cfg?.['writer_api_token'] as string | undefined;
  if (!cfg || !apiToken) {
    return NextResponse.json({
      error: 'Termina el Setup CONTPAQi primero (falta writer_api_token). Vuelve al wizard, revisa los datos y da Guardar.',
    }, { status: 409 });
  }
  const basePath = (cfg['dropbox_base_path'] as string | undefined) ?? '/Facturacion';

  // 2. Determinar versión (de latest.txt) y descargar el zip base del bucket.
  const url = new URL(req.url);
  let version = url.searchParams.get('version');
  if (!version) {
    const { data: latest, error: latestErr } = await supabase.storage.from(BUCKET).download('writer/latest.txt');
    if (latestErr || !latest) {
      return NextResponse.json({ error: 'No hay installer disponible aún. Contacta a Centinelia.' }, { status: 503 });
    }
    version = (await latest.text()).trim();
  }

  const zipKey = `writer/centinelia-writer-v${version}.zip`;
  const { data: zipBlob, error: zipErr } = await supabase.storage.from(BUCKET).download(zipKey);
  if (zipErr || !zipBlob) {
    return NextResponse.json({ error: `installer v${version} no encontrado en storage` }, { status: 404 });
  }
  const zipBuf = Buffer.from(await zipBlob.arrayBuffer());

  // 3. Cargar zip, inyectar centinelia-config.json + LEEME, re-generar.
  const zip = await JSZip.loadAsync(zipBuf);
  const config = {
    endpoint:            APP_URL,
    api_token:           apiToken,
    portal_email:        resolved.portalEmail,
    dropbox_base_path:   basePath,
    generated_at:        new Date().toISOString(),
    version,
  };
  zip.file('centinelia-config.json', JSON.stringify(config, null, 2));

  const readme = [
    'Centinelia Writer for CONTPAQi',
    '==============================',
    '',
    `Version: ${version}`,
    `Cliente: ${resolved.portalEmail}`,
    `Generado: ${new Date().toISOString()}`,
    '',
    'Como usar:',
    '',
    '1. Descomprime esta carpeta en tu PC (donde vive CONTPAQi).',
    '2. Doble click en BillingContpaqiWriter.exe',
    '3. El programa arranca ya configurado con tus datos (centinelia-config.json).',
    '4. Al primer arranque te va a pedir la empresa/BD de CONTPAQi.',
    '5. Autoriza acceso a Dropbox si te lo pide.',
    '6. Listo. Se ejecuta en background y sincroniza cada 60 minutos.',
    '',
    'Soporte: hola@centinelia.mx',
  ].join('\n');
  zip.file('LEEME.txt', readme);

  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const safeEmail = resolved.portalEmail.replace(/[^a-z0-9]/gi, '_');
  const filename = `centinelia-writer-${safeEmail}-v${version}.zip`;

  return new NextResponse(new Uint8Array(outBuf), {
    status: 200,
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(outBuf.length),
      'Cache-Control':       'no-store',
      'X-Writer-Version':    version,
    },
  });
}
