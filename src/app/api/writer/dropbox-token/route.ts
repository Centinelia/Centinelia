/**
 * GET /api/writer/dropbox-token
 * Auth: Bearer <writer_api_token>
 *
 * El Windows Writer llama este endpoint al arranque para obtener un access
 * token de Dropbox short-lived del meerkat Nala (per-agent). Así Beatriz
 * nunca tiene que pegar tokens manualmente ni pasar por OAuth desde Windows.
 *
 * Flujo:
 *   1. Extraer writer_api_token del header Authorization: Bearer <token>.
 *   2. Buscar `organization_integrations` type='contpaqi' con
 *      config.writer_api_token = token → obtener portal_email.
 *   3. Encontrar Nala (voice_agents con meerkat_role_id='nala') de esa org.
 *   4. Leer integration_accounts capability='storage_dropbox' con agent_id de Nala.
 *   5. Si expires_at está a <5min, refresh usando el refresh_token.
 *   6. Devolver access_token + expires_at + dropbox_base_path.
 *
 * Errores:
 *   401 si el token no matchea ninguna org.
 *   404 si la org no tiene Nala activa o no tiene Dropbox conectado.
 *   500 si el refresh falla.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    // Log a Vercel + devolver mensaje explícito para que el Writer .NET pueda
    // reportar la causa sin verlo como HTTP 500 mudo.
    console.error('[writer/dropbox-token] crash:', e);
    return NextResponse.json(
      { error: `Error interno: ${(e as Error).message}` },
      { status: 500 });
  }
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+([\w\-\.=+/]+)$/i.exec(auth);
  if (!match) {
    return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 });
  }
  const writerToken = match[1].trim();
  if (writerToken.length < 16) {
    return NextResponse.json({ error: 'Token too short' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Resolver la org por writer_api_token.
  const { data: integ, error: integErr } = await supabase
    .from('organization_integrations')
    .select('portal_email, config')
    .eq('type', 'contpaqi')
    .eq('config->>writer_api_token', writerToken)
    .maybeSingle<{ portal_email: string; config: Record<string, unknown> }>();
  if (integErr) return NextResponse.json({ error: integErr.message }, { status: 500 });
  if (!integ) return NextResponse.json({ error: 'Invalid writer token' }, { status: 401 });

  const dropboxBasePath = (integ.config['dropbox_base_path'] as string | undefined) ?? '/Facturacion';

  // 2. Encontrar Nala activa de la org.
  const { data: nala } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', integ.portal_email)
    .eq('features->>meerkat_role_id', 'nala')
    .eq('active', true)
    .maybeSingle<{ id: string }>();
  if (!nala) {
    return NextResponse.json({ error: 'No hay Nala activa en esta organización' }, { status: 404 });
  }

  // 3. Leer per-agent Dropbox de integration_accounts.
  const { data: acct, error: acctErr } = await supabase
    .from('integration_accounts')
    .select('access_token, refresh_token, expires_at, status')
    .eq('agent_id', nala.id)
    .eq('capability', 'storage_dropbox')
    .neq('status', 'disconnected')
    .maybeSingle<{
      access_token: string | null;
      refresh_token: string | null;
      expires_at: string | null;
      status: string;
    }>();
  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 });
  if (!acct) {
    return NextResponse.json({ error: 'Dropbox no conectado para Nala' }, { status: 404 });
  }

  // Tokens en integration_accounts pueden estar en plaintext (rows legacy o
  // provisioning manual) o encriptados con aes-256-gcm. decryptOrPassthrough
  // maneja ambos casos sin tronar.
  const { decryptOrPassthrough } = await import('@/lib/crypto');
  let accessToken = acct.access_token ? decryptOrPassthrough(acct.access_token).value : '';
  let expiresAt = acct.expires_at ? new Date(acct.expires_at) : null;

  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (needsRefresh) {
    if (!acct.refresh_token) {
      return NextResponse.json({ error: 'Token expirado y sin refresh_token' }, { status: 500 });
    }
    try {
      const plainRefresh = decryptOrPassthrough(acct.refresh_token).value;
      const { dropboxRefreshToken } = await import('@/lib/dropbox/oauth');
      const refreshed = await dropboxRefreshToken(plainRefresh);
      accessToken = refreshed.access_token;
      expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
      const { encrypt } = await import('@/lib/crypto');
      await supabase
        .from('integration_accounts')
        .update({
          access_token: encrypt(refreshed.access_token),
          expires_at:   expiresAt.toISOString(),
          status:       'active',
        })
        .eq('agent_id', nala.id)
        .eq('capability', 'storage_dropbox');
    } catch (e) {
      return NextResponse.json({ error: `Refresh falló: ${(e as Error).message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    access_token:      accessToken,
    expires_at:        expiresAt!.toISOString(),
    dropbox_base_path: dropboxBasePath,
  });
}
