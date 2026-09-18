'use client';
import { useState } from 'react';

export type IndustryKey =
  | 'tortilleria_abarrotes'
  | 'construccion'
  | 'despacho_contable'
  | 'servicios_profesionales'
  | 'otro';

export interface CallbackRequestPayload {
  phone: string;
  industry: IndustryKey;
  consent: true;
}

type Stage = 'form' | 'otp' | 'dialing' | 'fallback' | 'error';

interface Props {
  onSubmit: (data: CallbackRequestPayload) => Promise<{ ok: boolean; requestId?: string; message?: string }>;
}

const INDUSTRIES: { key: IndustryKey; label: string }[] = [
  { key: 'tortilleria_abarrotes', label: 'Tortillería, abarrotes o reparto' },
  { key: 'construccion', label: 'Constructora u obra' },
  { key: 'despacho_contable', label: 'Despacho contable o de facturación' },
  { key: 'servicios_profesionales', label: 'Servicios profesionales' },
  { key: 'otro', label: 'Otro' },
];

const MX_PHONE_RE = /^[1-9]\d{9}$/;

export default function CallbackForm({ onSubmit }: Props) {
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState<IndustryKey>('tortilleria_abarrotes');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState<Stage>('form');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!MX_PHONE_RE.test(phone)) {
      setError('Teléfono no válido. Escribe los 10 dígitos sin espacios ni guiones.');
      return;
    }
    setSending(true);
    const res = await onSubmit({ phone, industry, consent: true });
    setSending(false);
    if (res.ok && res.requestId) {
      setRequestId(res.requestId);
      setStage('otp');
    } else {
      setError(res.message ?? 'No pudimos procesar tu solicitud.');
    }
  }

  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerifying(true);
    try {
      const res = await fetch('/api/landing/callback-verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requestId, code: otpCode }),
      });
      const body = await res.json();
      if (body.ok && body.callStatus === 'dialing') {
        setStage('dialing');
      } else if (body.ok && body.callStatus === 'fallback_manual') {
        setStage('fallback');
      } else {
        setError(body.error ?? 'Código incorrecto. Inténtalo de nuevo.');
      }
    } catch {
      setError('Error de red. Inténtalo de nuevo.');
    } finally {
      setVerifying(false);
    }
  }

  if (stage === 'dialing') {
    return (
      <section className="py-24 px-6 bg-[#FAFBFF]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-2xl font-medium text-[#1A0A3B]">
            Nia te está llamando ahora. Contesta al +52&nbsp;{phone.slice(0, 2)} {phone.slice(2, 6)} {phone.slice(6)}.
          </p>
          <p className="mt-4 text-sm text-gray-600">
            La llamada dura unos 2 minutos. Nia te va a preguntar sobre tu negocio para mostrarte cómo trabajaría contigo.
          </p>
        </div>
      </section>
    );
  }

  if (stage === 'fallback') {
    return (
      <section className="py-24 px-6 bg-[#FAFBFF]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-2xl font-medium text-[#1A0A3B]">
            Se nos complicó llamarte de forma automática. Te llamamos en menos de 30 minutos.
          </p>
          <p className="mt-4 text-sm text-gray-600">
            Quedamos pendientes contigo. Si prefieres, escribe a hola@centinelia.mx.
          </p>
        </div>
      </section>
    );
  }

  if (stage === 'otp') {
    return (
      <section className="py-24 px-6 bg-[#FAFBFF]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-4">
            Te mandamos un código por SMS
          </h2>
          <p className="text-gray-600 mb-8">
            Escribe el código de 6 dígitos que te enviamos al +52 {phone.slice(0, 2)} {phone.slice(2, 6)} {phone.slice(6)}.
          </p>
          <form onSubmit={handleOtpVerify} className="flex flex-col gap-4">
            <label className="text-left">
              <span className="text-sm font-medium text-[#1A0A3B]">Código de verificación</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="mt-1 w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-[#6C3BFF] text-center text-2xl tracking-widest"
                autoComplete="one-time-code"
              />
            </label>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={verifying || otpCode.length < 6}
              className="mt-2 px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] disabled:opacity-50 transition"
            >
              {verifying ? 'Verificando...' : 'Verificar código'}
            </button>
          </form>
        </div>
      </section>
    );
  }

  // stage === 'form' (default)
  return (
    <section className="py-24 px-6 bg-[#FAFBFF]">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-4">
          En menos de 60 segundos, uno de nuestros empleados digitales te llama.
        </h2>
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <label className="text-left">
            <span className="text-sm font-medium text-[#1A0A3B]">Tu teléfono</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="8112345678"
              className="mt-1 w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-[#6C3BFF]"
              maxLength={10}
            />
          </label>
          <label className="text-left">
            <span className="text-sm font-medium text-[#1A0A3B]">Tu tipo de negocio</span>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value as IndustryKey)}
              className="mt-1 w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:border-[#6C3BFF]"
            >
              {INDUSTRIES.map((i) => (
                <option key={i.key} value={i.key}>{i.label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3 text-left text-sm text-gray-700 mt-2">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              Autorizo que Centinelia me contacte por teléfono. Ver <a href="/privacidad-datos" className="text-[#6C3BFF] underline">aviso de privacidad</a>.
            </span>
          </label>
          {consent && (
            <button
              type="submit"
              disabled={sending}
              className="mt-4 px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] disabled:opacity-50 transition"
            >
              {sending ? 'Enviando...' : 'Quiero que me llame Nia ahora'}
            </button>
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </form>
        <p className="mt-6 text-sm text-gray-600 max-w-lg mx-auto">
          Vas a hablar con Nia. Va a durar unos 2 minutos. Te va a preguntar sobre tu negocio para mostrarte cómo trabajaría contigo.
        </p>
      </div>
    </section>
  );
}
