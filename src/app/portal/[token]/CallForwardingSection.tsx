'use client';

import { useState } from 'react';
import { Copy, Check, PhoneForwarded, Phone } from 'lucide-react';

interface Props {
  phoneNumber: string; // E.164, e.g. +528121889489
  agentName:   string;
}

const CARRIERS = [
  { id: 'telcel',   label: 'Telcel',   ussd: true  },
  { id: 'att',      label: 'AT&T',     ussd: true  },
  { id: 'movistar', label: 'Movistar', ussd: true  },
  { id: 'telmex',   label: 'Telmex',   ussd: false },
];

function formatMx(e164: string): string {
  const d = e164.replace(/^\+52/, '').replace(/\D/g, '');
  return d.length === 10
    ? `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`
    : e164;
}

function national(e164: string): string {
  return e164.replace(/^\+52/, '').replace(/\D/g, '');
}

export default function CallForwardingSection({ phoneNumber, agentName }: Props) {
  const [carrier, setCarrier]     = useState('telcel');
  const [copied,  setCopied]      = useState<string | null>(null);

  const num10       = national(phoneNumber);
  const numDisplay  = formatMx(phoneNumber);
  const ussdCode    = `*21*${num10}#`;
  const cancelCode  = '##21#';
  const isUssd      = CARRIERS.find(c => c.id === carrier)?.ussd ?? true;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Número Centinelia */}
      <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-0.5"
            style={{ color: 'var(--c-text-4)' }}>
            Número de {agentName}
          </p>
          <p className="text-lg font-bold font-mono tracking-wide"
            style={{ color: 'var(--c-text)' }}>
            {numDisplay}
          </p>
        </div>
        <button
          onClick={() => copy(num10, 'num')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}>
          {copied === 'num' ? <Check size={12} /> : <Copy size={12} />}
          {copied === 'num' ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      {/* Carrier tabs */}
      <div>
        <p className="text-xs mb-2.5" style={{ color: 'var(--c-text-3)' }}>
          Selecciona la operadora de tu número actual:
        </p>
        <div className="flex gap-2 flex-wrap mb-4">
          {CARRIERS.map(c => (
            <button
              key={c.id}
              onClick={() => setCarrier(c.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: carrier === c.id ? 'rgba(108,59,255,0.1)' : 'var(--c-surface-2)',
                color:      carrier === c.id ? '#6C3BFF' : 'var(--c-text-3)',
                border:     `1px solid ${carrier === c.id ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`,
              }}>
              {c.label}
            </button>
          ))}
        </div>

        {isUssd ? (
          <div className="flex flex-col gap-3">
            {/* Activar */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-2.5"
                style={{ color: 'var(--c-text-4)' }}>
                Activar desvío
              </p>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <PhoneForwarded size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <code className="text-base font-mono font-bold tracking-wider truncate"
                    style={{ color: 'var(--c-text)' }}>
                    {ussdCode}
                  </code>
                </div>
                <button
                  onClick={() => copy(ussdCode, 'ussd')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }}>
                  {copied === 'ussd' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'ussd' ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                Abre el marcador de tu celular, escribe el código y presiona llamar. Escucharás un tono de confirmación.
              </p>
            </div>

            {/* Cancelar */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-2.5"
                style={{ color: 'var(--c-text-4)' }}>
                Cancelar desvío (cuando lo necesites)
              </p>
              <div className="flex items-center justify-between gap-3">
                <code className="text-base font-mono font-bold tracking-wider"
                  style={{ color: 'var(--c-text-3)' }}>
                  {cancelCode}
                </code>
                <button
                  onClick={() => copy(cancelCode, 'cancel')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                  {copied === 'cancel' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'cancel' ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Telmex fijo */
          <div className="rounded-xl p-4"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Phone size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
              <p className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>
                Los teléfonos fijos Telmex se configuran por teléfono:
              </p>
            </div>
            <ol className="flex flex-col gap-2.5">
              {[
                'Llama al 800-123-2222 (atención a clientes Telmex)',
                'Solicita activar "desvío de llamadas incondicional"',
                `Proporciona el número destino: ${num10}`,
                'El desvío se activa en máximo 24 horas hábiles',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs"
                  style={{ color: 'var(--c-text-3)' }}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
        Una vez activo, todas las llamadas a tu número serán atendidas por {agentName} automáticamente.
        Puedes cancelar el desvío en cualquier momento.
      </p>
    </div>
  );
}
