'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Loader2, RefreshCw, Globe } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';
import DnsTutorialAccordion from './DnsTutorialAccordion';

interface DnsRecord {
  type:   string;
  name:   string;
  value:  string;
  status: string;
}

interface Settings {
  email_from:            string | null;
  email_domain_verified: boolean;
  resend_domain_id:      string | null;
  dns_records:           DnsRecord[];
  domain_status:         string | null;
}

export default function EmailSettings({ token }: { token: string }) {
  const [settings,      setSettings]      = useState<Settings | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [emailInput,    setEmailInput]    = useState('');
  const [registering,   setRegistering]   = useState(false);
  const [verifying,     setVerifying]     = useState(false);
  const [registerError, setRegisterError] = useState('');

  const load = useCallback(async () => {
    const res  = await fetch(`/api/portal/${token}/email-settings`);
    const data = await res.json();
    setSettings(data);
    setEmailInput(data.email_from ?? '');
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function registerDomain() {
    if (!emailInput.includes('@')) { setRegisterError('Ingresa un correo válido.'); return; }
    setRegistering(true);
    setRegisterError('');
    const res  = await fetch(`/api/portal/${token}/email-domain`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput }),
    });
    const data = await res.json();
    if (!res.ok) { setRegisterError(data.error ?? 'Error al registrar.'); setRegistering(false); return; }
    await load();
    setRegistering(false);
  }

  async function verifyDomain() {
    setVerifying(true);
    const res  = await fetch(`/api/portal/${token}/email-domain/verify`, { method: 'POST' });
    const data = await res.json();
    if (data.verified) {
      setSettings(prev => prev ? { ...prev, email_domain_verified: true, domain_status: 'verified' } : prev);
    }
    setVerifying(false);
  }

  if (loading) {
    return (
      <div
        className="flex flex-col rounded-2xl overflow-hidden px-5 py-4"
        style={{
          background: '#ffffff',
          border: '1px solid #E8E3F5',
          boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
        }}
      >
        <p className="text-sm" style={{ color: '#9B8FB5' }}>Cargando...</p>
      </div>
    );
  }

  const isVerified = settings?.email_domain_verified;
  const isPending  = settings?.resend_domain_id && !isVerified;
  const domain     = settings?.email_from ? settings.email_from.split('@')[1] : null;

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1px solid #E8E3F5',
        boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
        <div>
          <div className="flex items-baseline gap-2">
            <Globe size={15} style={{ color: '#6C3BFF', alignSelf: 'center' }} />
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Correos automáticos a tus clientes
            </h2>
            <InfoTooltip text={'Cuando tu empleado agenda una cita o captura un lead por teléfono, Centinelia envía un correo de confirmación al cliente. Aquí eliges desde qué correo salen esos avisos. Los correos que tu empleado escribe manualmente (Gmail/Outlook conectado) NO pasan por aquí: usan tu correo real.'} />
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Por default salen desde <strong style={{ color: '#1A0A3B' }}>notificaciones@centinelia.mx</strong>. Registra tu dominio para que lleguen desde <strong style={{ color: '#1A0A3B' }}>tuempresa.com</strong> y luzcan profesionales.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isVerified && (
            <span
              className="text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              <CheckCircle size={11} /> Verificado
            </span>
          )}
          {isPending && (
            <span
              className="text-[11px] font-semibold px-2 py-1 rounded-full"
              style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}
            >
              Pendiente de verificación
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
        {isVerified ? (
          <div className="flex items-center gap-2 flex-wrap">
            <CheckCircle size={14} style={{ color: '#22c55e' }} />
            <span className="text-[13px] font-medium" style={{ color: '#1A0A3B' }}>{settings?.email_from}</span>
            <span className="text-[13px]" style={{ color: '#6B6480' }}>los correos salen desde este dominio</span>
          </div>
        ) : (
          <>
            {!isPending && (
              <div className="flex gap-2 flex-wrap">
                <input
                  type="email"
                  placeholder="hola@tuempresa.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="flex-1 min-w-[220px] text-[13px] px-3 py-2 rounded-lg outline-none transition-all focus:ring-2"
                  style={{
                    background: '#FAFAFB',
                    border: '1px solid #E8E3F5',
                    color: '#1A0A3B',
                    boxShadow: emailInput ? '0 0 0 2px rgba(108,59,255,0.1)' : 'none',
                  }}
                />
                <button
                  onClick={registerDomain}
                  disabled={registering}
                  className="text-[13px] font-semibold px-4 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: '#6C3BFF',
                    color: '#fff',
                    boxShadow: '0 1px 2px rgba(108,59,255,0.24)',
                  }}
                >
                  {registering ? <Loader2 size={14} className="animate-spin" /> : 'Registrar'}
                </button>
              </div>
            )}
            {registerError && <p className="text-[12px] mt-2" style={{ color: '#ef4444' }}>{registerError}</p>}
          </>
        )}
      </div>

      {/* DNS records sub-section */}
      {isPending && settings?.dns_records && settings.dns_records.length > 0 && (
        <div className="px-5 py-4" style={{ borderTop: '1px solid #F0EDF9' }}>
          <p className="text-[13px] font-semibold mb-3" style={{ color: '#1A0A3B' }}>
            Agrega estos registros DNS a <strong>{domain}</strong>:
          </p>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #E8E3F5' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#FAFAFB' }}>
                  {['Tipo', 'Nombre', 'Valor'].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 10px',
                        textAlign: 'left',
                        color: '#6B6480',
                        fontWeight: 600,
                        borderBottom: '1px solid #F0EDF9',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {settings.dns_records.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: i < settings.dns_records.length - 1 ? '1px solid #F0EDF9' : undefined,
                    }}
                  >
                    <td style={{ padding: '8px 10px', color: '#6C3BFF', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.type}</td>
                    <td style={{ padding: '8px 10px', color: '#1A0A3B', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 120 }}>{r.name}</td>
                    <td style={{ padding: '8px 10px', color: '#6B6480', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 180 }}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={verifyDomain}
              disabled={verifying}
              className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                background: '#6C3BFF',
                color: '#fff',
                boxShadow: '0 1px 2px rgba(108,59,255,0.24)',
              }}
            >
              {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Verificar configuración DNS
            </button>
            <span className="text-[12px]" style={{ color: '#6B6480' }}>
              Puede tardar hasta 24h en propagarse.
            </span>
          </div>

          <DnsTutorialAccordion />
        </div>
      )}

      {/* Info footer */}
      <div
        className="px-5 py-4 flex gap-3"
        style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}
      >
        <AlertCircle size={15} style={{ color: '#6C3BFF', flexShrink: 0, marginTop: 1 }} />
        <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
          Aplica a los correos automáticos que tus empleados generan sin tener Gmail o Outlook conectado: confirmaciones de cita, acuses de lead, reportes de incidencia al encargado, seguimientos programados. Si tu empleado tiene Gmail/Outlook conectado, sus correos salen desde ahí y este dominio no aplica. El logo, color y pie vienen de <strong style={{ color: '#1A0A3B' }}>Identidad visual</strong> arriba.
        </p>
      </div>
    </div>
  );
}
