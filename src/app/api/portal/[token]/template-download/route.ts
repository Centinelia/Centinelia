import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

/**
 * Signed URL for the user's uploaded plantilla file so they can preview/download
 * their own Word template. The path is scoped to plantillas/<their-agent-id>/ so
 * they can only fetch their own files.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token }    = await params;
  const rawPath      = req.nextUrl.searchParams.get('path') ?? '';
  if (!rawPath.startsWith('plantillas/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

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

  // Ensure path is scoped to this agent (or an agent belonging to the same portal_email)
  const { data: siblings } = agent.portal_email
    ? await supabase.from('voice_agents').select('id').eq('portal_email', agent.portal_email)
    : { data: [{ id: agent.id }] };
  const allowedPrefixes = (siblings ?? [{ id: agent.id }]).map(a => `plantillas/${a.id}/`);
  if (!allowedPrefixes.some(p => rawPath.startsWith(p))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: signed, error } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(rawPath, 3600);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not sign' }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
