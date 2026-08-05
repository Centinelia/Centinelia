'use client';

import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Loader2, Table2 } from 'lucide-react';

/* ── Google sub-service icons (small, inline SVG) ───────────────────────── */

const GmailIcon = () => (
  <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
    <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
    <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
  </svg>
);

const DriveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
    <path d="M6 38h36l-6-10H12L6 38z" fill="#FBBC04" />
    <path d="M24 4h12L24 24H12L24 4z" fill="#4285F4" />
    <path d="M4 38l8-14L24 4 12 24 6 38H4z" fill="#34A853" />
    <path d="M36 24l6 14H18l6-14h12z" fill="#FBBC04" />
  </svg>
);

const SheetsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
    <rect x="8" y="4" width="32" height="40" rx="2" fill="#0F9D58" />
    <rect x="12" y="14" width="24" height="3" rx="1" fill="#fff" opacity=".8" />
    <rect x="12" y="21" width="24" height="3" rx="1" fill="#fff" opacity=".8" />
    <rect x="12" y="28" width="16" height="3" rx="1" fill="#fff" opacity=".8" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
    <rect x="4" y="8" width="40" height="36" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="2" />
    <path d="M4 18h40" stroke="#4285F4" strokeWidth="2" />
    <rect x="14" y="2" width="4" height="10" rx="2" fill="#4285F4" />
    <rect x="30" y="2" width="4" height="10" rx="2" fill="#4285F4" />
    <rect x="13" y="24" width="8" height="8" rx="1" fill="#4285F4" />
  </svg>
);

const ContactsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 48 48" fill="none">
    <rect x="8" y="4" width="32" height="40" rx="3" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
    <circle cx="24" cy="20" r="7" fill="#9B6DFF" />
    <path d="M10 40c0-7.7 6.3-14 14-14s14 6.3 14 14" stroke="#9B6DFF" strokeWidth="2" fill="none" />
  </svg>
);

/* ── Google "G" logo SVG ────────────────────────────────────────────────── */

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
    <path d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h13.1c-.6 3-2.3 5.6-4.9 7.3v6h7.9c4.6-4.3 7.4-10.6 7.4-17.6z" fill="#4285F4" />
    <path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.2 1.5-4.9 2.3-8 2.3-6.2 0-11.4-4.2-13.3-9.8H2.5v6.2C6.5 42.5 14.7 48 24 48z" fill="#34A853" />
    <path d="M10.7 28.7A14.9 14.9 0 0110.7 19.3V13.1H2.5A23.9 23.9 0 000 24c0 3.8.9 7.4 2.5 10.7l8.2-6z" fill="#FBBC05" />
    <path d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.8-6.8C35.9 2.4 30.4 0 24 0 14.7 0 6.5 5.5 2.5 13.3l8.2 6.2C12.6 13.7 17.8 9.5 24 9.5z" fill="#EA4335" />
  </svg>
);

/* ── types ──────────────────────────────────────────────────────────────── */

interface Props {
  /** portal token for API calls */
  token:     string;
  /** whether a Gmail account is currently connected */
  connected: boolean;
  /** email address of the connected account, if any */
  email:     string | null;
  /** whether the token needs re-auth */
  needsReauth?: boolean;
}

/* ── sub-service rows ───────────────────────────────────────────────────── */

interface SubService {
  key:     string;
  label:   string;
  icon:    React.ReactNode;
  detail?: React.ReactNode;
}

/* ── main component ─────────────────────────────────────────────────────── */

export default function GoogleWorkspaceCard({ token, connected, email, needsReauth }: Props) {
  const [sheetCount, setSheetCount]     = useState<number | null>(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  // Fetch sheets_mappings count when connected
  useEffect(() => {
    if (!connected || needsReauth) {
      setSheetCount(null);
      return;
    }
    setSheetsLoading(true);
    fetch(`/api/portal/${token}/sheets-mappings`)
      .then(r => r.json())
      .then(data => {
        setSheetCount(Array.isArray(data.mappings) ? data.mappings.length : 0);
      })
      .catch(() => setSheetCount(0))
      .finally(() => setSheetsLoading(false));
  }, [token, connected, needsReauth]);

  // Sub-services: always shown when scope bundle is granted (no per-scope column in DB)
  const sheetsDetail: React.ReactNode = sheetsLoading
    ? <Loader2 size={10} className="animate-spin inline ml-1" style={{ color: 'var(--c-text-4)' }} />
    : sheetCount !== null
      ? (
        <span style={{ color: 'var(--c-text-4)' }}>
          {sheetCount === 0
            ? 'Sin hojas configuradas'
            : `${sheetCount} hoja${sheetCount !== 1 ? 's' : ''} configurada${sheetCount !== 1 ? 's' : ''}`}
        </span>
      )
      : null;

  const subServices: SubService[] = [
    { key: 'gmail',    label: 'Correo (Gmail)',               icon: <GmailIcon />,    detail: null       },
    { key: 'drive',    label: 'Archivos (Drive)',             icon: <DriveIcon />,    detail: null       },
    { key: 'sheets',   label: 'Hojas de calculo (Sheets)',    icon: <SheetsIcon />,   detail: sheetsDetail },
    { key: 'calendar', label: 'Calendario (Google Calendar)', icon: <CalendarIcon />, detail: null       },
    { key: 'contacts', label: 'Contactos',                    icon: <ContactsIcon />, detail: null       },
  ];

  // Disconnected state: preview of capabilities
  if (!connected) {
    return (
      <div className="rounded-xl overflow-hidden w-full"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
        <p className="px-3 pt-2.5 pb-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border)' }}>
          Conectar da acceso a
        </p>
        <div className="px-3 py-3 flex flex-col gap-1.5">
          {subServices.map(svc => (
            <div key={svc.key} className="flex items-center gap-1.5">
              <span style={{ color: 'var(--c-text-4)', flexShrink: 0 }}>{svc.icon}</span>
              <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{svc.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Connected state: show status per sub-service
  return (
    <div className="rounded-xl overflow-hidden w-full"
      style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>

      {/* Header */}
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <GoogleLogo />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <p className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--c-text-4)' }}>
            Google Workspace
          </p>
          {email && (
            <p className="text-[10px] truncate" style={{ color: 'var(--c-text-4)' }}>{email}</p>
          )}
        </div>
        {needsReauth ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
            <AlertTriangle size={9} /> Token expirado
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.6)' }} />
            Activo
          </span>
        )}
      </div>

      {/* Sub-service list */}
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        {subServices.map(svc => (
          <div key={svc.key} className="flex items-center gap-1.5">
            {needsReauth ? (
              <AlertTriangle size={10} style={{ color: '#f59e0b', flexShrink: 0 }} />
            ) : (
              <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--c-text-3)' }}>
              {svc.icon} {svc.label}
            </span>
            {svc.detail && (
              <span className="text-[10px] ml-1 flex items-center gap-0.5" style={{ color: 'var(--c-text-4)' }}>
                {svc.key === 'sheets' && <Table2 size={9} style={{ flexShrink: 0 }} />}
                {svc.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
