import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// Proxy de audio hacia Vapi para vistas admin. Ver
// /api/portal/[token]/recording/[callId] para el racional (Vapi cambió a
// URLs firmadas de corta duración).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { callId } = await params;
  const { data: call } = await createAdminClient()
    .from('voice_calls')
    .select('id, vapi_call_id')
    .eq('id', callId)
    .maybeSingle();

  if (!call?.vapi_call_id)
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return NextResponse.json({ error: 'Vapi not configured' }, { status: 500 });

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
