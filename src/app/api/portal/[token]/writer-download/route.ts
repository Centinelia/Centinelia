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
import { decrypt } from '@/lib/crypto';

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
  //
  // Windows-locales: capturados por la clienta en el portal (setup-contpaqi).
  // Passwords cifradas en DB con encrypt(); las desciframos SOLO aquí para
  // embeberlas en el config.json que el writer lee al arranque. El zip queda
  // con las passwords en plaintext dentro del archivo — pero es descarga
  // single-shot autenticada por sesión + ownership, y el writer al terminar
  // el bootstrap las persiste en appsettings.local.json local (protegido por
  // ACLs SYSTEM+Admin). Modelo de amenaza mismo que ya vivía en el wizard CLI.
  const w = (cfg['windows'] as Record<string, string> | undefined) ?? {};
  const tryDecrypt = (v: string | undefined): string => {
    if (!v) return '';
    try { return decrypt(v); }
    catch (e) {
      console.warn('[writer-download] decrypt failed for password field, sending empty:', (e as Error).message);
      return '';
    }
  };

  const zip = await JSZip.loadAsync(zipBuf);
  const config = {
    endpoint:            APP_URL,
    api_token:           apiToken,
    portal_email:        resolved.portalEmail,
    dropbox_base_path:   basePath,
    generated_at:        new Date().toISOString(),
    version,
    windows: {
      sdk_path:       w.sdk_path       ?? 'C:\\Program Files (x86)\\Compac\\COMERCIAL',
      empresa_path:   w.empresa_path   ?? '',
      usuario:        w.usuario        ?? 'SUPERVISOR',
      concepto:       w.concepto       ?? '440',
      sql_connection: w.sql_connection ?? '',
      password:       tryDecrypt(w.password_encrypted),
      csd_password:   tryDecrypt(w.csd_password_encrypted),
    },
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
    '2. Doble-click en BillingContpaqiWriter.exe.',
    '3. Sale un resumen y pregunta "¿arrancar con Windows?". Dale Enter.',
    '4. Windows va a pedir permiso para instalar el servicio. Dale "Sí".',
    '5. Listo. Se cierra la ventana y el writer queda corriendo en background,',
    '   y arranca solo cada vez que prendas la PC.',
    '',
    'Si te falta info: si alguno de los datos (empresa CONTPAQi, SUPERVISOR, CSD,',
    'SQL, etc.) no lo llenaste en el portal, el EXE te lo pregunta en consola',
    'antes de continuar. Para evitar preguntas: entra al portal, completa todos',
    'los campos de "Datos de tu PC de facturación" y descarga el zip de nuevo.',
    '',
    'Notas:',
    '  - Si necesitas cambiar algún dato después, borra appsettings.local.json y vuelve al paso 3.',
    '  - Si el writer no arranca, revisa los logs en:',
    '      C:\\ProgramData\\Centinelia\\BillingWriter\\logs\\writer-YYYY-MM-DD.log',
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
