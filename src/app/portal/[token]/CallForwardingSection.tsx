'use client';

import { useState } from 'react';
import { Copy, Check, PhoneForwarded, Phone, Timer } from 'lucide-react';

interface Props {
  phoneNumber: string; // E.164, e.g. +528121889489
  agentName:   string;
}

type Mode = 'immediate' | 'noanswer';

const CARRIERS = [
  { id: 'telcel',   label: 'Telcel',   kind: 'gsm'   as const },
  { id: 'att',      label: 'AT&T',     kind: 'gsm'   as const },
  { id: 'movistar', label: 'Movistar', kind: 'gsm'   as const },
  { id: 'telmex',   label: 'Telmex',   kind: 'telmex' as const },
];

const MODES: Array<{ id: Mode; label: string; help: string }> = [
  {
    id: 'immediate',
    label: 'Primer timbre',
    help: 'Tu empleado contesta inmediatamente. El teléfono del negocio no suena.',
  },
  {
    id: 'noanswer',
    label: 'Después de 20 segundos',
    help: 'Suena primero en el negocio. Si nadie contesta a los 20 segundos, entra tu empleado.',
  },
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

interface Codes {
  activate: string;
  cancel:   string;
}

function codesFor(carrierKind: 'gsm' | 'telmex', mode: Mode, num10: string): Codes {
  if (carrierKind === 'gsm') {
    return mode === 'immediate'
      ? { activate: `*21*${num10}#`,         cancel: '##21#' }
      : { activate: `*61*${num10}*11*20#`,   cancel: '##61#' };
  }
  return mode === 'immediate'
    ? { activate: `*68 ${num10} #`, cancel: '#68#' }
    : { activate: `*67 ${num10} #`, cancel: '#67#' };
}

export default function CallForwardingSection({ phoneNumber, agentName }: Props) {
  const [mode,    setMode]    = useState<Mode>('immediate');
  const [carrier, setCarrier] = useState('telcel');
  const [copied,  setCopied]  = useState<string | null>(null);

  const num10        = national(phoneNumber);
  const numDisplay   = formatMx(phoneNumber);
  const carrierObj   = CARRIERS.find(c => c.id === carrier) ?? CARRIERS[0];
  const codes        = codesFor(carrierObj.kind, mode, num10);
  const modeObj      = MODES.find(m => m.id === mode)!;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Mode selector */}
      <div>
        <p className="text-xs mb-2.5" style={{ color: '#6B6480' }}>
          ¿Cuándo quieres que conteste {agentName}?
        </p>
        <div className="flex gap-2 flex-wrap mb-2">
          {MODES.map(m => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                aria-pressed={active}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active ? 'rgba(108,59,255,0.1)' : '#FAFAFB',
                  color:      active ? '#6C3BFF' : '#6B6480',
                  border:     `1px solid ${active ? 'rgba(108,59,255,0.3)' : '#E8E3F5'}`,
                }}>
                {m.id === 'immediate'
                  ? <PhoneForwarded size={12} />
                  : <Timer size={12} />}
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
          {modeObj.help}
        </p>
      </div>

      {/* Número Centinelia */}
      <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-0.5"
            style={{ color: '#9B8FB5' }}>
            Número de {agentName}
          </p>
          <p className="text-lg font-bold font-mono tracking-wide"
            style={{ color: '#1A0A3B' }}>
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
        <p className="text-xs mb-2.5" style={{ color: '#6B6480' }}>
          Selecciona la operadora de tu número actual:
        </p>
        <div className="flex gap-2 flex-wrap mb-4">
          {CARRIERS.map(c => (
            <button
              key={c.id}
              onClick={() => setCarrier(c.id)}
              aria-pressed={carrier === c.id}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: carrier === c.id ? 'rgba(108,59,255,0.1)' : '#FAFAFB',
                color:      carrier === c.id ? '#6C3BFF' : '#6B6480',
                border:     `1px solid ${carrier === c.id ? 'rgba(108,59,255,0.3)' : '#E8E3F5'}`,
              }}>
              {c.label}
            </button>
          ))}
        </div>

        {carrierObj.kind === 'gsm' ? (
          <div className="flex flex-col gap-3">
            {/* Activar */}
            <div className="rounded-xl p-4"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-2.5"
                style={{ color: '#9B8FB5' }}>
                Activar desvío
              </p>
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <PhoneForwarded size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                  <code className="text-base font-mono font-bold tracking-wider truncate"
                    style={{ color: '#1A0A3B' }}>
                    {codes.activate}
                  </code>
                </div>
                <button
                  onClick={() => copy(codes.activate, 'activate')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }}>
                  {copied === 'activate' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'activate' ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                Abre el marcador de tu celular, escribe el código y presiona llamar. Escucharás un tono de confirmación.
              </p>
            </div>

            {/* Cancelar */}
            <div className="rounded-xl p-4"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-2.5"
                style={{ color: '#9B8FB5' }}>
                Cancelar desvío (cuando lo necesites)
              </p>
              <div className="flex items-center justify-between gap-3">
                <code className="text-base font-mono font-bold tracking-wider"
                  style={{ color: '#6B6480' }}>
                  {codes.cancel}
                </code>
                <button
                  onClick={() => copy(codes.cancel, 'cancel')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                  style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                  {copied === 'cancel' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'cancel' ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Telmex fijo */
          <div className="flex flex-col gap-3">
            <div className="rounded-xl p-4"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <div className="flex items-center gap-2 mb-3">
                <Phone size={13} style={{ color: '#6B6480', flexShrink: 0 }} />
                <p className="text-xs font-medium" style={{ color: '#1A0A3B' }}>
                  Desde el teléfono fijo del negocio, descuelga y marca:
                </p>
              </div>

              {/* Activar */}
              <div className="rounded-lg p-3 mb-2.5"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2"
                  style={{ color: '#9B8FB5' }}>
                  Activar desvío
                </p>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <PhoneForwarded size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
                    <code className="text-base font-mono font-bold tracking-wider truncate"
                      style={{ color: '#1A0A3B' }}>
                      {codes.activate}
                    </code>
                  </div>
                  <button
                    onClick={() => copy(codes.activate.replace(/\s/g, ''), 'activate')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                    style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.2)' }}>
                    {copied === 'activate' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'activate' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="text-[11px] mt-2" style={{ color: '#9B8FB5' }}>
                  Espera el tono de confirmación y cuelga.
                </p>
              </div>

              {/* Cancelar */}
              <div className="rounded-lg p-3"
                style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2"
                  style={{ color: '#9B8FB5' }}>
                  Cancelar desvío (cuando lo necesites)
                </p>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-base font-mono font-bold tracking-wider"
                    style={{ color: '#6B6480' }}>
                    {codes.cancel}
                  </code>
                  <button
                    onClick={() => copy(codes.cancel, 'cancel')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                    style={{ background: '#ffffff', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                    {copied === 'cancel' ? <Check size={12} /> : <Copy size={12} />}
                    {copied === 'cancel' ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
              Si al marcar el código no escuchas tono de confirmación, significa que Telmex no tiene prendido el servicio de desvío en tu línea. Llama al <strong>050</strong> desde la misma línea del negocio y pide activar &ldquo;desvío de llamadas&rdquo; al número {numDisplay}.
            </p>
          </div>
        )}
      </div>

      <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
        Una vez activo, las llamadas a tu número se atienden según el modo que elegiste arriba.
        Puedes cambiarlo o cancelarlo en cualquier momento.
      </p>
    </div>
  );
}
