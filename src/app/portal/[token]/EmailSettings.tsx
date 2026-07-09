'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2, RefreshCw, Globe } from 'lucide-react';

interface DnsRecord {
  type:   string;
  name:   string;
  value:  string;
  status: string;
}

interface Settings {
  email_from:            string | null;
  email_logo_url:        string | null;
  email_brand_color:     string | null;
  email_footer_text:     string | null;
  email_domain_verified: boolean;
  resend_domain_id:      string | null;
  dns_records:           DnsRecord[];
  domain_status:         string | null;
}

export default function EmailSettings({ token }: { token: string }) {
  const [settings,       setSettings]       = useState<Settings | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [emailInput,     setEmailInput]     = useState('');
  const [logoUrl,        setLogoUrl]        = useState('');
  const [brandColor,     setBrandColor]     = useState('#6C3BFF');
  const [footerText,     setFooterText]     = useState('');
  const [previewType,    setPreviewType]    = useState<'appointment' | 'lead'>('appointment');
  const [previewKey,     setPreviewKey]     = useState(0);
  const [registering,    setRegistering]    = useState(false);
  const [verifying,      setVerifying]      = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [registerError,  setRegisterError]  = useState('');
  const [saveMsg,        setSaveMsg]        = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/portal/${token}/email-settings`);
    const data = await res.json();
    setSettings(data);
    setEmailInput(data.email_from ?? '');
    setLogoUrl(data.email_logo_url ?? '');
    setBrandColor(data.email_brand_color ?? '#6C3BFF');
    setFooterText(data.email_footer_text ?? '');
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

  async function saveBranding() {
    setSaving(true);
    setSaveMsg('');
    await fetch(`/api/portal/${token}/email-settings`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_logo_url: logoUrl || null, email_brand_color: brandColor, email_footer_text: footerText || null }),
    });
    setPreviewKey(k => k + 1);
    setSaveMsg('Cambios guardados');
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3000);
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
            <Mail size={14} style={{ color: 'var(--c-text-sub)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{settings?.email_from}</span>
            <span className="text-xs" style={{ color: 'var(--c-text-sub)' }}>— los correos salen desde este dominio</span>
          </div>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: 'var(--c-text-sub)', lineHeight: 1.6 }}>
              Registra el correo de tu empresa para que los agentes envíen desde <strong>tu dominio</strong> en lugar de centinelia.mx.
              Necesitarás agregar registros DNS a tu proveedor (GoDaddy, Namecheap, Cloudflare, etc.).
            </p>

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
                  className="text-xs font-semibold px-4 py-2 rounded-lg transition-opacity disabled:opacity-50"
                  style={{ background: '#6C3BFF', color: '#fff' }}
                >
                  {registering ? <Loader2 size={14} className="animate-spin" /> : 'Registrar'}
                </button>
              </div>
            )}
            {registerError && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{registerError}</p>}

            {isPending && settings?.dns_records && settings.dns_records.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--c-text)' }}>
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
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity disabled:opacity-50"
                    style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }}
                  >
                    {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Verificar configuración DNS
                  </button>
                  <span className="text-xs" style={{ color: 'var(--c-text-sub)' }}>
                    Los cambios DNS pueden tardar hasta 24h en propagarse.
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Branding + Preview ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Branding editor */}
        <div className="rounded-xl p-5 flex flex-col gap-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
          <div className="flex items-center gap-2">
            <Mail size={16} style={{ color: '#9B6DFF' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Diseño del correo</h3>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--c-text-sub)' }}>Logo (URL de imagen)</label>
            <input
              type="url"
              placeholder="https://tuempresa.com/logo.png"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--c-text-sub)' }}>Si no pones logo, se muestra el nombre de tu negocio en texto.</p>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--c-text-sub)' }}>Color principal</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                style={{ width: 40, height: 36, borderRadius: 8, border: '1px solid var(--c-border)', cursor: 'pointer', padding: 2, background: 'var(--c-bg)' }}
              />
              <input
                type="text"
                value={brandColor}
                onChange={e => setBrandColor(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg outline-none"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', width: 110, fontFamily: 'monospace' }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--c-text-sub)' }}>Texto del pie</label>
            <textarea
              placeholder="Horario: L-V 9-18h · Tel: 81 1234 5678 · Monterrey, NL"
              value={footerText}
              onChange={e => setFooterText(e.target.value)}
              rows={2}
              className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
              style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>

          <button
            onClick={saveBranding}
            disabled={saving}
            className="flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-lg transition-opacity disabled:opacity-50"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Guardar cambios'}
          </button>
          {saveMsg && <p className="text-xs text-center" style={{ color: '#22c55e' }}>{saveMsg}</p>}
        </div>

        {/* Live preview */}
        <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)', minHeight: 420 }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <span className="text-xs font-semibold" style={{ color: 'var(--c-text-sub)' }}>Vista previa</span>
            <div className="flex ml-auto gap-1">
              {(['appointment', 'lead'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setPreviewType(t)}
                  className="text-xs font-semibold px-2.5 py-1 rounded-md transition-colors"
                  style={{
                    background: previewType === t ? 'rgba(108,59,255,0.15)' : 'transparent',
                    color:      previewType === t ? '#9B6DFF' : 'var(--c-text-sub)',
                    border:     previewType === t ? '1px solid rgba(108,59,255,0.3)' : '1px solid transparent',
                  }}
                >
                  {t === 'appointment' ? 'Cita' : 'Lead'}
                </button>
              ))}
            </div>
          </div>
          <iframe
            ref={iframeRef}
            key={`${previewType}-${previewKey}`}
            src={`/api/portal/${token}/email-preview?type=${previewType}`}
            style={{ flex: 1, border: 'none', width: '100%', minHeight: 380 }}
            title="Vista previa de correo"
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Info box */}
      <div className="flex gap-3 rounded-xl p-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
        <AlertCircle size={15} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-sub)' }}>
          Los correos se envían automáticamente cuando un cliente deja su email durante una llamada y se agenda una cita o se registra un lead.
          La estructura del correo es fija; solo se personaliza la marca.
        </p>
      </div>

    </div>
  );
}
