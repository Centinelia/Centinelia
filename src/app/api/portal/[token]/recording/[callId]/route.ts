import { NextRequest, NextResponse } from 'next/server';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

// Proxy de audio hacia Vapi. Antes guardábamos recording_url directo (S3
// pre-firmada) pero Vapi cambió el modelo y ahora las URLs expiran rápido
// (o requieren pedir una fresca vía GET /call/{id}/recording con la private
// key). Este route: (1) verifica que el portal token tiene acceso a la
// llamada, (2) pide una URL firmada fresca a Vapi, (3) redirige al cliente.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; callId: string }> },
) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, callId } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // La llamada debe pertenecer a alguno de los agentes accesibles por este portal.
  const { data: call } = await createAdminClient()
    .from('voice_calls')
    .select('id, agent_id, vapi_call_id')
    .eq('id', callId)
    .in('agent_id', access.ids)
    .maybeSingle();

  if (!call?.vapi_call_id)
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return NextResponse.json({ error: 'Vapi not configured' }, { status: 500 });

  // Vapi devuelve el objeto call completo con artifact.recordingUrl fresco.
  const vapiRes = await fetch(`https://api.vapi.ai/call/${call.vapi_call_id}`, {
    headers: { Authorization: `Bearer ${vapiKey}` },
  });

  if (!vapiRes.ok) {
    const text = await vapiRes.text().catch(() => '');
    return NextResponse.json(
      { error: 'Vapi fetch failed', status: vapiRes.status, detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  const data = await vapiRes.json() as {
    artifact?: { recordingUrl?: string; stereoRecordingUrl?: string };
    recordingUrl?: string;
  };
  const url = data.artifact?.recordingUrl ?? data.recordingUrl ?? null;
  if (!url) return NextResponse.json({ error: 'Recording not available' }, { status: 404 });

  return NextResponse.redirect(url, { status: 302 });
}
