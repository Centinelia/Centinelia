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

interface Props {
  onSubmit: (data: CallbackRequestPayload) => Promise<{ ok: boolean; message?: string }>;
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
  const [sent, setSent] = useState<string | null>(null);

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
    if (res.ok) {
      setSent(res.message ?? 'Recibido. En breve te llamamos.');
    } else {
      setError(res.message ?? 'No pudimos procesar tu solicitud.');
    }
  }

  if (sent) {
    return (
      <section className="py-24 px-6 bg-[#FAFBFF]">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-2xl font-medium text-[#1A0A3B]">{sent}</p>
        </div>
      </section>
    );
  }

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
              Autorizo que Centinelia me contacte por teléfono. Ver <a href="/privacidad" className="text-[#6C3BFF] underline">aviso de privacidad</a>.
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
