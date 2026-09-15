'use client';

/**
 * NaviDashboard — dashboard principal de un Navi estándar.
 *
 * Componente contenedor client-side que:
 *   - Muestra BandejaAprobacion (últimos 10 pendientes)
 *   - Muestra KillSwitchToggle para pausar/reactivar publicaciones
 *   - Mini resumen de métricas 7d (cargadas desde /social/metrics)
 *   - Links a las 6 sub-páginas del Navi
 *
 * Los datos de sesión ya fueron verificados en el server component padre.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar, LayoutTemplate, AtSign, MessageSquare, Image, BarChart2,
  TrendingUp, Heart, Eye,
} from 'lucide-react';
import BandejaAprobacion from './BandejaAprobacion';
import KillSwitchToggle  from './KillSwitchToggle';

interface NaviInfo {
  id:              string;
  agent_name:      string | null;
  social_account?: {
    id:                  string;
    external_username:   string | null;
    paused:              boolean;
    paused_reason?:      string | null;
    status:              string;
  } | null;
}

interface MetricSummary {
  likes:       number;
  comments:    number;
  impressions: number;
  posts:       number;
}

interface Props {
  token:  string;
  naviId: string;
  navi:   NaviInfo;
}

const SUB_PAGES = [
  { href: 'calendario',    icon: Calendar,       label: 'Calendario editorial', description: 'Programación mensual' },
  { href: 'plantillas',    icon: LayoutTemplate, label: 'Plantillas',           description: 'Diseños de Canva' },
  { href: 'cuenta',        icon: AtSign,         label: 'Cuenta de Instagram',  description: 'Conexión y estado' },
  { href: 'interacciones', icon: MessageSquare,  label: 'Interacciones',        description: 'Comentarios y DMs' },
  { href: 'media',         icon: Image,          label: 'Mis archivos',         description: 'Imágenes y videos' },
  { href: 'consumo',       icon: BarChart2,      label: 'Consumo',              description: 'Ops utilizadas' },
] as const;

export default function NaviDashboard({ token, naviId, navi }: Props) {
  const base = `/portal/${token}/oficina/redes/${naviId}`;

  const [metrics, setMetrics] = useState<MetricSummary | null>(null);

  useEffect(() => {
    // Cargar métricas 7d en background — no bloquea el render
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    void fetch(`/api/portal/${token}/social/metrics?agent_id=${naviId}&since=${since}`)
      .then(r => r.ok ? r.json() : null)
      .then((json) => {
        if (!json?.data?.length) return;
        const totals = (json.data as Array<{
          snapshots: Record<string, { likes: number; comments: number; impressions: number } | null>
        }>).reduce(
          (acc, d) => {
            const s = d.snapshots?.['7d'];
            if (s) {
              acc.likes       += s.likes;
              acc.comments    += s.comments;
              acc.impressions += s.impressions;
              acc.posts       += 1;
            }
            return acc;
          },
          { likes: 0, comments: 0, impressions: 0, posts: 0 },
        );
        setMetrics(totals);
      })
      .catch(() => null);
  }, [token, naviId]);

  const account      = navi.social_account ?? null;
  const isPaused     = account?.paused ?? false;
  const username     = account?.external_username ?? null;
  const accountNeeds = account?.status === 'needs_reauth';

  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">

      {/* Aviso de reconexión necesaria */}
      {accountNeeds && (
        <div
          className="rounded-lg px-4 py-3 text-[13px]"
          style={{ background: '#FEF9C3', border: '1px solid #FDE047', color: '#A16207' }}
        >
          El token de Instagram caducó. Ve a{' '}
          <Link href={`${base}/cuenta`} className="font-semibold underline">
            Cuenta de Instagram
          </Link>{' '}
          para reconectar.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

        {/* Columna principal: bandeja + kill switch */}
        <div className="flex flex-col gap-5">

          {/* Kill switch */}
          {account && (
            <KillSwitchToggle
              token={token}
              scope="account"
              id={account.id}
              reason={account.paused_reason ?? undefined}
              currentlyPaused={isPaused}
            />
          )}

          {/* Bandeja de aprobación */}
          <section>
            <BandejaAprobacion
              token={token}
              naviId={naviId}
              socialAccountId={account?.id}
            />
          </section>
        </div>

        {/* Columna lateral: métricas + links */}
        <div className="flex flex-col gap-4">

          {/* Mini métricas 7d */}
          {metrics && (
            <div
              className="rounded-xl p-4 flex flex-col gap-3"
              style={{ background: '#F8F7FF', border: '1px solid #E8E3F5' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>
                Últimos 7 días
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Me gusta',     value: metrics.likes,       icon: Heart     },
                  { label: 'Comentarios',  value: metrics.comments,    icon: MessageSquare },
                  { label: 'Impresiones',  value: metrics.impressions, icon: Eye       },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <Icon size={14} style={{ color: '#6C3BFF', opacity: 0.7 }} />
                    <span className="text-[18px] font-bold tabular-nums" style={{ color: '#1A0A3B' }}>
                      {value.toLocaleString('es-MX')}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-center" style={{ color: '#6B6480' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              {username && (
                <p className="text-[11px] text-center" style={{ color: '#6B6480' }}>
                  @{username} &mdash; {metrics.posts} publicaciones medidas
                </p>
              )}
            </div>
          )}

          {/* Links a sub-páginas */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] px-1" style={{ color: '#6B6480' }}>
              Secciones de Navi
            </p>
            {SUB_PAGES.map(({ href, icon: Icon, label, description }) => {
              // Pasar el mes actual como query param al calendario
              const fullHref = href === 'calendario'
                ? `${base}/${href}?month=${currentMonth}`
                : `${base}/${href}`;
              return (
                <Link
                  key={href}
                  href={fullHref}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group"
                  style={{ border: '1px solid #E8E3F5', background: '#fff' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F8F7FF'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(108,59,255,0.08)' }}
                  >
                    <Icon size={15} style={{ color: '#6C3BFF' }} strokeWidth={1.75} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] font-medium" style={{ color: '#1A0A3B' }}>{label}</span>
                    <span className="text-[10px]" style={{ color: '#6B6480' }}>{description}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
