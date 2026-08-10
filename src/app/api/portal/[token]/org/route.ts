export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { isValidE164 } from '@/lib/billing/fallback-validate';

interface Params { params: Promise<{ token: string }> }

async function resolvePortalEmail(token: string) {
  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);
  return { supabase, portalEmail: agent?.portal_email ?? null };
}

// GET — return org settings (name, plan, logo_url)
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, portalEmail } = await resolvePortalEmail(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: org } = await supabase
    .from('organizations')
    .select('name, plan, logo_url, multilingual, created_at')
    .eq('portal_email', portalEmail)
    .single();

  return NextResponse.json({ org: org ?? null });
}

// PATCH — update org name, logo_url, multilingual, or fallback_phone_number
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    logo_url?: string;
    multilingual?: boolean;
    fallback_phone_number?: string | null;
  };
  const patch: Record<string, unknown> = {};
  if (typeof body.name         === 'string')  patch.name         = body.name.trim().slice(0, 100);
  if (typeof body.logo_url     === 'string')  patch.logo_url     = body.logo_url;
  if (typeof body.multilingual === 'boolean') patch.multilingual = body.multilingual;
  if ('fallback_phone_number' in body) {
    const fpn = body.fallback_phone_number;
    if (fpn !== null && !isValidE164(fpn)) {
      return NextResponse.json({ error: 'Formato inválido. Usa E.164, por ejemplo +528112345678.' }, { status: 400 });
    }
    patch.fallback_phone_number = fpn ?? null;
  }
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { supabase, portalEmail } = await resolvePortalEmail(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await supabase
    .from('organizations')
    .upsert({ portal_email: portalEmail, ...patch }, { onConflict: 'portal_email' });

  return NextResponse.json({ ok: true });
}
