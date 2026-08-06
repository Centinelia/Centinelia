// TEMPORAL: dump el raw payload de un Gmail message para debug attachment detection.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'dev only' }, { status: 403 });
  const agentId = req.nextUrl.searchParams.get('agent_id');
  const msgId   = req.nextUrl.searchParams.get('msg_id');
  if (!agentId || !msgId) return NextResponse.json({ error: 'missing params' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: ei } = await supabase.from('email_integrations').select('access_token').eq('agent_id', agentId).maybeSingle();
  const token = ei?.access_token ?? '';

  const res = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();

  // Extract structure summary
  function summarize(payload: Record<string, unknown> | undefined, depth = 0): unknown {
    if (!payload) return null;
    const body = payload.body as { attachmentId?: string; size?: number } | undefined;
    return {
      mimeType:    payload.mimeType,
      filename:    payload.filename,
      partId:      payload.partId,
      bodySize:    body?.size,
      hasAttachId: !!body?.attachmentId,
      attachmentIdPreview: body?.attachmentId ? String(body.attachmentId).slice(0, 30) + '...' : null,
      children:    ((payload.parts as Record<string, unknown>[] | undefined) ?? []).map((p) => summarize(p, depth + 1)),
    };
  }

  return NextResponse.json({
    ok:            res.ok,
    status:        res.status,
    threadId:      json.threadId,
    payloadSummary: summarize(json.payload),
  });
}
