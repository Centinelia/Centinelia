import { NextRequest, NextResponse } from 'next/server';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { signRecordingUrl } from '@/lib/vapi/recordings';

// Sirve el audio de una llamada al portal cliente. Verificaciones:
// 1. Sesión válida.
// 2. El portal token tiene acceso a la llamada (agent_id in access.ids).
// 3. Match portalEmail cuando la sesión trae uno.
//
// Preferencia de origen del mp3:
// 1. Bucket propio call-recordings (populated por el webhook post-llamada).
// 2. Fallback: signed URL fresca de Vapi (para llamadas viejas sin path).
// Vapi retiene su S3 pocos días; storage propio garantiza 90d de historial.
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

  const supabase = createAdminClient();
  const { data: call } = await supabase
    .from('voice_calls')
    .select('id, agent_id, vapi_call_id, recording_storage_path')
    .eq('id', callId)
    .in('agent_id', access.ids)
    .maybeSingle();

  if (!call) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

  const storagePath = (call as { recording_storage_path?: string | null }).recording_storage_path ?? null;
  if (storagePath) {
    const signed = await signRecordingUrl(supabase, storagePath);
    if (signed) return NextResponse.redirect(signed, { status: 302 });
  }

  const vapiCallId = (call as { vapi_call_id?: string | null }).vapi_call_id ?? null;
  if (!vapiCallId)
    return NextResponse.json({ error: 'Recording not available' }, { status: 404 });

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return NextResponse.json({ error: 'Vapi not configured' }, { status: 500 });

  // Vapi devuelve el objeto call completo con artifact.recordingUrl fresco.
  const vapiRes = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
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
