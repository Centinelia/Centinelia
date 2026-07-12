import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gmailSearchDriveFiles, gmailRefreshToken } from '@/lib/email/gmail';
import { outlookSearchFiles, outlookRefreshToken } from '@/lib/email/outlook';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agent_id = searchParams.get('agent_id');
  if (!agent_id) return NextResponse.json({ result: 'Error: agent_id requerido' });

  const body = await req.json();
  const args = body.toolCallList?.[0]?.function?.arguments ?? body;
  const { busqueda } = args as { busqueda: string };

  if (!busqueda) return NextResponse.json({ result: 'Necesito que me indiques qué archivo buscar.' });

  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('email_integrations')
    .select('*')
    .eq('agent_id', agent_id)
    .single();

  if (!integration) {
    return NextResponse.json({ result: 'No tienes Google Drive ni OneDrive conectado. Conecta tu correo desde la Oficina.' });
  }

  let accessToken = integration.access_token as string;
  const expiresAt = integration.token_expires_at ? new Date(integration.token_expires_at as string) : null;
  if (!expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    try {
      const refreshed = integration.provider === 'gmail'
        ? await gmailRefreshToken(integration.refresh_token as string)
        : await outlookRefreshToken(integration.refresh_token as string);
      accessToken = refreshed.access_token;
      await supabase.from('email_integrations').update({
        access_token:     refreshed.access_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      }).eq('id', integration.id);
    } catch { /* use existing token */ }
  }

  try {
    const files = integration.provider === 'gmail'
      ? await gmailSearchDriveFiles(accessToken, busqueda)
      : await outlookSearchFiles(accessToken, busqueda);

    if (!files.length) {
      return NextResponse.json({ result: `No encontré archivos que coincidan con "${busqueda}".` });
    }

    const top  = files.slice(0, 5);
    const list = top.map(f => `${f.name} (ID: ${f.id})`).join(', ');
    return NextResponse.json({
      result: `Encontré ${files.length} archivo(s) relacionado(s) con "${busqueda}": ${list}.${top.length > 1 ? ' ¿Cuál necesitas?' : ''}`,
    });
  } catch (err) {
    return NextResponse.json({ result: `Error al buscar archivos: ${String(err)}` });
  }
}
