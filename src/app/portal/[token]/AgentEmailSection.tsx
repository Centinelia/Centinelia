'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, CheckCircle, Loader2, Trash2, AlertTriangle, RefreshCw, Globe, ChevronDown } from 'lucide-react';
import EmailSettings from './EmailSettings';
import SmtpConnectSection from './SmtpConnectSection';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentEmail {
  id:            string;
  provider:      'gmail' | 'outlook';
  email:         string;
  last_sync_at:  string | null;
  needs_reauth:  boolean;
}

// ── Provider config ───────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id:        'gmail' as const,
    label:     'Gmail',
    areaDesc:  'Google Workspace o Gmail del área',
    color:     '#EA4335',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="40" height="32" rx="2" fill="#fff" stroke="#ddd" strokeWidth="1.5" />
        <path d="M4 8l20 14L44 8" stroke="#EA4335" strokeWidth="2.5" fill="none" />
      </svg>
    ),
  },
  {
    id:        'outlook' as const,
    label:     'Outlook',
    areaDesc:  'Microsoft 365 o Outlook del área',
    color:     '#0078D4',
    icon: (
      <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
        <rect width="48" height="48" rx="6" fill="#0078D4" />
        <rect x="8" y="12" width="18" height="24" fill="#fff" opacity=".9" />
        <circle cx="17" cy="24" r="6" fill="#0078D4" />
        <path d="M28 16h12v4H28zM28 22h12v4H28zM28 28h12v4H28z" fill="#fff" opacity=".8" />
      </svg>
    ),
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1)  return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentEmailSection({ token, agentId }: { token: string; agentId: string }) {
  const [connections,   setConnections]   = useState<AgentEmail[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState<string | null>(null);
  const [dupError,      setDupError]      = useState<string | null>(null);
  const [otroExpanded,  setOtroExpanded]  = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const emailFlag = p.get('email');
    if (emailFlag === 'connected') {
      setJustConnected(p.get('provider'));
    } else if (emailFlag === 'already_used_by_teammate') {
      setDupError(p.get('provider') === 'outlook' ? 'Outlook' : 'Gmail');
    }
    if (emailFlag) {
      const next = new URL(window.location.href);
      next.searchParams.delete('email');
      next.searchParams.delete('provider');
      window.history.replaceState({}, '', next.toString());
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/portal/${token}/agent-email`);
      const data = await res.json();
      const conns: AgentEmail[] = data.connections ?? [];
      setConnections(conns);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function disconnect(provider: 'gmail' | 'outlook') {
    const label = provider === 'gmail' ? 'Gmail' : 'Outlook';
    if (!confirm(`¿Desconectar ${label} de este empleado?`)) return;
    setDisconnecting(provider);
    try {
      await fetch(`/api/portal/${token}/agent-email`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ provider }),
      });
      setConnections(prev => prev.filter(c => c.provider !== provider));
    } finally { setDisconnecting(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4" style={{ color: '#6B6480' }}>
        <Loader2 size={14} className="animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Slot 1: Bandeja del empleado ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
            Correo del empleado
          </p>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>
            Conecta la bandeja real que este empleado atenderá (por ejemplo <span style={{ fontFamily: 'monospace', color: '#1A0A3B' }}>nia@tuempresa.com</span>). Centinelia leerá y enviará correos desde ahí como si el empleado tuviera la contraseña.
          </p>
        </div>

        <div
          className="flex gap-2.5 rounded-lg px-3 py-2.5"
          style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.16)' }}
        >
          <Mail size={13} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 2 }} />
          <div className="text-xs leading-relaxed" style={{ color: '#1A0A3B' }}>
            <p className="font-semibold" style={{ color: '#1A0A3B' }}>Cómo funciona el acceso</p>
            <p className="mt-0.5" style={{ color: '#6B6480' }}>
              Al hacer clic en <strong>Conectar</strong> abre el login de Google o Microsoft. Inicia sesión con las credenciales de la cuenta que quieres darle al empleado (no la tuya). Centinelia guarda un token que renueva solo — no tenemos ni guardamos la contraseña.
            </p>
          </div>
        </div>

        {justConnected && (
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <CheckCircle size={13} />
            Correo conectado correctamente. Los mensajes nuevos se procesarán en los próximos minutos.
          </div>
        )}

        {dupError && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', color: '#991b1b', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2, color: '#ef4444' }} />
            <div className="leading-snug">
              <b>No se puede conectar esa cuenta de {dupError}.</b> Ya la tiene registrada otro empleado del portal. Cada meerkat debe tener su propio buzón de correo (los alias del mismo dominio, tipo <span style={{ fontFamily: 'monospace' }}>nia@empresa.com</span> y <span style={{ fontFamily: 'monospace' }}>nash@empresa.com</span>, cuentan como cuentas distintas).
            </div>
          </div>
        )}

        {PROVIDERS.map(provider => {
          const conn = connections.find(c => c.provider === provider.id);
          return (
            <div
              key={provider.id}
              className="rounded-xl p-4"
              style={{
                background: '#ffffff',
                border:     `1px solid ${conn && !conn.needs_reauth ? 'rgba(34,197,94,0.2)' : '#F0EDF9'}`,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
                >
                  {provider.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                      {provider.label}
                    </span>
                    {conn && !conn.needs_reauth && (
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                      >
                        <CheckCircle size={10} /> Conectado
                      </span>
                    )}
                    {conn?.needs_reauth && (
                      <span
                        className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
                      >
                        <AlertTriangle size={10} /> Requiere reconexión
                      </span>
                    )}
                  </div>

                  {conn ? (
                    <>
                      <p className="text-xs mt-0.5 truncate font-mono" style={{ color: '#1A0A3B' }}>
                        {conn.email}
                      </p>
                      <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: '#9B8FB5' }}>
                        <RefreshCw size={9} />
                        Última sync: {timeAgo(conn.last_sync_at)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                      {provider.areaDesc}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {conn ? (
                    <>
                      {conn.needs_reauth && (
                        <a
                          href={`/api/portal/${token}/email-oauth/connect?provider=${provider.id}&scope=agent`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ background: '#f59e0b', color: '#000', textDecoration: 'none' }}
                        >
                          <Mail size={11} /> Reconectar
                        </a>
                      )}
                      <button
                        onClick={() => disconnect(provider.id)}
                        disabled={disconnecting === provider.id}
                        className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        style={{ color: '#6B6480' }}
                        title="Desconectar"
                      >
                        {disconnecting === provider.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Trash2 size={14} />
                        }
                      </button>
                    </>
                  ) : (
                    <a
                      href={`/api/portal/${token}/email-oauth/connect?provider=${provider.id}&scope=agent`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{ background: provider.color, color: '#fff', textDecoration: 'none' }}
                    >
                      <Mail size={12} /> Conectar
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Tercera opción: correo con dominio propio via Resend + DNS.
             Para orgs sin Google Workspace / Microsoft 365 (Zoho, Titan,
             hosting propio, iCloud). Ver copy en el card + DnsTutorialAccordion. */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: '#ffffff',
            border:     '1px solid #F0EDF9',
          }}
        >
          <button
            onClick={() => setOtroExpanded(v => !v)}
            className="w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-gray-50"
            style={{ cursor: 'pointer' }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
            >
              <Globe size={18} style={{ color: '#6C3BFF' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
                  Otro correo
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#FAFAFB', color: '#9B8FB5', border: '1px solid #E8E3F5' }}>
                  Setup técnico
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                Tu dominio con Telmex, Zoho, Titan, hosting propio, iCloud. Solo necesitas host, puerto y contraseña — sin DNS.
              </p>
            </div>
            <ChevronDown
              size={16}
              style={{
                color: '#6B6480',
                transition: 'transform 200ms',
                transform: otroExpanded ? 'rotate(180deg)' : 'rotate(0)',
                flexShrink: 0,
                marginTop: 8,
              }}
            />
          </button>

          {otroExpanded && (
            <div className="px-4 pb-4" style={{ borderTop: '1px solid #F0EDF9' }}>
              <div
                className="mt-3 mb-4 flex gap-2 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.12)' }}
              >
                <Mail size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 2 }} />
                <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
                  Si tienes Gmail Workspace o Outlook/Microsoft 365, usa esas opciones — es mucho más simple (un click de OAuth). Esta ruta es para dominios hospedados en otros proveedores (Telmex, Zoho, Titan, cPanel, iCloud). Fase 1: solo envío. Fase 2 traerá lectura de inbox.
                </p>
              </div>
              <SmtpConnectSection token={token} agentId={agentId} />
              <details className="mt-4">
                <summary className="text-[11px] cursor-pointer" style={{ color: '#9B8FB5' }}>
                  Opción avanzada: usar Resend con verificación de dominio (DNS)
                </summary>
                <div className="mt-3">
                  <EmailSettings token={token} />
                </div>
              </details>
            </div>
          )}
        </div>

        <div
          className="flex gap-2 rounded-lg px-3 py-2"
          style={{ background: 'rgba(108,59,255,0.04)', border: '1px solid rgba(108,59,255,0.1)' }}
        >
          <Mail size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs leading-relaxed" style={{ color: '#9B8FB5' }}>
            Los mensajes nuevos se revisan cada 15 minutos. El empleado los analiza y los deja listos para revisión en la Oficina.
          </p>
        </div>
      </div>

    </div>
  );
}
