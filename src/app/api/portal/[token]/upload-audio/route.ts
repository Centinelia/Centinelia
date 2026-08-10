import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

// Returns a presigned upload URL so the browser can upload directly to Supabase Storage.
// This bypasses the Next.js request body size limit entirely — no cap on audio file size.
export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const acct = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(token, 'id, portal_email', supabase);
  if (!acct) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && acct.portal_email && auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { ext } = await req.json();
  const safExt  = (ext ?? 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'mp4';
  const path    = `meetings/${acct.id}/${Date.now()}.${safExt}`;

  const { data, error } = await supabase.storage
    .from('agent-files')
    .createSignedUploadUrl(path);

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Error' }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('agent-files').getPublicUrl(path);

  return NextResponse.json({ signedUrl: data.signedUrl, path, publicUrl });
}
