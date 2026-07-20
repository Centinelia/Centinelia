'use client';

import { useEffect, useState } from 'react';
import { Calendar, Mail, FolderOpen, ChevronDown, ShoppingCart } from 'lucide-react';
import type { Plan } from '@/types/agent';

import IntegrationsSection  from './IntegrationsSection';
import NotionSection        from './NotionSection';
import NotionSchemasSection from './NotionSchemasSection';
import TeamsSection         from './TeamsSection';
import EmailOAuthSection    from './EmailOAuthSection';
import EmailSettings        from './EmailSettings';

/* ── types ─────────────────────────────────────────────────────────────── */

interface CalStatus    { calendar_type: string | null }
interface NotionStatus { connected: boolean }
interface EmailStatus  { provider: 'gmail' | 'outlook' }
interface HubStatus    {
  cal:        CalStatus | null;
  notion:     NotionStatus | null;
  emails:     EmailStatus[];
  teamsEmail: string | null;
}

/* ── provider icons ─────────────────────────────────────────────────────── */

const GmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
    <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
    <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
  </svg>
);
const OutlookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
    <rect width="48" height="48" rx="6" fill="#0078D4" />
    <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
    <circle cx="17" cy="24" r="6" fill="#0078D4" />
    <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
  </svg>
);
const TeamsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#5865F2" />
    <path d="M5 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#fff" strokeWidth="1.5" fill="none" />
    <circle cx="11" cy="8" r="2.5" fill="#fff" />
  </svg>
);
const NotionIcon = () => (
  <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
    <rect width="100" height="100" rx="10" fill="#fff" />
    <path fillRule="evenodd" clipRule="evenodd"
      d="M61.35.227l-55.333 4.086C1.553 4.7 0 7.617 0 11.113v61.197c0 2.723.967 5.057 3.3 8.167l13.16 16.387c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V19.64c0-2.21-.873-2.847-3.443-4.733L74.167 2.143C69.893-.963 68.147-1.357 61.35.227z"
      fill="#000" />
  </svg>
);

/* ── status dot ─────────────────────────────────────────────────────────── */

function StatusDot({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="w-2 h-2 rounded-full flex-shrink-0"
    style={{ background: '#22c55e', boxShadow: '0 0 5px rgba(34,197,94,0.5)' }} />;
}

/* ── group label ────────────────────────────────────────────────────────── */

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase px-1 pt-2 pb-0.5"
      style={{ color: 'var(--c-text-4)' }}>
      {label}
    </p>
  );
}

/* ── collapsible row ────────────────────────────────────────────────────── */

function IntegrationRow({
  icon, label, connected, comingSoon, children,
}: {
  icon:        React.ReactNode;
  label:       string;
  connected?:  boolean;
  comingSoon?: boolean;
  children?:   React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

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
          {icon}
        </div>

        <span className="flex-1 text-sm font-semibold"
          style={{ color: comingSoon ? 'var(--c-text-4)' : 'var(--c-text)' }}>
          {label}
        </span>

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
  token:        string;
  plan:         Plan;
  hasOpsAgent:  boolean;
  hasNotion:    boolean;
  inboxAddress: string | null;
}

export default function IntegrationsHub({ token, plan, hasOpsAgent, hasNotion, inboxAddress }: Props) {
  const [status, setStatus] = useState<HubStatus>({
    cal: null, notion: null, emails: [], teamsEmail: null,
  });

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/${token}/integrations`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/notion`).then(r => r.json()).catch(() => null),
      fetch(`/api/portal/${token}/email-oauth`).then(r => r.json()).catch(() => null),
      hasOpsAgent
        ? fetch(`/api/portal/${token}/teams`).then(r => r.json()).catch(() => null)
        : Promise.resolve(null),
    ]).then(([calData, notionData, emailData, teamsData]) => {
      setStatus({
        cal:        calData    ?? null,
        notion:     notionData ?? null,
        emails:     emailData?.integrations ?? [],
        teamsEmail: teamsData?.teams_user_email ?? null,
      });
    });
  }, [token, hasOpsAgent]);

  const gmailConnected   = status.emails.some(e => e.provider === 'gmail');
  const outlookConnected = status.emails.some(e => e.provider === 'outlook');

  return (
    <div className="flex flex-col gap-1.5">

      {/* ── Correo ─────────────────────────────────────────────────────── */}
      <GroupLabel label="Correo" />

      <IntegrationRow icon={<GmailIcon />} label="Gmail" connected={gmailConnected}>
        <div className="flex flex-col gap-4">
          <EmailOAuthSection token={token} only="gmail" />
          {inboxAddress && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl select-all cursor-text font-mono text-sm"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
              <Mail size={14} style={{ color: '#06b6d4', flexShrink: 0 }} />
              {inboxAddress}
            </div>
          )}
          {gmailConnected && <EmailSettings token={token} />}
        </div>
      </IntegrationRow>

      <IntegrationRow icon={<OutlookIcon />} label="Outlook" connected={outlookConnected}>
        <div className="flex flex-col gap-4">
          <EmailOAuthSection token={token} only="outlook" />
          {outlookConnected && <EmailSettings token={token} />}
        </div>
      </IntegrationRow>

      {/* ── Agenda ─────────────────────────────────────────────────────── */}
      <GroupLabel label="Agenda" />

      <IntegrationRow
        icon={<Calendar size={16} color="#6C3BFF" />}
        label="Calendario"
        connected={!!status.cal?.calendar_type}
      >
        <IntegrationsSection token={token} plan={plan} />
      </IntegrationRow>

      {/* ── CRM ────────────────────────────────────────────────────────── */}
      <GroupLabel label="CRM" />

      <IntegrationRow icon={<NotionIcon />} label="Notion" connected={!!status.notion?.connected}>
        <div className="flex flex-col gap-5">
          <NotionSection token={token} />
          {hasNotion && <NotionSchemasSection token={token} />}
        </div>
      </IntegrationRow>

      {/* ── Mensajería ─────────────────────────────────────────────────── */}
      {hasOpsAgent && (
        <>
          <GroupLabel label="Mensajería" />
          <IntegrationRow icon={<TeamsIcon />} label="Microsoft Teams" connected={!!status.teamsEmail}>
            <TeamsSection token={token} />
          </IntegrationRow>
        </>
      )}

      {/* ── Próximamente ───────────────────────────────────────────────── */}
      <GroupLabel label="Próximamente" />
      <IntegrationRow icon={<FolderOpen size={16} color="#06b6d4" />} label="Archivos" comingSoon />
      <IntegrationRow icon={<ShoppingCart size={16} color="#F5D000" />} label="MercadoLibre" comingSoon />

    </div>
  );
}
