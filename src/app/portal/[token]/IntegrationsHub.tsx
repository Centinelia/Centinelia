'use client';

import { useEffect, useState } from 'react';
import { Calendar, Mail, MessageSquare, ShoppingCart, ChevronDown, Check, Users, DollarSign } from 'lucide-react';
import type { Plan } from '@/types/agent';

import IntegrationsSection  from './IntegrationsSection';
import NotionSection        from './NotionSection';
import NotionSchemasSection from './NotionSchemasSection';
import TeamsSection         from './TeamsSection';
import EmailOAuthSection    from './EmailOAuthSection';
import MercadoLibreSection  from './MercadoLibreSection';
import QuickBooksSection    from './QuickBooksSection';
import GoogleWorkspaceCard  from './GoogleWorkspaceCard';

/* ── types ─────────────────────────────────────────────────────────────── */

interface CalStatus    { calendar_type: string | null }
interface NotionStatus { connected: boolean }
interface EmailStatus  { provider: 'gmail' | 'outlook'; email?: string }
interface MLStatus     { connected: boolean; nickname: string | null }
interface QBStatus     { connected: boolean; company_name: string | null }
interface HubStatus    {
  cal:        CalStatus | null;
  notion:     NotionStatus | null;
  emails:     EmailStatus[];
  teamsEmail: string | null;
  ml:         MLStatus | null;
  qb:         QBStatus | null;
}

/* ── provider icons (for workspace callout) ─────────────────────────────── */

const PIcons = {
  gmail: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
      <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
    </svg>
  ),
  gcal: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="2" />
      <path d="M4 18h40" stroke="#4285F4" strokeWidth="2" />
      <rect x="14" y="2" width="4" height="10" rx="2" fill="#4285F4" />
      <rect x="30" y="2" width="4" height="10" rx="2" fill="#4285F4" />
      <rect x="13" y="24" width="8" height="8" rx="1" fill="#4285F4" />
    </svg>
  ),
  drive: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <path d="M6 38h36l-6-10H12L6 38z" fill="#FBBC04" />
      <path d="M24 4h12L24 24H12L24 4z" fill="#4285F4" />
      <path d="M4 38l8-14L24 4 12 24 6 38H4z" fill="#34A853" />
      <path d="M36 24l6 14H18l6-14h12z" fill="#FBBC04" />
    </svg>
  ),
  contacts: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="4" width="32" height="40" rx="3" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
      <circle cx="24" cy="20" r="7" fill="#9B6DFF" />
      <path d="M10 40c0-7.7 6.3-14 14-14s14 6.3 14 14" stroke="#9B6DFF" strokeWidth="2" fill="none" />
    </svg>
  ),
  outlook: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="#0078D4" />
      <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
      <circle cx="17" cy="24" r="7" fill="#0078D4" />
      <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
    </svg>
  ),
  mcal: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#0078D4" strokeWidth="2" />
      <path d="M4 18h40" stroke="#0078D4" strokeWidth="2" />
      <rect x="14" y="2" width="4" height="10" rx="2" fill="#0078D4" />
      <rect x="30" y="2" width="4" height="10" rx="2" fill="#0078D4" />
      <rect x="13" y="24" width="8" height="8" rx="1" fill="#0078D4" />
    </svg>
  ),
  onedrive: (
    <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
      <path d="M28 34H10a8 8 0 01-2-15.7A11 11 0 0129 14a9 9 0 018 9 8 8 0 01-1 17H28z" fill="#0078D4" />
      <path d="M34 34H20a6 6 0 01-1-12 9 9 0 0116.5-2A7 7 0 0134 34z" fill="#28A8E8" />
    </svg>
  ),
};

/* ── row-level provider icons (18 px) ──────────────────────────────────── */

const RowIcons = {
  gmail: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
      <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
    </svg>
  ),
  outlook: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="#0078D4" />
      <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
      <circle cx="17" cy="24" r="7" fill="#0078D4" />
      <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
    </svg>
  ),
  gcal: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="2" />
      <path d="M4 18h40" stroke="#4285F4" strokeWidth="2" />
      <rect x="14" y="2" width="4" height="10" rx="2" fill="#4285F4" />
      <rect x="30" y="2" width="4" height="10" rx="2" fill="#4285F4" />
      <rect x="13" y="24" width="8" height="8" rx="1" fill="#4285F4" />
    </svg>
  ),
  mcal: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#0078D4" strokeWidth="2" />
      <path d="M4 18h40" stroke="#0078D4" strokeWidth="2" />
      <rect x="14" y="2" width="4" height="10" rx="2" fill="#0078D4" />
      <rect x="30" y="2" width="4" height="10" rx="2" fill="#0078D4" />
      <rect x="13" y="24" width="8" height="8" rx="1" fill="#0078D4" />
    </svg>
  ),
  notion: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="#fff" />
      <path d="M11 9c0-1.1.9-2 2-2h14.5L38 18.5V39a2 2 0 01-2 2H13a2 2 0 01-2-2V9z" fill="#fff" stroke="#000" strokeWidth="2.5" />
      <path d="M27.5 7v9.5H38" stroke="#000" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <text x="24" y="35" textAnchor="middle" fontSize="16" fontWeight="900" fill="#000" fontFamily="Georgia,serif">N</text>
    </svg>
  ),
  teams: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="6" fill="#5865F2" />
      <circle cx="30" cy="16" r="6" fill="#fff" opacity=".9" />
      <path d="M18 34c0-6.6 5.4-12 12-12" stroke="#fff" strokeWidth="2.5" fill="none" opacity=".5" />
      <circle cx="18" cy="20" r="7" fill="#fff" />
      <path d="M6 38c0-7.2 5.4-12 12-12s12 4.8 12 12" fill="#fff" opacity=".9" />
    </svg>
  ),
  mercadolibre: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="8" fill="#FFE600" />
      <ellipse cx="24" cy="20" rx="13" ry="11" fill="#FFE600" stroke="#333" strokeWidth="2" />
      <path d="M13 20c0-3 4-9 11-9s11 6 11 9" fill="#FFE600" />
      <path d="M11 22c2 7 7 12 13 12s11-5 13-12" stroke="#333" strokeWidth="2" fill="none" />
      <circle cx="20" cy="22" r="2" fill="#333" />
      <circle cx="28" cy="22" r="2" fill="#333" />
      <path d="M20 28c1 2 3 3 4 3s3-1 4-3" stroke="#333" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M15 17c2-5 6-7 9-7s7 2 9 7" stroke="#333" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  ),
  quickbooks: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="8" fill="#2CA01C" />
      <circle cx="24" cy="24" r="13" fill="#fff" />
      <path d="M18 18v12M18 24h8a4 4 0 010 8h-8" stroke="#2CA01C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  ),
};

/* ── status dot ─────────────────────────────────────────────────────────── */

function StatusDot({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.6)' }} />
      Activo
    </span>
  );
}

/* ── office summary bar ──────────────────────────────────────────────────── */

interface CapabilitySummary { id: string; label: string; connected: boolean }

function OfficeSummaryBar({ caps }: { caps: CapabilitySummary[] }) {
  const connected = caps.filter(c => c.connected);
  const pending   = caps.filter(c => !c.connected);
  if (caps.length === 0) return null;

  return (
    <div className="rounded-xl px-4 py-3.5 flex flex-col gap-3"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

      {connected.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--c-text-4)' }}>
            Tu equipo tiene acceso a
          </p>
          <div className="flex flex-wrap gap-1.5">
            {connected.map(c => (
              <span key={c.id}
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                <Check size={10} /> {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--c-text-4)' }}>
            {connected.length === 0 ? 'Para equipar la oficina' : 'Todavía no pueden usar'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pending.map(c => (
              <span key={c.id}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--c-border-2)' }} />
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── workspace capabilities callout ─────────────────────────────────────── */

const SUITE_CAPABILITIES = {
  gmail: {
    name:  'Google Workspace',
    items: [
      { label: 'Gmail',                   icon: PIcons.gmail    },
      { label: 'Drive',                   icon: PIcons.drive    },
      { label: 'Hojas de cálculo',        icon: PIcons.gcal     },
      { label: 'Calendario',              icon: PIcons.gcal     },
      { label: 'Contactos',               icon: PIcons.contacts },
    ],
  },
  outlook: {
    name:  'Microsoft 365',
    items: [
      { label: 'Outlook',   icon: PIcons.outlook  },
      { label: 'OneDrive',  icon: PIcons.onedrive },
      { label: 'Contactos', icon: PIcons.contacts },
    ],
  },
};

function WorkspaceCallout({ provider }: { provider: 'gmail' | 'outlook' | null }) {
  if (provider) {
    const suite = SUITE_CAPABILITIES[provider];
    return (
      <div className="rounded-xl overflow-hidden w-full"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
        <p className="px-3 pt-2.5 pb-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border)' }}>
          Esta cuenta da acceso a · {suite.name}
        </p>
        <div className="grid grid-cols-3 gap-0">
          {suite.items.map((item, i) => (
            <div key={item.label}
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderRight: i < suite.items.length - 1 ? '1px solid var(--c-border)' : 'none' }}>
              <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
                {item.icon} {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
      <p className="px-3 pt-2.5 pb-2 text-[10px] font-semibold tracking-widest uppercase"
        style={{ color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border)' }}>
        Conectar da acceso a
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {(['gmail', 'outlook'] as const).map((p, i) => {
          const suite = SUITE_CAPABILITIES[p];
          return (
            <div key={p}
              className="flex flex-col gap-1.5 px-3 py-3"
              style={i === 1 ? { borderLeft: '1px solid var(--c-border)' } : {}}>
              <span className="text-[11px] font-semibold mb-0.5" style={{ color: 'var(--c-text-2)' }}>
                {suite.name}
              </span>
              {suite.items.slice(0, 2).map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <Check size={10} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--c-text-4)' }}>
                    {item.icon} {item.label}
                  </span>
                </div>
              ))}
              <span className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>y más...</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── capability row ─────────────────────────────────────────────────────── */

function CapabilityRow({
  icon, connectedIcon, label, subtitle, connected, comingSoon, children,
}: {
  icon:           React.ReactNode;
  connectedIcon?: React.ReactNode;
  label:          string;
  subtitle?:      string;
  connected?:     boolean;
  comingSoon?:    boolean;
  children?:      React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const displayIcon = connected && connectedIcon ? connectedIcon : icon;

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--c-surface)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.2)' : 'var(--c-border-2)'}`,
      }}>

      <button
        onClick={() => !comingSoon && setOpen(o => !o)}
        disabled={comingSoon}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ cursor: comingSoon ? 'default' : 'pointer' }}
        onMouseEnter={e => { if (!comingSoon) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.03)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          {displayIcon}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-semibold"
            style={{ color: comingSoon ? 'var(--c-text-4)' : 'var(--c-text)', lineHeight: 1.3 }}>
            {label}
          </span>
          {subtitle && (
            <span className="text-xs truncate" style={{ color: 'var(--c-text-3)', marginTop: 1, lineHeight: 1.3 }}>
              {subtitle}
            </span>
          )}
        </div>

        <StatusDot on={!!connected} />

        {comingSoon ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)', border: '1px solid var(--c-border)' }}>
            Pronto
          </span>
        ) : (
          <ChevronDown size={14} style={{
            color:      'var(--c-text-4)',
            flexShrink: 0,
            transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }} />
        )}
      </button>

      {open && !comingSoon && (
        <div className="px-4 pb-5 pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── main ───────────────────────────────────────────────────────────────── */

interface Props {
  token:       string;
  plan:        Plan;
  hasOpsAgent: boolean;
  hasNotion:   boolean;
}

export default function IntegrationsHub({ token, plan, hasOpsAgent, hasNotion }: Props) {
  const [status, setStatus] = useState<HubStatus>({
    cal: null, notion: null, emails: [], teamsEmail: null, ml: null, qb: null,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/${token}/integrations`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/notion`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/email-oauth`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/ml-oauth`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/qb-oauth`).then(r => r.json()).catch(() => null),
      hasOpsAgent
        ? fetch(`/api/portal/${token}/teams`).then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
    ]).then(([calData, notionData, emailData, mlData, qbData, teamsData]) => {
      setStatus({
        cal:        calData    ?? null,
        notion:     notionData ?? null,
        emails:     (emailData?.integrations ?? []).map((i: any) => ({ provider: i.provider, email: i.email })),
        teamsEmail: teamsData?.teams_user_email ?? null,
        ml:         mlData    ?? null,
        qb:         qbData    ?? null,
      });
      setStatusLoaded(true);
    });
  }, [token, hasOpsAgent]);

  /* ── computed subtitles ─────────────────────────────────────────────── */

  const emailConn      = status.emails[0] ?? null;
  const emailSubtitle  = emailConn
    ? `${emailConn.provider === 'gmail' ? 'Google Workspace' : 'Microsoft 365'}${emailConn.email ? ` · ${emailConn.email}` : ''}`
    : undefined;

  const calViaEmail    = emailConn
    ? { provider: emailConn.provider, email: emailConn.email ?? '' }
    : null;

  const calSubtitle    = calViaEmail
    ? `${calViaEmail.provider === 'gmail' ? 'Google Calendar' : 'Outlook Calendar'} · ${calViaEmail.email}`
    : status.cal?.calendar_type
    ? ({ google: 'Google Calendar', outlook_cal: 'Outlook Calendar', cal_com: 'Cal.com', calendly: 'Calendly' }[status.cal.calendar_type] ?? status.cal.calendar_type)
    : undefined;

  const notionSubtitle = status.notion?.connected ? 'Notion' : undefined;

  const teamsSubtitle  = status.teamsEmail
    ? `Microsoft Teams · ${status.teamsEmail}`
    : undefined;

  const mlSubtitle     = status.ml?.connected
    ? `Mercado Libre${status.ml.nickname ? ` · ${status.ml.nickname}` : ''}`
    : undefined;

  const qbSubtitle     = status.qb?.connected
    ? `QuickBooks${status.qb.company_name ? ` · ${status.qb.company_name}` : ''}`
    : undefined;

  /* ── summary caps ───────────────────────────────────────────────────── */

  const caps: CapabilitySummary[] = [
    { id: 'correo',      label: 'Correo',      connected: status.emails.length > 0 },
    { id: 'calendario',  label: 'Calendario',  connected: !!calViaEmail || !!status.cal?.calendar_type },
    { id: 'crm',      label: 'Conocimiento del cliente', connected: !!status.notion?.connected },
    ...(hasOpsAgent ? [{ id: 'mensajeria', label: 'Mensajería', connected: !!status.teamsEmail }] : []),
    { id: 'comercio',  label: 'Comercio',   connected: !!status.ml?.connected },
    { id: 'finanzas',  label: 'Finanzas',   connected: !!status.qb?.connected },
  ];

  return (
    <div className="flex flex-col gap-3">

      {/* ── Summary bar ────────────────────────────────────────────────── */}
      {statusLoaded && <OfficeSummaryBar caps={caps} />}

      {/* ── Category rows ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">

        {/* Correo */}
        <CapabilityRow
          icon={<Mail size={16} style={{ color: '#9B6DFF' }} />}
          connectedIcon={emailConn?.provider === 'gmail' ? RowIcons.gmail : RowIcons.outlook}
          label="Correo"
          subtitle={emailSubtitle}
          connected={status.emails.length > 0}
        >
          <EmailOAuthSection
            token={token}
            workspacePanel={
              emailConn?.provider === 'gmail' || !emailConn ? (
                <GoogleWorkspaceCard
                  token={token}
                  connected={emailConn?.provider === 'gmail'}
                  email={emailConn?.email ?? null}
                />
              ) : (
                <WorkspaceCallout provider={emailConn.provider} />
              )
            }
          />
        </CapabilityRow>

        {/* Calendario */}
        <CapabilityRow
          icon={<Calendar size={16} style={{ color: '#6C3BFF' }} />}
          connectedIcon={
            (calViaEmail?.provider ?? status.cal?.calendar_type) === 'gmail'       ? RowIcons.gcal
            : (calViaEmail?.provider ?? status.cal?.calendar_type) === 'outlook' ||
              status.cal?.calendar_type === 'outlook_cal'                           ? RowIcons.mcal
            : undefined
          }
          label="Calendario"
          subtitle={calSubtitle}
          connected={!!calViaEmail || !!status.cal?.calendar_type}
        >
          <IntegrationsSection token={token} plan={plan} emailConn={calViaEmail} />
        </CapabilityRow>

        {/* Conocimiento del cliente */}
        <CapabilityRow
          icon={<Users size={16} style={{ color: '#6C3BFF' }} />}
          connectedIcon={RowIcons.notion}
          label="Conocimiento del cliente"
          subtitle={notionSubtitle}
          connected={!!status.notion?.connected}
        >
          <div className="flex flex-col gap-5">
            <NotionSection token={token} />
            {hasNotion && <NotionSchemasSection token={token} />}
          </div>
        </CapabilityRow>

        {/* Mensajería */}
        {hasOpsAgent && (
          <CapabilityRow
            icon={<MessageSquare size={16} style={{ color: '#5865F2' }} />}
            connectedIcon={RowIcons.teams}
            label="Mensajería"
            subtitle={teamsSubtitle}
            connected={!!status.teamsEmail}
          >
            <TeamsSection token={token} />
          </CapabilityRow>
        )}

        {/* Comercio */}
        <CapabilityRow
          icon={<ShoppingCart size={16} style={{ color: '#F5D000' }} />}
          connectedIcon={RowIcons.mercadolibre}
          label="Comercio"
          subtitle={mlSubtitle}
          connected={!!status.ml?.connected}
        >
          <MercadoLibreSection token={token} />
        </CapabilityRow>

        {/* Finanzas */}
        <CapabilityRow
          icon={<DollarSign size={16} style={{ color: '#2CA01C' }} />}
          connectedIcon={RowIcons.quickbooks}
          label="Finanzas"
          subtitle={qbSubtitle}
          connected={!!status.qb?.connected}
        >
          <QuickBooksSection token={token} />
        </CapabilityRow>

      </div>
    </div>
  );
}
