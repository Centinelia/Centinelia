import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { encryptString } from '@/lib/invoicing/csd-vault';
import { assertInvoicingEnabled } from '@/lib/invoicing/kill-switch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  assertInvoicingEnabled();

  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token } = await ctx.params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // IDOR guard
  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json();
  const { usuario, password, rfc_emisor, razon_social, regimen_fiscal, lugar_expedicion, test_mode } =
    body as Record<string, string | boolean>;

  // Validate required string fields
  for (const [k, v] of Object.entries({ usuario, password, rfc_emisor, razon_social, regimen_fiscal, lugar_expedicion })) {
    if (!v || typeof v !== 'string') return NextResponse.json({ error: `Falta ${k}` }, { status: 400 });
  }
  if (!/^\d{5}$/.test(lugar_expedicion as string))
    return NextResponse.json({ error: 'lugar_expedicion debe ser CP de 5 dígitos' }, { status: 400 });

  const supabase  = createAdminClient();
  const encCreds  = encryptString(JSON.stringify({ usuario, password }));

  const { error } = await supabase.from('organizations').update({
    invoicing_provider:               'solucion_factible',
    invoicing_credentials_encrypted:  encCreds,
    invoicing_rfc_emisor:             (rfc_emisor as string).toUpperCase(),
    invoicing_razon_social:           razon_social,
    invoicing_regimen_fiscal:         regimen_fiscal,
    invoicing_lugar_expedicion:       lugar_expedicion,
    invoicing_test_mode:              test_mode !== false, // default true
  }).eq('portal_email', resolved.portalEmail);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit log — best-effort
  void supabase.from('admin_access_log').insert({
    admin_email:           session.portalEmail,
    endpoint:              '/api/portal/[token]/invoicing/connect',
    method:                'POST',
    affected_portal_email: resolved.portalEmail,
    query_type:            'modify',
    filters:               { rfc_emisor: (rfc_emisor as string).toUpperCase(), test_mode: test_mode !== false },
  });

  return NextResponse.json({
    ok: true,
    message: 'Conectado. Sube el CSD para completar la configuración.',
  });
}
