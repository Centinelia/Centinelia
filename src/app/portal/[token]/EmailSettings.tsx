'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, AlertCircle, Loader2, RefreshCw, Globe } from 'lucide-react';
import InfoTooltip from '@/components/InfoTooltip';

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

  if (loading) return <p className="text-sm" style={{ color: 'var(--c-text-sub)' }}>Cargando...</p>;

  const isVerified = settings?.email_domain_verified;
  const isPending  = settings?.resend_domain_id && !isVerified;
  const domain     = settings?.email_from ? settings.email_from.split('@')[1] : null;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Domain setup ── */}
      <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <div className="flex items-center gap-2 mb-4">
          <Globe size={16} style={{ color: '#9B6DFF' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Dominio de envío</h3>
          <InfoTooltip text={'Haz que los correos automáticos a tus clientes lleguen desde tu propio correo en lugar de centinelia.mx.'} />
          {isVerified && (
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
              <CheckCircle size={11} /> Verificado
            </span>
          )}
          {isPending && (
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
              Pendiente de verificación
            </span>
          )}
        </div>

        {isVerified ? (
          <div className="flex items-center gap-2">
            <CheckCircle size={14} style={{ color: '#22c55e' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{settings?.email_from}</span>
            <span className="text-sm" style={{ color: 'var(--c-text-sub)' }}>los correos salen desde este dominio</span>
          </div>
        ) : (
          <>
            {!isPending && (
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="hola@tuempresa.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                />
                <button
                  onClick={registerDomain}
                  disabled={registering}
                  className="text-sm font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-50"
                  style={{ background: '#6C3BFF', color: '#fff' }}
                >
                  {registering ? <Loader2 size={14} className="animate-spin" /> : 'Registrar'}
                </button>
              </div>
            )}
            {registerError && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{registerError}</p>}

            {isPending && settings?.dns_records && settings.dns_records.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--c-text)' }}>
                  Agrega estos registros DNS a <strong>{domain}</strong>:
                </p>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--c-bg)' }}>
                        {['Tipo', 'Nombre', 'Valor'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--c-text-sub)', fontWeight: 600, borderBottom: '1px solid var(--c-border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {settings.dns_records.map((r, i) => (
                        <tr key={i} style={{ borderBottom: i < settings.dns_records.length - 1 ? '1px solid var(--c-border)' : undefined }}>
                          <td style={{ padding: '6px 10px', color: '#9B6DFF', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.type}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--c-text)', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 120 }}>{r.name}</td>
                          <td style={{ padding: '6px 10px', color: 'var(--c-text-sub)', fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 180 }}>{r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={verifyDomain}
                    disabled={verifying}
                    className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                    style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }}
                  >
                    {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Verificar configuración DNS
                  </button>
                  <span className="text-sm" style={{ color: 'var(--c-text-sub)' }}>
                    Puede tardar hasta 24h en propagarse.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info box */}
      <div className="flex gap-3 rounded-xl p-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
        <AlertCircle size={15} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-sub)' }}>
          Estos correos los envía Centinelia automáticamente al cliente, no tu empleado. El contenido es fijo según el resultado de la llamada; el branding (logo, color, pie) se personaliza en <strong>Organización</strong>.
        </p>
      </div>

    </div>
  );
}
