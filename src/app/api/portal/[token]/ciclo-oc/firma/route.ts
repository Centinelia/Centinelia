import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED  = new Set(['image/png', 'image/jpeg', 'image/jpg']);

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.isSubUser) return NextResponse.json({ error: 'only_owner' }, { status: 403 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('firma') as File | null;
  if (!file)                          return NextResponse.json({ error: 'Falta archivo `firma`.' },         { status: 400 });
  if (!ACCEPTED.has(file.type))       return NextResponse.json({ error: 'Solo PNG o JPG.' },                { status: 400 });
  if (file.size > MAX_BYTES)          return NextResponse.json({ error: 'La imagen excede 2 MB.' },         { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `${resolved.portalEmail}/firma.${ext}`;

  const supabase = createAdminClient();
  const up = await supabase.storage.from('cfdi').upload(path, buf, {
    contentType: file.type, upsert: true,
  });
  if (up.error) return NextResponse.json({ error: `Storage upload: ${up.error.message}` }, { status: 500 });

  const { error } = await supabase.from('organizations')
    .update({ ciclo_oc_firma_path: path })
    .eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, path, size_kb: Math.round(buf.length / 1024) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.isSubUser) return NextResponse.json({ error: 'only_owner' }, { status: 403 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { data } = await supabase.from('organizations')
    .select('ciclo_oc_firma_path')
    .eq('portal_email', resolved.portalEmail)
    .single();

  if (data?.ciclo_oc_firma_path) {
    await supabase.storage.from('cfdi').remove([data.ciclo_oc_firma_path]);
  }

  await supabase.from('organizations')
    .update({ ciclo_oc_firma_path: null })
    .eq('portal_email', resolved.portalEmail);

  return NextResponse.json({ ok: true });
}
