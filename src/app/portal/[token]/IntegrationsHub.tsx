'use client';

import { useEffect, useState } from 'react';
import { Calendar, Mail, MessageSquare, ShoppingCart, ChevronDown, Check, Users, DollarSign, Plug, Sparkles, FileText, Cloud } from 'lucide-react';
import type { Plan } from '@/types/agent';

import IntegrationsSection       from './IntegrationsSection';
import NotionSection             from './NotionSection';
import NotionSchemasSection      from './NotionSchemasSection';
import TeamsSection              from './TeamsSection';
import EmailOAuthSection         from './EmailOAuthSection';
import MercadoLibreSection       from './MercadoLibreSection';
import QuickBooksSection         from './QuickBooksSection';
import GoogleWorkspaceCard       from './GoogleWorkspaceCard';
import SolucionFactibleSection   from './oficina/integraciones/solucion-factible/SolucionFactibleSection';
import StorageSection            from './StorageSection';

/* ── types ─────────────────────────────────────────────────────────────── */

interface CalStatus    { calendar_type: string | null }
interface NotionStatus { connected: boolean }
interface EmailStatus  { provider: 'gmail' | 'outlook'; email?: string }
interface MLStatus     { connected: boolean; nickname: string | null }
interface QBStatus     { connected: boolean; company_name: string | null }
interface SFStatus     { connected: boolean }
interface DropboxStatus { connected: boolean; email?: string }
interface HubStatus    {
  cal:        CalStatus | null;
  notion:     NotionStatus | null;
  emails:     EmailStatus[];
  teamsEmail: string | null;
  ml:         MLStatus | null;
  qb:         QBStatus | null;
  sf:         SFStatus | null;
  dropbox:    DropboxStatus | null;
}

interface PacksInfo {
  activePacks:       string[];
  allPacks:          Array<{ id: string; label: string; description: string; tools: string[]; source: string }>;
  meerkatsUsingPack: Record<string, number>;
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
  solucion_factible: (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="8" fill="#1A56DB" />
      <rect x="12" y="10" width="24" height="28" rx="3" fill="#fff" fillOpacity=".2" />
      <rect x="14" y="12" width="20" height="24" rx="2" fill="#fff" />
      <path d="M18 19h12M18 24h12M18 29h7" stroke="#1A56DB" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

/* ── status dot ─────────────────────────────────────────────────────────── */

function StatusDot({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}>
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

  const pct       = Math.round((connected.length / caps.length) * 100);
  const allDone   = pending.length === 0 && connected.length > 0;
  const accent    = allDone ? '#16a34a' : '#6C3BFF';
  const accentBg  = allDone ? 'rgba(34,197,94,0.06)' : 'rgba(108,59,255,0.05)';
  const accentBd  = allDone ? '1px solid rgba(34,197,94,0.22)' : '1px solid rgba(108,59,255,0.22)';

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: accentBd,
        boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Hero: badge + % + progress */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-4 flex-wrap"
        style={{ background: accentBg, borderBottom: accentBd }}>
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${accent}14`, border: `1px solid ${accent}33` }}>
          <Sparkles size={20} style={{ color: accent }} strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
            {allDone
              ? 'Tu equipo tiene acceso completo'
              : connected.length === 0
                ? 'Aún no has equipado tu oficina'
                : 'Tu equipo tiene acceso parcial'}
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
            {connected.length} de {caps.length} capacidades conectadas.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className="text-[15px] font-bold px-3 py-1 rounded-lg tabular-nums"
            style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
            {pct}%
          </span>
          <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: '#E8E3F5' }}>
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${pct}%`, background: accent }} />
          </div>
        </div>
      </div>

      {/* Chips */}
      <div className="flex flex-col gap-3 px-5 py-4">
        {connected.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
              Ya pueden usar
            </p>
            <div className="flex flex-wrap gap-1.5">
              {connected.map(c => (
                <span key={c.id}
                  className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <Check size={10} strokeWidth={2.5} /> {c.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: '#9B8FB5', letterSpacing: '0.05em' }}>
              {connected.length === 0 ? 'Para equipar la oficina' : 'Todavía no pueden usar'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pending.map(c => (
                <span key={c.id}
                  className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: '#C7BEE0' }} />
                  {c.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
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
        style={{ border: '1px solid #E8E3F5', background: '#FAFAFB' }}>
        <p className="px-3 pt-2.5 pb-2 text-[10px] font-bold tracking-widest uppercase"
          style={{ color: '#9B8FB5', borderBottom: '1px solid #F0EDF9' }}>
          Esta cuenta da acceso a · {suite.name}
        </p>
        <div className="grid grid-cols-3 gap-0">
          {suite.items.map((item, i) => (
            <div key={item.label}
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderRight: i < suite.items.length - 1 ? '1px solid #F0EDF9' : 'none' }}>
              <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
              <span className="flex items-center gap-1.5 text-[12px]" style={{ color: '#6B6480' }}>
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
      style={{ border: '1px solid #E8E3F5', background: '#FAFAFB' }}>
      <p className="px-3 pt-2.5 pb-2 text-[10px] font-bold tracking-widest uppercase"
        style={{ color: '#9B8FB5', borderBottom: '1px solid #F0EDF9' }}>
        Conectar da acceso a
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {(['gmail', 'outlook'] as const).map((p, i) => {
          const suite = SUITE_CAPABILITIES[p];
          return (
            <div key={p}
              className="flex flex-col gap-1.5 px-3 py-3"
              style={i === 1 ? { borderLeft: '1px solid #F0EDF9' } : {}}>
              <span className="text-[11px] font-semibold mb-0.5" style={{ color: '#1A0A3B' }}>
                {suite.name}
              </span>
              {suite.items.slice(0, 2).map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <Check size={10} style={{ color: '#9B8FB5', flexShrink: 0 }} />
                  <span className="flex items-center gap-1 text-[12px]" style={{ color: '#6B6480' }}>
                    {item.icon} {item.label}
                  </span>
                </div>
              ))}
              <span className="text-[10px]" style={{ color: '#9B8FB5' }}>y más...</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── per-employee banner ────────────────────────────────────────────────── */

function PerEmployeeBanner({ token, text }: { token: string; text: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.16)' }}
    >
      <Users size={13} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 2 }} />
      <div className="text-xs leading-relaxed flex-1" style={{ color: '#1A0A3B' }}>
        <p style={{ color: '#6B6480' }}>{text}</p>
        <a
          href={`/portal/${token}/empleados`}
          className="inline-block mt-1 font-semibold"
          style={{ color: '#6C3BFF' }}
        >
          Ir a la lista de empleados →
        </a>
      </div>
    </div>
  );
}

/* ── capability row (dentro del surface único, con divider) ─────────────── */

interface PackBadge {
  label:        string;
  tooltip:      string;
  meerkatsUsing: number;
}

function CapabilityRow({
  icon, connectedIcon, label, subtitle, connected, comingSoon, isLast, packBadge, children,
}: {
  icon:           React.ReactNode;
  connectedIcon?: React.ReactNode;
  label:          string;
  subtitle?:      string;
  connected?:     boolean;
  comingSoon?:    boolean;
  isLast:         boolean;
  packBadge?:     PackBadge | null;
  children?:      React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const displayIcon = connected && connectedIcon ? connectedIcon : icon;

  return (
    <div
      className="flex flex-col"
      style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}
    >
      <button
        onClick={() => !comingSoon && setOpen(o => !o)}
        disabled={comingSoon}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
        style={{ cursor: comingSoon ? 'default' : 'pointer', background: 'transparent' }}
        onMouseEnter={e => { if (!comingSoon) (e.currentTarget as HTMLButtonElement).style.background = '#FAFAFB'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          {displayIcon}
        </div>

        <div className="flex flex-col flex-1 min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold flex-wrap"
            style={{ color: comingSoon ? '#9B8FB5' : '#1A0A3B', lineHeight: 1.3 }}>
            {label}
            {packBadge && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
                title={packBadge.tooltip}
              >
                {packBadge.label}
              </span>
            )}
          </span>
          {subtitle && (
            <span className="text-[12px] truncate" style={{ color: '#6B6480', marginTop: 1, lineHeight: 1.3 }}>
              {subtitle}
            </span>
          )}
        </div>

        <StatusDot on={!!connected} />

        {comingSoon ? (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: '#FAFAFB', color: '#9B8FB5', border: '1px solid #E8E3F5' }}>
            Pronto
          </span>
        ) : (
          <ChevronDown size={14} style={{
            color:      '#9B8FB5',
            flexShrink: 0,
            transform:  open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }} />
        )}
      </button>

      {open && !comingSoon && (
        <div
          className="px-5 pb-5 pt-4"
          style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
        >
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
    cal: null, notion: null, emails: [], teamsEmail: null, ml: null, qb: null, sf: null, dropbox: null,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [packsInfo, setPacksInfo] = useState<PacksInfo | null>(null);

  // Refetch de packs — al mount y cada vez que la tab recupera foco (cubre
  // OAuth callback: usuario conecta QB en popup → vuelve a la pestaña → focus
  // → badges de packs se actualizan sin reload manual).
  useEffect(() => {
    let cancelled = false;
    const fetchPacks = () => {
      fetch(`/api/portal/${token}/packs`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (!cancelled) setPacksInfo(data as PacksInfo | null); })
        .catch(() => { if (!cancelled) setPacksInfo(null); });
    };
    fetchPacks();
    const onFocus = () => fetchPacks();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [token]);

  // Refetch de status — mismo pattern: mount + focus. Cubre el mismo caso
  // (integraciones OAuth conectadas/desconectadas via popup externo).
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = () => {
      Promise.all([
        fetch(`/api/portal/${token}/integrations`).then(r => r.json()).catch(() => null),
        fetch(`/api/portal/${token}/notion`).then(r => r.json()).catch(() => null),
        fetch(`/api/portal/${token}/email-oauth`).then(r => r.json()).catch(() => null),
        fetch(`/api/portal/${token}/ml-oauth`).then(r => r.json()).catch(() => null),
        fetch(`/api/portal/${token}/qb-oauth`).then(r => r.json()).catch(() => null),
        hasOpsAgent
          ? fetch(`/api/portal/${token}/teams`).then(r => r.json()).catch(() => null)
          : Promise.resolve(null),
        fetch(`/api/portal/${token}/invoicing/config`).then(r => r.json()).catch(() => null),
        fetch(`/api/portal/${token}/dropbox-oauth`).then(r => r.json()).catch(() => null),
      ]).then(([calData, notionData, emailData, mlData, qbData, teamsData, sfData, dropboxData]) => {
        if (cancelled) return;
        setStatus({
          cal:        calData    ?? null,
          notion:     notionData ?? null,
          emails:     (emailData?.integrations ?? []).map((i: any) => ({ provider: i.provider, email: i.email })),
          teamsEmail: teamsData?.teams_user_email ?? null,
          ml:         mlData    ?? null,
          qb:         qbData    ?? null,
          sf:         sfData    ?? null,
          dropbox:    dropboxData ?? null,
        });
        setStatusLoaded(true);
      });
    };
    fetchStatus();
    const onFocus = () => fetchStatus();
    window.addEventListener('focus', onFocus);
    return () => { cancelled = true; window.removeEventListener('focus', onFocus); };
  }, [token, hasOpsAgent]);

  /* ── computed subtitles ─────────────────────────────────────────────── */

  const emailConn      = status.emails[0] ?? null;
  const emailSubtitle  = emailConn
    ? `${emailConn.provider === 'gmail' ? 'Google Workspace' : 'Microsoft 365'}${emailConn.email ? ` · ${emailConn.email}` : ''}`
    : undefined;

  // Google/Outlook Calendar ya no se infieren del OAuth de Gmail — se conectan
  // per-empleado desde su ficha. Ver .brain/decisions/2026-09-04-integraciones-per-agent-vs-org-level.md
  const calSubtitle    = status.cal?.calendar_type
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

  const sfSubtitle     = status.sf?.connected
    ? 'Solucion Factible · Timbrado CFDI 4.0'
    : 'Elige tu proveedor y emite CFDI 4.0 automáticamente';

  // Google Drive / OneDrive ya no se infieren del OAuth de Gmail — se conectan
  // per-empleado desde su ficha. Aquí solo se muestra Dropbox (org-level).
  function buildStorageSubtitle(s: HubStatus): string | undefined {
    if (s.dropbox?.connected) return 'Dropbox';
    return 'Dropbox (compartido). Google Drive y OneDrive se configuran por empleado.';
  }

  /* ── summary caps ───────────────────────────────────────────────────── */

  const caps: CapabilitySummary[] = [
    // 'correo' (Bandeja compartida) removido 2026-09-04: la integración org-level
    // se contraponía a los correos que cada empleado ya tiene conectados individualmente
    // en su configurar. Ver [[org-level-email-deprecated]].
    // Calendario aquí es solo org-level (Cal.com / Calendly). Google Calendar y
    // Outlook Calendar son per-empleado. Ver .brain/decisions/2026-09-04-...
    { id: 'calendario',  label: 'Calendario',  connected: !!status.cal?.calendar_type },
    { id: 'crm',      label: 'Conocimiento del cliente', connected: !!status.notion?.connected },
    ...(hasOpsAgent ? [{ id: 'mensajeria', label: 'Mensajería', connected: !!status.teamsEmail }] : []),
    { id: 'comercio',    label: 'Comercio',    connected: !!status.ml?.connected },
    // 'finanzas' (QuickBooks) hidden 2026-08-28. Ver comentario en rows[] abajo.
    { id: 'facturacion', label: 'Facturación', connected: !!status.sf?.connected },
  ];

  /* ── build capability rows ──────────────────────────────────────────── */

  type CapRow = {
    key: string;
    icon: React.ReactNode;
    connectedIcon?: React.ReactNode;
    label: string;
    subtitle?: string;
    connected: boolean;
    children: React.ReactNode;
  };

  const rows: CapRow[] = [
    // 'correo' (Bandeja compartida) removido 2026-09-04. Cada empleado conecta
    // su propio correo desde su página de configurar. Ver [[org-level-email-deprecated]].
    {
      key: 'calendario',
      icon: <Calendar size={16} style={{ color: '#6C3BFF' }} />,
      connectedIcon:
        status.cal?.calendar_type === 'google'
          ? RowIcons.gcal
          : status.cal?.calendar_type === 'outlook_cal'
          ? RowIcons.mcal
          : undefined,
      label: 'Calendario',
      subtitle: calSubtitle,
      connected: !!status.cal?.calendar_type,
      children: (
        <div className="flex flex-col gap-4">
          <PerEmployeeBanner
            token={token}
            text="Google Calendar y Outlook Calendar se configuran individualmente en la ficha de cada empleado."
          />
          <IntegrationsSection token={token} plan={plan} emailConn={null} />
        </div>
      ),
    },
    {
      key: 'crm',
      icon: <Users size={16} style={{ color: '#6C3BFF' }} />,
      connectedIcon: RowIcons.notion,
      label: 'Conocimiento del cliente',
      subtitle: notionSubtitle,
      connected: !!status.notion?.connected,
      children: (
        <div className="flex flex-col gap-5">
          <NotionSection token={token} />
          {hasNotion && <NotionSchemasSection token={token} />}
        </div>
      ),
    },
    ...(hasOpsAgent
      ? [{
          key: 'mensajeria',
          icon: <MessageSquare size={16} style={{ color: '#5865F2' }} />,
          connectedIcon: RowIcons.teams,
          label: 'Mensajería',
          subtitle: teamsSubtitle,
          connected: !!status.teamsEmail,
          children: <TeamsSection token={token} />,
        }]
      : []),
    // MercadoLibre hidden 2026-08-19: 0 orgs activos. Reactivar via pack mercado_libre (Capa 2).
    // QuickBooks (Finanzas) hidden 2026-08-28: piloto AC nunca conectó cuenta real,
    // cero orgs en prod. QuickBooksSection component preservado + tools/executors/routes
    // dormidos en código para reactivación futura. Ver pack `quickbooks` en packs.ts.
    {
      key: 'solucion_factible',
      icon: <FileText size={16} style={{ color: '#1A56DB' }} />,
      connectedIcon: RowIcons.solucion_factible,
      label: 'Facturación CFDI',
      subtitle: sfSubtitle,
      connected: !!status.sf?.connected,
      children: <SolucionFactibleSection token={token} />,
    },
    {
      key: 'storage',
      icon: <Cloud size={16} style={{ color: '#6C3BFF' }} />,
      label: 'Almacenamiento en la nube',
      subtitle: buildStorageSubtitle(status),
      connected: !!status.dropbox?.connected,
      children: (
        <div className="flex flex-col gap-4">
          <PerEmployeeBanner
            token={token}
            text="Google Drive y OneDrive se configuran individualmente en la ficha de cada empleado."
          />
          <StorageSection token={token} />
        </div>
      ),
    },
  ];

  /* ── packs badge helpers ─────────────────────────────────────────────── */

  // Maps capability row keys to their associated pack id.
  // Omitting 'comercio' → 'mercado_libre' (hidden 2026-08-19).
  const CAPABILITY_TO_PACK: Record<string, string> = {
    finanzas:          'quickbooks',
    solucion_factible: 'invoicing_cfdi',
    storage:           'cloud_catalog',
  };

  function packForCapability(key: string): PacksInfo['allPacks'][number] | null {
    if (!packsInfo) return null;
    const packId = CAPABILITY_TO_PACK[key];
    if (!packId) return null;
    return packsInfo.allPacks.find(p => p.id === packId) ?? null;
  }

  function isPackActive(key: string): boolean {
    if (!packsInfo) return false;
    const packId = CAPABILITY_TO_PACK[key];
    return packId ? packsInfo.activePacks.includes(packId) : false;
  }

  function meerkatsUsingCap(key: string): number {
    if (!packsInfo) return 0;
    const packId = CAPABILITY_TO_PACK[key];
    return packId ? (packsInfo.meerkatsUsingPack[packId] ?? 0) : 0;
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── Summary bar ────────────────────────────────────────────────── */}
      {statusLoaded && <OfficeSummaryBar caps={caps} />}

      {/* ── Categorías (surface único con dividers) ───────────────────── */}
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#ffffff',
          border: '1px solid #E8E3F5',
          boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
        }}
      >
        <div className="flex items-start gap-4 px-5 pt-5 pb-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}>
            <Plug size={20} style={{ color: '#6C3BFF' }} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
                Integraciones
              </h2>
              <span className="text-[13px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
                style={{ background: '#F0EDF9', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                {rows.length}
              </span>
            </div>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: '#6B6480' }}>
              Conecta los servicios que ya usas para que tu equipo trabaje directo sobre ellos, sin pedirte cambiar de herramienta.
            </p>
          </div>
        </div>

        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          {rows.map((r, idx) => {
            const pack          = packForCapability(r.key);
            const active        = isPackActive(r.key);
            const meerkatsCount = meerkatsUsingCap(r.key);

            const packBadge: PackBadge | null = pack && active
              ? {
                  label:         `${pack.tools.length} tools habilitadas`,
                  tooltip:       `Incluye: ${pack.tools.join(', ')}`,
                  meerkatsUsing: meerkatsCount,
                }
              : null;

            return (
              <CapabilityRow
                key={r.key}
                icon={r.icon}
                connectedIcon={r.connectedIcon}
                label={r.label}
                subtitle={r.subtitle}
                connected={r.connected}
                isLast={idx === rows.length - 1}
                packBadge={packBadge}
              >
                {r.children}
              </CapabilityRow>
            );
          })}
        </div>
      </div>
    </div>
  );
}
