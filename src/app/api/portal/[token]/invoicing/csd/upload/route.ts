import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentByToken } from '@/lib/portal/org-token';
import { parseCsd, putCsd, encryptString } from '@/lib/invoicing/csd-vault';
import { assertInvoicingEnabled } from '@/lib/invoicing/kill-switch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  assertInvoicingEnabled();
  const { token } = await ctx.params;
  const agent = await getAgentByToken<{ portal_email: string }>(token, 'portal_email');
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData();
  const cerFile = form.get('cer') as File | null;
  const keyFile = form.get('key') as File | null;
  const password = form.get('password') as string | null;
  if (!cerFile || !keyFile || !password) return NextResponse.json({ error: 'Faltan cer, key o password' }, { status: 400 });

  const cerBuf = Buffer.from(await cerFile.arrayBuffer());
  const keyBuf = Buffer.from(await keyFile.arrayBuffer());

  let parsed;
  try {
    parsed = parseCsd(cerBuf, keyBuf, password);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: org } = await supabase.from('organizations')
    .select('invoicing_rfc_emisor, invoicing_csd_version')
    .eq('portal_email', agent.portal_email)
    .single();
  if (org?.invoicing_rfc_emisor && org.invoicing_rfc_emisor.toUpperCase() !== parsed.rfc.toUpperCase()) {
    return NextResponse.json({
      error: `RFC del CSD (${parsed.rfc}) no coincide con RFC emisor de la org (${org.invoicing_rfc_emisor})`,
    }, { status: 400 });
  }

  const version = (org?.invoicing_csd_version ?? 0) + 1;
  let cerPath: string, keyPath: string;
  try {
    ({ cerPath, keyPath } = await putCsd(agent.portal_email, cerBuf, keyBuf, version, supabase));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { error: updateError } = await supabase.from('organizations').update({
    invoicing_csd_cer_path: cerPath,
    invoicing_csd_key_path: keyPath,
    invoicing_csd_password_encrypted: encryptString(password),
    invoicing_csd_version: version,
    invoicing_csd_expires_at: parsed.notAfter.toISOString(),
    invoicing_csd_no_certificado: parsed.noCertificado,
    invoicing_rfc_emisor: parsed.rfc,
  }).eq('portal_email', agent.portal_email);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           agent.portal_email,
    endpoint:              '/api/portal/[token]/invoicing/csd/upload',
    method:                'POST',
    affected_portal_email: agent.portal_email,
    query_type:            'modify',
    filters:               { version, no_certificado: parsed.noCertificado, expires_at: parsed.notAfter.toISOString() },
  });

  return NextResponse.json({
    ok: true, version, rfc: parsed.rfc,
    no_certificado: parsed.noCertificado,
    expires_at: parsed.notAfter.toISOString(),
  });
}
