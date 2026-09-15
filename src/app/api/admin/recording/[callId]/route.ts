import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { signRecordingUrl } from '@/lib/vapi/recordings';

// Sirve el audio de una llamada. Preferencia:
//   1. Bucket propio call-recordings (populated por el webhook end-of-call-report).
//   2. Fallback: pedir signed URL fresca a Vapi (para llamadas viejas sin path).
// Vapi retiene su S3 poco tiempo, por eso preferimos storage propio (90d).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> },
) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { callId } = await params;
  const supabase = createAdminClient();
  const { data: call } = await supabase
    .from('voice_calls')
    .select('id, vapi_call_id, recording_storage_path')
    .eq('id', callId)
    .maybeSingle();

  if (!call) return NextResponse.json({ error: 'Not Found' }, { status: 404 });

  const storagePath = (call as { recording_storage_path?: string | null }).recording_storage_path ?? null;
  if (storagePath) {
    const signed = await signRecordingUrl(supabase, storagePath);
    if (signed) return NextResponse.redirect(signed, { status: 302 });
    // Signed falló (objeto borrado por cleanup, TTL de bucket, etc.) — sigue al fallback.
  }

  const vapiCallId = (call as { vapi_call_id?: string | null }).vapi_call_id ?? null;
  if (!vapiCallId)
    return NextResponse.json({ error: 'Recording not available' }, { status: 404 });

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return NextResponse.json({ error: 'Vapi not configured' }, { status: 500 });

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
