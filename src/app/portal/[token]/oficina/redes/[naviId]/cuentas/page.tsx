export const dynamic = 'force-dynamic';

/**
 * Cuentas — /portal/[token]/oficina/redes/[naviId]/cuentas
 *
 * Portfolio CRUD de cuentas IG gestionadas por el Navi Agencia.
 *   - Lista todas las cuentas (activas, pausadas, desconectadas)
 *   - Botón "Agregar cuenta IG" inicia OAuth Meta
 *   - Botón eliminar hace soft delete (status='disconnected')
 *
 * Seguridad: verifySession + resolveOrgFromToken + IDOR (R72).
 * Feature gate: social_publishing.enabled (R75).
 */
import { cookies }                      from 'next/headers';
import { redirect, notFound }           from 'next/navigation';
import Link                             from 'next/link';
import { AtSign, Plus, Share2 }         from 'lucide-react';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken }          from '@/lib/portal/org-token';
import { socialPublishingEnabled }      from '@/lib/feature-flags/social-publishing';
import { createAdminClient }            from '@/lib/supabase/admin';
import OficinaPageHero                  from '../../../OficinaPageHero';
import AccountsGrid                     from './AccountsGrid';

interface Props { params: Promise<{ token: string; naviId: string }> }

interface SocialAccountRow {
  id:                string;
  external_username: string | null;
  status:            string;
  paused:            boolean;
  paused_reason?:    string | null;
  created_at:        string;
}

export default async function CuentasPage({ params }: Props) {
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

  // IDOR: verificar que el agente pertenece a esta org
  const { data: navi } = await supabase
    .from('voice_agents')
    .select('id, agent_name, role, portal_email')
    .eq('id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle() as { data: { id: string; agent_name: string | null; role: string; portal_email: string } | null };

  if (!navi) notFound();

  // Cargar todas las cuentas (incluyendo desconectadas para historial)
  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('id, external_username, status, paused, paused_reason, created_at')
    .eq('agent_id', naviId)
    .eq('portal_email', resolved.portalEmail)
    .order('created_at', { ascending: true }) as { data: SocialAccountRow[] | null };

  const connectUrl = `/api/portal/${token}/social/accounts/connect?provider=meta&agentId=${naviId}`;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <OficinaPageHero
        icon={Share2}
        eyebrow="Navi Agencia"
        title="Portfolio de cuentas"
        description={`Cuentas de Instagram gestionadas por ${navi.agent_name ?? 'Navi Agencia'}.`}
        right={
          <Link
            href={`/portal/${token}/oficina/redes/${naviId}`}
            className="text-[12px] font-medium"
            style={{ color: '#6C3BFF' }}
          >
            Volver al dashboard
          </Link>
        }
      />

      {/* Botón agregar cuenta */}
      <div className="flex items-center justify-between">
        <p className="text-[13px]" style={{ color: '#6B6480' }}>
          {(accounts ?? []).filter(a => a.status !== 'disconnected').length} cuentas activas
        </p>
        <a
          href={connectUrl}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-opacity"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          <Plus size={14} />
          Agregar cuenta IG
        </a>
      </div>

      <AccountsGrid
        token={token}
        naviId={naviId}
        initialAccounts={accounts ?? []}
        connectUrl={connectUrl}
      />
    </div>
  );
}
