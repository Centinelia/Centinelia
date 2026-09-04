import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { encrypt, decrypt } from '@/lib/crypto';
import { verifySmtpCreds, verifyImapCreds, sendViaSmtp } from '@/lib/connectors/imap-smtp';

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
  tls_insecure: boolean;
  imap_host:    string | null;
  imap_port:    number | null;
  imap_configured: boolean;
}

interface SmtpConfigJson {
  host:         string;
  port:         number;
  secure:       boolean;
  username:     string;
  password_enc: string;   // encrypted
  from_display: string | null;
  status:       'active' | 'error';
  updated_at:   string;
  tls_insecure: boolean;
  imap_host?:   string;
  imap_port?:   number;
}

async function requireAgent(req: NextRequest, token: string) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  if (session.portalEmail && session.portalEmail !== resolved.portalEmail)
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 403 }) };

  const agentId = req.nextUrl.searchParams.get('agent_id');
  if (!agentId) return { error: NextResponse.json({ error: 'Falta agent_id' }, { status: 400 }) };

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features')
    .eq('id', agentId)
    .maybeSingle();
  if (!agent) return { error: NextResponse.json({ error: 'Agent not found' }, { status: 404 }) };
  if ((agent as { portal_email: string | null }).portal_email !== resolved.portalEmail)
    return { error: NextResponse.json({ error: 'Agent no pertenece al org' }, { status: 403 }) };

  return {
    portalEmail: resolved.portalEmail,
    agent:       agent as { id: string; portal_email: string; features: Record<string, unknown> | null },
    supabase,
  };
}

function readSmtp(agent: { features: Record<string, unknown> | null }): SmtpConfigJson | null {
  const features = agent.features ?? {};
  const smtp = features['smtp_config'] as Partial<SmtpConfigJson> | undefined;
  if (!smtp || !smtp.host || !smtp.username) return null;
  return {
    host:         smtp.host,
    port:         smtp.port ?? 465,
    secure:       smtp.secure !== false,
    username:     smtp.username,
    password_enc: smtp.password_enc ?? '',
    from_display: smtp.from_display ?? null,
    status:       (smtp.status as 'active' | 'error' | undefined) ?? 'active',
    updated_at:   smtp.updated_at ?? new Date().toISOString(),
    tls_insecure: smtp.tls_insecure === true,
    imap_host:    smtp.imap_host,
    imap_port:    smtp.imap_port,
  };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requireAgent(req, token);
  if (gate.error) return gate.error;

  const cfg = readSmtp(gate.agent!);
  const publicCfg: PublicConfig = cfg
    ? {
        configured:      true,
        host:            cfg.host,
        port:            cfg.port,
        secure:          cfg.secure,
        username:        cfg.username,
        from_display:    cfg.from_display,
        status:          cfg.status,
        tls_insecure:    cfg.tls_insecure,
        imap_host:       cfg.imap_host ?? null,
        imap_port:       cfg.imap_port ?? null,
        imap_configured: Boolean(cfg.imap_host),
      }
    : {
        configured:      false,
        host:            null,
        port:            null,
        secure:          true,
        username:        null,
        from_display:    null,
        status:          null,
        tls_insecure:    false,
        imap_host:       null,
        imap_port:       null,
        imap_configured: false,
      };
  return NextResponse.json(publicCfg);
}

interface SaveBody {
  host:         string;
  port:         number;
  secure:       boolean;
  username:     string;
  password:     string;
  from_display?: string;
  send_test?:   boolean;
  tls_insecure?: boolean;
  imap_host?:   string;
  imap_port?:   number;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requireAgent(req, token);
  if (gate.error) return gate.error;

  const body = (await req.json()) as Partial<SaveBody>;
  const host        = (body.host        ?? '').trim();
  const port        = Number(body.port ?? 465);
  const secure      = body.secure !== false;
  const username    = (body.username    ?? '').trim();
  const passwordIn  = (body.password    ?? '').trim();
  const fromDisplay = (body.from_display ?? '').trim() || undefined;
  const sendTest    = body.send_test !== false;
  const tlsInsecure = body.tls_insecure === true;
  const imapHost    = (body.imap_host ?? '').trim() || undefined;
  const imapPort    = body.imap_port ? Number(body.imap_port) : undefined;

  // Password puede venir vacío en edición: si ya hay cfg guardada, reusar
  // el password_enc existente en lugar de forzar re-ingreso. El UI muestra
  // placeholder "deja vacío para conservar" así que el usuario espera esto.
  const existingCfg = readSmtp(gate.agent!);
  let password: string;
  let passwordEnc: string;
  if (passwordIn) {
    password    = passwordIn;
    passwordEnc = encrypt(passwordIn);
  } else if (existingCfg?.password_enc) {
    password    = decrypt(existingCfg.password_enc);
    passwordEnc = existingCfg.password_enc;
  } else {
    return NextResponse.json({ error: 'Falta password (primera configuración requiere ingresarla).' }, { status: 400 });
  }

  if (!host || !username || !port) {
    return NextResponse.json({ error: 'Faltan campos: host, port, username son obligatorios.' }, { status: 400 });
  }

  try {
    await verifySmtpCreds({ host, port, secure, username, password, tlsInsecure });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Detectar cert mismatch específicamente y sugerir el toggle en el error
    const hint = /altnames|certificate|cert|self.?signed/i.test(msg) && !tlsInsecure
      ? ' — parece un problema del certificado TLS. Marca "Ignorar validación de certificado" e intenta de nuevo (común en Telmex/Prodigy hospedado por CarrierZone).'
      : '';
    return NextResponse.json({ error: `No pude autenticar contra ${host}:${port}. ${msg}${hint}` }, { status: 400 });
  }

  if (imapHost) {
    try {
      await verifyImapCreds({ host, port, secure, username, password, tlsInsecure, imapHost, imapPort });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `SMTP OK pero IMAP falló contra ${imapHost}:${imapPort ?? 993}. ${msg}` }, { status: 400 });
    }
  }

  if (sendTest) {
    try {
      await sendViaSmtp(
        { host, port, secure, username, password, fromDisplay, tlsInsecure },
        username,
        'Centinelia — Correo de prueba del portal',
        'Este es un correo de prueba enviado desde el portal de Centinelia para confirmar que tu servidor SMTP está configurado correctamente. Si lo recibes, tu empleado ya puede enviar correos desde este buzón.',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Autenticación OK pero el envío de prueba falló. ${msg}` }, { status: 400 });
    }
  }

  const nextSmtp: SmtpConfigJson = {
    host, port, secure, username,
    password_enc: passwordEnc,
    from_display: fromDisplay ?? null,
    status:       'active',
    updated_at:   new Date().toISOString(),
    tls_insecure: tlsInsecure,
    ...(imapHost ? { imap_host: imapHost, imap_port: imapPort ?? 993 } : {}),
  };
  const nextFeatures = { ...(gate.agent!.features ?? {}), smtp_config: nextSmtp };
  const { error } = await gate.supabase!
    .from('voice_agents')
    .update({ features: nextFeatures })
    .eq('id', gate.agent!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, test_sent: sendTest });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const gate = await requireAgent(req, token);
  if (gate.error) return gate.error;

  const nextFeatures = { ...(gate.agent!.features ?? {}) };
  delete (nextFeatures as Record<string, unknown>)['smtp_config'];
  const { error } = await gate.supabase!
    .from('voice_agents')
    .update({ features: nextFeatures })
    .eq('id', gate.agent!.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
