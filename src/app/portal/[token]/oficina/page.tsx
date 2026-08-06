export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound }          from 'next/navigation';
import { cookies }           from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess }    from '@/lib/portal/agent-access';
import AttentionPanel        from './AttentionPanel';
import ActividadFeed         from './ActividadFeed';
import Link                  from 'next/link';
import { Inbox, ListChecks, PhoneCall, FileText, ArrowUpRight } from 'lucide-react';

interface Props { params: Promise<{ token: string }> }

function greeting(hour: number): string {
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Extrae solo el primer nombre de un nombre completo o email. */
function firstName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Si contiene @, tratar como email — tomar local part antes del @
  const base = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed;
  // Split por espacio (para 'Nazre Assad') o por . _ - (para emails)
  const first = base.split(/[\s._-]+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

interface KpiCardProps {
  label:  string;
  value:  number;
  icon:   React.ElementType;
  href:   string;
  accent: string;
  hint?:  string;
}

function KpiCard({ label, value, icon: Icon, href, accent, hint }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 rounded-2xl p-5 transition-all"
      style={{
        background: '#ffffff',
        border:     '1px solid #E8E3F5',
        boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${accent}14`, border: `1px solid ${accent}30` }}
        >
          <Icon size={16} style={{ color: accent }} strokeWidth={1.75} />
        </div>
        <ArrowUpRight
          size={14}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: '#6B6480' }}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#6B6480' }}>
          {label}
        </p>
        <p className="text-[28px] font-bold leading-none tabular-nums" style={{ color: '#1A0A3B' }}>
          {value.toLocaleString('es-MX')}
        </p>
        {hint && (
          <p className="text-[11px] mt-1" style={{ color: '#6B6480' }}>
            {hint}
          </p>
        )}
      </div>
    </Link>
  );
}

export default async function OficinaHome({ params }: Props) {
  const { token } = await params;

  const cookieStore = await cookies();
  const session     = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email, business_name, agent_name, client_name')
    .eq('portal_token', token)
    .maybeSingle();
  if (!agent) notFound();

  // Resolver nombre a mostrar en el greeting.
  //   Sub-usuario logueado → portal_users.name
  //   Owner               → voice_agents.client_name (nombre completo del registro)
  //   Fallback            → primer nombre extraído del portal_email
  //   Final               → 'Bienvenido'
  let displayName: string | null = null;
  if (session?.isSubUser && session.userId) {
    const { data: pu } = await supabase
      .from('portal_users')
      .select('name')
      .eq('id', session.userId)
      .maybeSingle();
    displayName = firstName((pu?.name as string | null) ?? null);
  } else {
    displayName = firstName((agent as any).client_name as string | null)
                ?? firstName((agent as any).portal_email as string | null);
  }
  const owner = displayName ?? 'Bienvenido';

  const access   = await getAgentAccess(token);
  const agentIds = access?.ids ?? [];

  const now = new Date();
  // Convertir a hora del negocio (default America/Monterrey UTC-6)
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Monterrey', hour: 'numeric', hour12: false }).format(now)
  );
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekAgo    = new Date(Date.now() - 7 * 86400000);

  // KPIs — 4 métricas del día
  const [bandejaRes, tareasRes, llamadasRes, docsRes] = agentIds.length > 0
    ? await Promise.all([
        supabase.from('ops_inbox')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .in('status', ['pending', 'escalated', 'info_requested']),
        supabase.from('agent_tasks')
          .select('id', { count: 'exact', head: true })
          .in('assigned_to', agentIds)
          .in('status', ['pending', 'running', 'awaiting_plan_approval']),
        supabase.from('voice_calls')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .gte('created_at', todayStart.toISOString()),
        supabase.from('ops_documents')
          .select('id', { count: 'exact', head: true })
          .in('agent_id', agentIds)
          .gte('created_at', weekAgo.toISOString())
          .then(r => r).catch(() => ({ count: 0 })),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const kpis = {
    bandeja:  bandejaRes?.count  ?? 0,
    tareas:   tareasRes?.count   ?? 0,
    llamadas: llamadasRes?.count ?? 0,
    docs:     docsRes?.count     ?? 0,
  };

  const totalAtender = kpis.bandeja + kpis.tareas;
  const dateLabel    = new Intl.DateTimeFormat('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(now);

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto w-full">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
          {dateLabel}
        </p>
        <h1 className="text-[32px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          {greeting(localHour)}, {owner}.
        </h1>
        <p className="text-[15px]" style={{ color: '#6B6480' }}>
          {totalAtender > 0
            ? <>Tu equipo tiene <strong style={{ color: '#1A0A3B' }}>{totalAtender}</strong> {totalAtender === 1 ? 'asunto' : 'asuntos'} que necesitan tu atención.</>
            : 'Tu equipo está al día. Aquí verás la actividad de la oficina.'}
        </p>
      </header>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Bandeja pendiente"
          value={kpis.bandeja}
          icon={Inbox}
          href={`/portal/${token}/oficina/bandeja`}
          accent="#6C3BFF"
          hint={kpis.bandeja === 0 ? 'Todo revisado' : 'Correos y solicitudes'}
        />
        <KpiCard
          label="Tareas activas"
          value={kpis.tareas}
          icon={ListChecks}
          href={`/portal/${token}/oficina/tareas`}
          accent="#14B8A6"
          hint={kpis.tareas === 0 ? 'Nada en curso' : 'En proceso o por aprobar'}
        />
        <KpiCard
          label="Llamadas hoy"
          value={kpis.llamadas}
          icon={PhoneCall}
          href={`/portal/${token}/oficina/llamadas`}
          accent="#F59E0B"
          hint={kpis.llamadas === 0 ? 'Ninguna aún' : 'Desde las 00:00'}
        />
        <KpiCard
          label="Docs esta semana"
          value={kpis.docs}
          icon={FileText}
          href={`/portal/${token}/oficina/documentos`}
          accent="#3B82F6"
          hint={kpis.docs === 0 ? 'Sin documentos' : 'Últimos 7 días'}
        />
      </section>

      {/* ── Attention + Actividad (2-col en desktop, apilado móvil) ─────── */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-6">
        <aside className="flex flex-col gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] px-1" style={{ color: '#6B6480' }}>
            Requiere tu atención
          </p>
          <AttentionPanel token={token} />
        </aside>
        <div className="min-w-0">
          <ActividadFeed token={token} />
        </div>
      </section>
    </div>
  );
}
