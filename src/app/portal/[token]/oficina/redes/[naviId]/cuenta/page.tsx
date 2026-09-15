export const dynamic = 'force-dynamic';

/**
 * Cuenta — /portal/[token]/oficina/redes/[naviId]/cuenta
 *
 * Muestra la cuenta de Instagram conectada a Navi:
 *   - Username, estado del token (activo / caducado / sin cuenta)
 *   - Fecha de expiración del token
 *   - Botón "Reconectar Instagram" que inicia el OAuth Meta
 *
 * El OAuth initiator es GET /api/portal/[token]/social/accounts/connect?provider=meta&agentId=X
 * (redirige directo al consent screen de Meta).
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import Link                             from 'next/link';
import { AtSign, CheckCircle2, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';

interface Props { params: Promise<{ token: string; naviId: string }> }

interface SocialAccount {
  id:                  string;
  provider:            string;
  external_username:   string | null;
  page_id:             string | null;
  status:              string;
  paused:              boolean;
  paused_reason?:      string | null;
  expires_at?:         string | null;
  created_at:          string;
}

export default async function CuentaPage({ params }: Props) {
  const { token, naviId } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) notFound();

  if (session?.portalEmail && session.portalEmail !== resolved.portalEmail) {
    redirect('/portal/login');
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!socialPublishingEnabled(org?.features)) {
    redirect(`/portal/${token}/oficina?tab=redes-disabled`);
  }

  // IDOR check
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  if (!navi) notFound();

  // Obtener cuenta de Instagram
  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, provider, external_username, page_id, status, paused, paused_reason, expires_at, created_at')
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .eq('provider', 'meta_instagram')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: SocialAccount | null };

  const connectUrl = `/api/portal/${token}/social/accounts/connect?provider=meta&agentId=${naviId}`;

  const isActive     = account?.status === 'active';
  const needsReauth  = account?.status === 'needs_reauth';
  const expiresAt    = account?.expires_at ? new Date(account.expires_at) : null;
  const daysLeft     = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
    : null;
  const nearExpiry   = daysLeft !== null && daysLeft <= 7;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <OficinaPageHero
        icon={AtSign}
        eyebrow="Gestor de redes"
        title="Cuenta de Instagram"
        description={`Conexión y estado del acceso de ${navi.agent_name ?? 'Navi'} a Instagram.`}
      />

      {/* Estado de conexión */}
      <div
        className="rounded-2xl p-5 flex flex-col gap-4"
        style={{ background: '#fff', border: '1px solid #E8E3F5' }}
      >
        {!account && (
          <>
            <div className="flex items-center gap-3">
              <XCircle size={20} style={{ color: '#6B6480' }} />
              <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
                Sin cuenta conectada
              </p>
            </div>
            <p className="text-[13px]" style={{ color: '#6B6480' }}>
              Conecta Instagram para que Navi pueda publicar y responder comentarios.
            </p>
            <a
              href={connectUrl}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold self-start transition-opacity"
              style={{ background: '#6C3BFF', color: '#fff' }}
            >
              <RefreshCw size={14} />
              Conectar Instagram
            </a>
          </>
        )}

        {account && (
          <>
            {/* Username + estado */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.2)' }}
                >
                  <AtSign size={18} style={{ color: '#6C3BFF' }} strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>
                    {account.external_username ? `@${account.external_username}` : 'Cuenta conectada'}
                  </p>
                  {account.page_id && (
                    <p className="text-[11px]" style={{ color: '#6B6480' }}>
                      ID: {account.page_id}
                    </p>
                  )}
                </div>
              </div>
              <span
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full flex-shrink-0"
                style={{
                  background: isActive && !needsReauth ? '#F0FDF4' : '#FEF2F2',
                  color:      isActive && !needsReauth ? '#15803D'  : '#B91C1C',
                  border:     isActive && !needsReauth ? '1px solid #BBF7D0' : '1px solid #FECACA',
                }}
              >
                {needsReauth ? 'Token vencido' : isActive ? 'Activa' : account.status}
              </span>
            </div>

            {/* Estado del token */}
            <div
              className="rounded-lg p-3 flex items-start gap-2"
              style={{
                background: needsReauth || nearExpiry ? '#FEF9C3' : '#F0FDF4',
                border:     needsReauth || nearExpiry ? '1px solid #FDE047' : '1px solid #BBF7D0',
              }}
            >
              {needsReauth || nearExpiry
                ? <AlertCircle size={14} style={{ color: '#A16207', flexShrink: 0, marginTop: 1 }} />
                : <CheckCircle2 size={14} style={{ color: '#15803D', flexShrink: 0, marginTop: 1 }} />
              }
              <div>
                <p className="text-[12px] font-medium" style={{ color: '#1A0A3B' }}>
                  {needsReauth
                    ? 'El acceso de Instagram ha caducado'
                    : nearExpiry
                    ? `El acceso vence en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`
                    : 'Acceso de Instagram vigente'
                  }
                </p>
                {expiresAt && !needsReauth && (
                  <p className="text-[11px] mt-0.5" style={{ color: '#6B6480' }}>
                    Vence el {new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(expiresAt)}
                  </p>
                )}
              </div>
            </div>

            {/* Pausa info */}
            {account.paused && (
              <div
                className="rounded-lg p-3 flex items-start gap-2"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
              >
                <AlertCircle size={14} style={{ color: '#B91C1C', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-[12px] font-medium" style={{ color: '#1A0A3B' }}>
                    Publicaciones pausadas
                  </p>
                  {account.paused_reason && (
                    <p className="text-[11px] mt-0.5" style={{ color: '#6B6480' }}>
                      Motivo: {account.paused_reason}
                    </p>
                  )}
                  <Link
                    href={`/portal/${token}/oficina/redes/${naviId}`}
                    className="text-[11px] font-medium underline mt-0.5 inline-block"
                    style={{ color: '#6C3BFF' }}
                  >
                    Reactivar desde el dashboard
                  </Link>
                </div>
              </div>
            )}

            {/* Botón de reconexión */}
            <div className="flex items-center gap-3 pt-1">
              <a
                href={connectUrl}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-opacity"
                style={{
                  background: needsReauth ? '#6C3BFF' : '#F3F0FF',
                  color:      needsReauth ? '#fff'     : '#6C3BFF',
                  border:     needsReauth ? 'none'     : '1px solid rgba(108,59,255,0.25)',
                }}
              >
                <RefreshCw size={13} />
                {needsReauth ? 'Reconectar Instagram' : 'Renovar acceso'}
              </a>
              <p className="text-[11px]" style={{ color: '#6B6480' }}>
                Serás redirigido a Instagram para autorizar el acceso.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
