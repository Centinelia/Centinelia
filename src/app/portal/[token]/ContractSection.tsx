'use client';

import { useState } from 'react';
import { FileText, CheckCircle, ExternalLink, ChevronDown } from 'lucide-react';

interface Props {
  token: string;
  businessName: string;
  signedAt: string | null;
  contractPreviewUrl: string;
}

export default function ContractSection({ token, businessName, signedAt, contractPreviewUrl }: Props) {
  const [open, setOpen]         = useState(!signedAt);
  const [checked, setChecked]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(!!signedAt);
  const [signedDate, setSignedDate] = useState<string | null>(
    signedAt ? new Date(signedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null
  );

  const handleSign = async () => {
    if (!checked || loading) return;
    setLoading(true);
    const res = await fetch('/api/portal/sign-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      const now = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
      setDone(true);
      setSignedDate(now);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: `1px solid ${done ? 'rgba(34,197,94,0.25)' : 'var(--c-border)'}`, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          {done
            ? <CheckCircle size={14} color="#22c55e" />
            : <FileText size={14} style={{ color: '#f59e0b' }} />
          }
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
            Contrato de servicios
          </span>
          {done
            ? <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                Firmado
              </span>
            : <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                Pendiente
              </span>
          }
        </div>
        <ChevronDown size={14} className="transition-transform" style={{ color: 'var(--c-text-3)', transform: open ? 'rotate(180deg)' : undefined }} />
      </button>

      {open && (
        <div className="px-5 pb-5 flex flex-col gap-4" style={{ borderTop: '1px solid var(--c-divider)' }}>
          {done ? (
            /* Signed state */
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <CheckCircle size={16} color="#22c55e" className="flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium" style={{ color: '#16a34a' }}>Contrato firmado digitalmente</p>
                  {signedDate && <p className="text-xs mt-0.5" style={{ color: '#15803d' }}>Aceptado el {signedDate} por {businessName}</p>}
                </div>
              </div>
              <a
                href={contractPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--c-surface-2)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
              >
                <ExternalLink size={13} />
                Ver e imprimir contrato
              </a>
            </div>
          ) : (
            /* Unsigned state */
            <div className="flex flex-col gap-4 pt-4">
              <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                Por favor revisa tu contrato de servicios Centinelia antes de firmar.
                El contrato detalla los servicios incluidos y no incluidos en tu plan, precio mensual y términos generales.
              </p>

              <a
                href={contractPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
              >
                <ExternalLink size={13} />
                Ver contrato completo
              </a>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => setChecked(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-purple-600 flex-shrink-0"
                />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                  He leído y acepto los términos y condiciones del contrato de servicios Centinelia para <strong style={{ color: 'var(--c-text)' }}>{businessName}</strong>.
                </span>
              </label>

              <button
                onClick={handleSign}
                disabled={!checked || loading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: checked ? '#6C3BFF' : 'var(--c-surface-2)',
                  color: checked ? '#fff' : 'var(--c-text-3)',
                  cursor: checked ? 'pointer' : 'not-allowed',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Firmando…' : 'Firmar contrato'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
