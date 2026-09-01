import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { encrypt } from '@/lib/crypto';
import { verifySmtpCreds, sendViaSmtp } from '@/lib/connectors/imap-smtp';

interface Params { params: Promise<{ token: string }> }

/** Config visible al portal — sin exponer nunca la contraseña. */
interface PublicConfig {
  configured:   boolean;
  host:         string | null;
  port:         number | null;
  secure:       boolean;
  username:     string | null;
  from_display: string | null;
  status:       'active' | 'error' | null;
}

async function requireOrg(token: string) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  if (session.portalEmail && session.portalEmail !== resolved.portalEmail)
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };
  return { portalEmail: resolved.portalEmail };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requireOrg(token);
  if (gate.error) return gate.error;

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from('integration_accounts')
    .select('account_label, metadata, status')
    .eq('portal_email', gate.portalEmail!)
    .eq('capability', 'email')
    .eq('provider', 'imap_smtp')
    .maybeSingle();

  const meta = (row?.metadata as Record<string, unknown> | null) ?? {};
  const config: PublicConfig = {
    configured:   !!row,
    host:         (meta.host as string | undefined) ?? null,
    port:         (meta.port as number | undefined) ?? null,
    secure:       (meta.secure as boolean | undefined) ?? true,
    username:     (row?.account_label as string | null) ?? null,
    from_display: (meta.from_display as string | undefined) ?? null,
    status:       (row?.status as 'active' | 'error' | null) ?? null,
  };
  return NextResponse.json(config);
}

interface SaveBody {
  host:         string;
  port:         number;
  secure:       boolean;
  username:     string;
  password:     string;
  from_display?: string;
  /** Si true, además de guardar manda un correo de prueba al mismo username
   *  (self-test) para confirmar delivery end-to-end. */
  send_test?:   boolean;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requireOrg(token);
  if (gate.error) return gate.error;

  const body = (await req.json()) as Partial<SaveBody>;
  const host        = (body.host        ?? '').trim();
  const port        = Number(body.port ?? 465);
  const secure      = body.secure !== false;
  const username    = (body.username    ?? '').trim();
  const password    = (body.password    ?? '').trim();
  const fromDisplay = (body.from_display ?? '').trim() || undefined;
  const sendTest    = body.send_test !== false;

  if (!host || !username || !password || !port) {
    return NextResponse.json({ error: 'Faltan campos: host, port, username, password son obligatorios.' }, { status: 400 });
  }

  // 1. Verificar creds — si falla, no guardamos nada.
  try {
    await verifySmtpCreds({ host, port, secure, username, password });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No pude autenticar contra ${host}:${port}. ${msg}` }, { status: 400 });
  }

  // 2. (Opcional) mandar correo de prueba al mismo username para probar
  //    delivery end-to-end. Muchos SMTP servers aceptan autenticación pero
  //    rechazan silenciosamente el send (rate limit, spam filter interno).
  if (sendTest) {
    try {
      await sendViaSmtp(
        { host, port, secure, username, password, fromDisplay },
        username,
        'Centinelia — Correo de prueba del portal',
        'Este es un correo de prueba enviado desde el portal de Centinelia para confirmar que tu servidor SMTP está configurado correctamente. Si lo recibes, tus empleados digitales ya pueden enviar correos desde este buzón.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Autenticación OK pero el envío de prueba falló. ${msg}` }, { status: 400 });
    }
  }

  // 3. Persistir. Password encriptada en access_token, host/port/secure en metadata.
  const supabase = createAdminClient();
  const encryptedPass = encrypt(password);
  const metadata = { host, port, secure, username, from_display: fromDisplay ?? null };

  // Upsert manual: buscar existente por (portal_email, capability, provider) y
  // reemplazar. onConflict directo no aplica porque no hay unique constraint
  // en esa tupla.
  const { data: existing } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('portal_email', gate.portalEmail!)
    .eq('capability', 'email')
    .eq('provider', 'imap_smtp')
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('integration_accounts')
      .update({
        account_label: username,
        access_token:  encryptedPass,
        metadata,
        status:        'active',
      })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('integration_accounts').insert({
      portal_email:  gate.portalEmail!,
      provider:      'imap_smtp',
      capability:    'email',
      account_label: username,
      access_token:  encryptedPass,
      metadata,
      status:        'active',
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, test_sent: sendTest });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requireOrg(token);
  if (gate.error) return gate.error;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('integration_accounts')
    .delete()
    .eq('portal_email', gate.portalEmail!)
    .eq('capability', 'email')
    .eq('provider', 'imap_smtp');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
