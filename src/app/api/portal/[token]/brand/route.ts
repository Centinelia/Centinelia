import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!agent?.portal_email) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as {
    email_brand_color?:    string;
    email_footer_text?:    string;
    brand_website?:        string;
    brand_address?:        string;
    brand_color_secondary?: string;
  };

  const patch: Record<string, string | null> = {};
  if ('email_brand_color'    in body) patch.email_brand_color    = body.email_brand_color    ?? null;
  if ('email_footer_text'    in body) patch.email_footer_text    = body.email_footer_text    ?? null;
  if ('brand_website'        in body) patch.brand_website        = body.brand_website        ?? null;
  if ('brand_address'        in body) patch.brand_address        = body.brand_address        ?? null;
  if ('brand_color_secondary' in body) patch.brand_color_secondary = body.brand_color_secondary ?? null;

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  await supabase.from('voice_agents').update(patch).eq('portal_email', agent.portal_email);

  return NextResponse.json({ ok: true });
}
