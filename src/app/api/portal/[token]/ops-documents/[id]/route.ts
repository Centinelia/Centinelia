import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string; id: string }> }

// GET — generate fresh signed URL + reset 30-day TTL
export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email')
    .eq('portal_token', token)
    .single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (agent.portal_email && auth.portalEmail && agent.portal_email !== auth.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const agentIds = (siblings ?? [{ id: agent.id }]).map(a => a.id as string);

  const { data: doc } = await supabase
    .from('ops_documents')
    .select('*')
    .eq('id', id)
    .in('agent_id', agentIds)
    .single();
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const { data: signed } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(doc.storage_path as string, 3600);

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download URL' }, { status: 500 });
  }

  // Reset TTL: now + 30 days
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('ops_documents').update({
    last_accessed_at: new Date().toISOString(),
    expires_at: newExpiry,
  }).eq('id', id);

  return NextResponse.json({ url: signed.signedUrl, filename: doc.filename });
}
