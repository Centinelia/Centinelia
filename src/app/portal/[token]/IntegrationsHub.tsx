'use client';

import { useEffect, useState, useCallback } from 'react';
import { Calendar, Mail, FolderOpen, X, ChevronRight, Plus, ShoppingCart } from 'lucide-react';
import type { Plan } from '@/types/agent';

import IntegrationsSection   from './IntegrationsSection';
import NotionSection         from './NotionSection';
import NotionSchemasSection  from './NotionSchemasSection';
import TeamsSection          from './TeamsSection';
import EmailOAuthSection     from './EmailOAuthSection';
import EmailSettings         from './EmailSettings';
import InfoTooltip           from '@/components/InfoTooltip';

/* ── types ─────────────────────────────────────────────────────────────── */

interface CalStatus       { calendar_type: string | null; calendar_link: string | null }
interface NotionStatus    { connected: boolean; workspace_name: string | null; db_id: string | null }
interface EmailIntegration{ provider: 'gmail' | 'outlook'; email: string; last_sync_at: string | null }
interface HubStatus       { cal: CalStatus | null; notion: NotionStatus | null; emails: EmailIntegration[]; teamsEmail: string | null }

const CAL_LABELS: Record<string, string> = { cal_com: 'Cal.com', calendly: 'Calendly', google: 'Google Calendar' };

/* ── micro icons ────────────────────────────────────────────────────────── */

const GmailDot = () => (
  <svg width="14" height="14" viewBox="0 0 48 48" fill="none">
    <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
    <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
  </svg>
);
const OutlookDot = () => (
  <svg width="14" height="14" viewBox="0 0 48 48" fill="none">
    <rect width="48" height="48" rx="4" fill="#0078D4" />
    <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
    <circle cx="17" cy="24" r="6" fill="#0078D4" />
  </svg>
);
const TeamsDot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="4" fill="#5865F2" />
    <path d="M5 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#fff" strokeWidth="1.5" fill="none" />
    <circle cx="11" cy="8" r="2.5" fill="#fff" />
  </svg>
);
const NotionDot = () => (
  <svg width="14" height="14" viewBox="0 0 100 100" fill="none">
    <rect width="100" height="100" rx="10" fill="#fff" />
    <path fillRule="evenodd" clipRule="evenodd"
      d="M61.35.227l-55.333 4.086C1.553 4.7 0 7.617 0 11.113v61.197c0 2.723.967 5.057 3.3 8.167l13.16 16.387c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V19.64c0-2.21-.873-2.847-3.443-4.733L74.167 2.143C69.893-.963 68.147-1.357 61.35.227z"
      fill="#000" />
  </svg>
);

/* small tag shown inside connected capability cards */
function ProviderTag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs truncate max-w-[160px]"
      style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
      {icon}{label}
    </span>
  );
}

/* ── provider option definition ─────────────────────────────────────────── */

type ProviderOption = {
  id:          string;
  name:        string;
  description: string;
  icon:        React.ReactNode;
  action:      'oauth' | 'scroll';
  href?:       string;
  scrollTo?:   string;
};

function providersByCapability(capability: string, token: string): ProviderOption[] {
  switch (capability) {
    case 'email':
      return [
        { id: 'gmail',   name: 'Gmail',   description: 'Google Workspace o cuenta personal',  icon: <GmailDot />,   action: 'oauth',  href: `/api/portal/${token}/email-oauth/connect?provider=gmail`   },
        { id: 'outlook', name: 'Outlook', description: 'Microsoft 365 o cuenta personal',     icon: <OutlookDot />, action: 'oauth',  href: `/api/portal/${token}/email-oauth/connect?provider=outlook` },
      ];
    case 'calendar':
      return [
        { id: 'cal_com',  name: 'Cal.com',         description: 'Crea citas directamente durante la llamada', icon: <span className="text-[10px] font-bold" style={{ color: '#6C3BFF' }}>CAL</span>, action: 'scroll', scrollTo: 'calendario' },
        { id: 'calendly', name: 'Calendly',         description: 'Envía link de reserva por WhatsApp',        icon: <Calendar size={14} color="#006BFF" />, action: 'scroll', scrollTo: 'calendario' },
        { id: 'google',   name: 'Google Calendar',  description: 'Envía link de reserva por WhatsApp',        icon: <Calendar size={14} color="#4285F4" />, action: 'scroll', scrollTo: 'calendario' },
      ];
    case 'crm':
      return [
        { id: 'notion', name: 'Notion', description: 'CRM automático en tu workspace de Notion', icon: <NotionDot />, action: 'scroll', scrollTo: 'crm' },
      ];
    case 'messaging':
      return [
        { id: 'teams', name: 'Microsoft Teams', description: 'Responde mensajes via Power Automate', icon: <TeamsDot />, action: 'scroll', scrollTo: 'mensajeria' },
      ];
    default:
      return [];
  }
}

/* ── Provider selection modal ───────────────────────────────────────────── */

function ProviderModal({
  capability, label, token, onClose,
}: {
  capability: string;
  label:      string;
  token:      string;
  onClose:    () => void;
}) {
  const providers = providersByCapability(capability, token);

  const handleAction = useCallback((p: ProviderOption) => {
    if (p.action === 'oauth' && p.href) {
      window.location.href = p.href;
    } else if (p.action === 'scroll' && p.scrollTo) {
      onClose();
      setTimeout(() => {
        document.getElementById(p.scrollTo!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [onClose]);

  // Close on backdrop click
  const onBackdrop = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onBackdrop}
    >
      <div
        className="w-full max-w-sm flex flex-col gap-4 p-5 rounded-2xl"
        style={{
          background:  'var(--c-modal)',
          border:      '1px solid rgba(108,59,255,0.2)',
          boxShadow:   '0 24px 64px rgba(0,0,0,0.5)',
          maxHeight:   'calc(100vh - 2rem)',
          overflowY:   'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase mb-0.5" style={{ color: 'var(--c-text-3)' }}>
              Agregar capacidad
            </p>
            <h3 className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>{label}</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
              Selecciona el proveedor que deseas conectar.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Provider list */}
        <div className="flex flex-col gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => handleAction(p)}
              className="flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl transition-all group"
              style={{
                background: 'var(--c-surface)',
                border:     '1px solid var(--c-border-2)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(108,59,255,0.4)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--c-border-2)'; }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
                {p.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{p.name}</p>
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{p.description}</p>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Capability card ────────────────────────────────────────────────────── */

function CapabilityCard({
  accentBg, accentBorder, icon, label,
  connected, providers, href, comingSoon, onAdd,
}: {
  accentBg:     string;
  accentBorder: string;
  icon:         React.ReactNode;
  label:        string;
  connected:    boolean;
  providers?:   React.ReactNode[];
  href?:        string;
  comingSoon?:  boolean;
  onAdd?:       () => void;
}) {
  const inner = (
    <div
      className={`flex flex-col gap-3 p-3.5 rounded-xl h-full${comingSoon ? ' opacity-50' : ''}`}
      style={{
        background: 'var(--c-surface)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.25)' : 'var(--c-border-2)'}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
            {icon}
          </div>
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{label}</span>
        </div>
        {comingSoon
          ? <span className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)', border: '1px solid var(--c-border)' }}>
              Pronto
            </span>
          : connected
            ? <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: '#22c55e', boxShadow: '0 0 5px rgba(34,197,94,0.5)' }} />
            : null
        }
      </div>

      {connected && providers && providers.length > 0
        ? <div className="flex flex-wrap gap-1">{providers}</div>
        : !comingSoon && !connected && onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70 w-fit"
            style={{ color: '#6C3BFF' }}
          >
            <Plus size={11} />
            Agregar
          </button>
        )
      }
    </div>
  );

  // Connected cards scroll to section on click
  if (href && connected && !comingSoon) {
    return <a href={href} className="block no-underline hover:opacity-90 transition-opacity">{inner}</a>;
  }
  return <div>{inner}</div>;
}

/* ── section wrapper ────────────────────────────────────────────────────── */

function Section({ id, label, description, children }: {
  id?: string; label: string; description: string; children: React.ReactNode;
}) {
  return (
    <div id={id} className="rounded-xl p-5"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-1.5 mb-4">
        <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>{label}</h2>
        <InfoTooltip text={description} />
      </div>
      {children}
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────────────── */

interface Props {
  token:        string;
  plan:         Plan;
  hasOpsAgent:  boolean;
  hasNotion:    boolean;
  inboxAddress: string | null;
}

export default function IntegrationsHub({ token, plan, hasOpsAgent, hasNotion, inboxAddress }: Props) {
  const [status, setStatus]       = useState<HubStatus>({ cal: null, notion: null, emails: [], teamsEmail: null });
  const [openModal, setOpenModal] = useState<{ capability: string; label: string } | null>(null);

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

  /* derived */
  const calConnected   = !!status.cal?.calendar_type;
  const calLabel       = calConnected ? (CAL_LABELS[status.cal!.calendar_type!] ?? status.cal!.calendar_type!) : null;
  const notionConnected= !!status.notion?.connected;
  const gmailRow       = status.emails.find(e => e.provider === 'gmail');
  const outlookRow     = status.emails.find(e => e.provider === 'outlook');
  const emailConnected = !!(gmailRow || outlookRow);
  const teamsConnected = !!status.teamsEmail;

  const connectedCount = [emailConnected, calConnected, notionConnected, hasOpsAgent && teamsConnected]
    .filter(Boolean).length;

  const gridCols = hasOpsAgent
    ? 'sm:grid-cols-3 lg:grid-cols-5'
    : 'sm:grid-cols-2 lg:grid-cols-4';

  const closeModal = useCallback(() => setOpenModal(null), []);

  return (
    <>
      {/* ── Provider selection modal ──────────────────────────────────── */}
      {openModal && (
        <ProviderModal
          capability={openModal.capability}
          label={openModal.label}
          token={token}
          onClose={closeModal}
        />
      )}

      <div className="flex flex-col gap-5">

        {/* ── Capabilities overview ──────────────────────────────────── */}
        <div className="rounded-xl p-4"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Capacidades
            </p>
            {connectedCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
                {connectedCount} activa{connectedCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className={`grid grid-cols-2 ${gridCols} gap-2`}>

            <CapabilityCard
              accentBg="rgba(234,67,53,0.08)" accentBorder="rgba(234,67,53,0.2)"
              icon={<Mail size={13} color="#EA4335" />}
              label="Correo" connected={emailConnected} href="#correo"
              providers={[
                ...(gmailRow   ? [<ProviderTag key="g" icon={<GmailDot />}   label={gmailRow.email}   />] : []),
                ...(outlookRow ? [<ProviderTag key="o" icon={<OutlookDot />} label={outlookRow.email} />] : []),
              ]}
              onAdd={() => setOpenModal({ capability: 'email', label: 'Correo' })}
            />

            <CapabilityCard
              accentBg="rgba(108,59,255,0.08)" accentBorder="rgba(108,59,255,0.2)"
              icon={<Calendar size={13} color="#6C3BFF" />}
              label="Calendario" connected={calConnected} href="#calendario"
              providers={calLabel ? [<ProviderTag key="c" icon={<Calendar size={11} color="#6C3BFF" />} label={calLabel} />] : []}
              onAdd={() => setOpenModal({ capability: 'calendar', label: 'Calendario' })}
            />

            <CapabilityCard
              accentBg="#fff" accentBorder="rgba(0,0,0,0.1)"
              icon={<NotionDot />}
              label="CRM" connected={notionConnected} href="#crm"
              providers={
                notionConnected && status.notion?.workspace_name
                  ? [<ProviderTag key="n" icon={<NotionDot />} label={status.notion.workspace_name} />]
                  : []
              }
              onAdd={() => setOpenModal({ capability: 'crm', label: 'CRM' })}
            />

            {hasOpsAgent && (
              <CapabilityCard
                accentBg="#5865F2" accentBorder="rgba(88,101,242,0.4)"
                icon={<TeamsDot />}
                label="Mensajería" connected={teamsConnected} href="#mensajeria"
                providers={teamsConnected ? [<ProviderTag key="t" icon={<TeamsDot />} label="Microsoft Teams" />] : []}
                onAdd={() => setOpenModal({ capability: 'messaging', label: 'Mensajería' })}
              />
            )}

            <CapabilityCard
              accentBg="rgba(6,182,212,0.08)" accentBorder="rgba(6,182,212,0.2)"
              icon={<FolderOpen size={13} color="#06b6d4" />}
              label="Archivos" connected={false} comingSoon
            />

            <CapabilityCard
              accentBg="rgba(255,230,0,0.12)" accentBorder="rgba(255,230,0,0.3)"
              icon={<ShoppingCart size={13} color="#F5D000" />}
              label="MercadoLibre" connected={false} comingSoon
            />

          </div>
        </div>

        {/* ── Correo OAuth ───────────────────────────────────────────── */}
        <Section id="correo" label="Correo"
          description="Conecta tu cuenta de Gmail u Outlook para que tu empleado lea y gestione tu bandeja de entrada directamente.">
          <EmailOAuthSection token={token} />
        </Section>

        {inboxAddress && (
          <Section label="Bandeja de entrada por reenvío"
            description="Alternativa sin OAuth: configura el reenvío automático en tu correo empresarial hacia esta dirección y los mensajes llegarán a La Oficina.">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl select-all cursor-text font-mono text-sm"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}>
              <Mail size={14} style={{ color: '#06b6d4', flexShrink: 0 }} />
              {inboxAddress}
            </div>
          </Section>
        )}

        <EmailSettings token={token} />

        {/* ── Calendario ─────────────────────────────────────────────── */}
        <Section id="calendario" label="Calendario"
          description="Cal.com crea la cita directamente durante la llamada. Calendly y Google Calendar envían el link de reserva al cliente por WhatsApp.">
          <IntegrationsSection token={token} plan={plan} />
        </Section>

        {/* ── CRM (Notion) ───────────────────────────────────────────── */}
        <div id="crm">
          <NotionSection token={token} />
        </div>
        {hasNotion && (
          <Section label="Validación de bases de datos"
            description="Define la estructura esperada de tus bases de datos. Tu empleado revisa cada semana que todo esté en orden y te avisa si hay entradas con campos vacíos o valores incorrectos.">
            <NotionSchemasSection token={token} />
          </Section>
        )}

        {/* ── Mensajería (Teams) ─────────────────────────────────────── */}
        {hasOpsAgent && (
          <div id="mensajeria" className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border-2)' }}>
            <div className="px-5 pt-5 pb-1" style={{ background: 'var(--c-surface)' }}>
              <div className="flex items-center gap-1.5 mb-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Mensajería</h2>
                <InfoTooltip text="Conecta Microsoft Teams via Power Automate para que tu empleado lea y responda mensajes automáticamente." />
              </div>
            </div>
            <div className="px-5 pb-5" style={{ background: 'var(--c-surface)' }}>
              <TeamsSection token={token} />
            </div>
          </div>
        )}

      </div>
    </>
  );
}
