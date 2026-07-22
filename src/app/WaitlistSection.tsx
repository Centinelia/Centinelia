'use client';

import { useState } from 'react';
import AnimatedSection from './AnimatedSection';
import { PhoneOutgoing } from 'lucide-react';

const C = {
  bg:       '#FAFBFF',
  bgAlt:    '#F4F0FF',
  surface:  '#FFFFFF',
  border:   'rgba(108,59,255,0.1)',
  border2:  'rgba(108,59,255,0.19)',
  text:     '#1A0A3B',
  textSub:  'rgba(26,10,59,0.55)',
  textMute: 'rgba(26,10,59,0.38)',
  accent:   '#6C3BFF',
  accentLt: '#9B6DFF',
};

const ITEMS = [
  {
    icon:  <PhoneOutgoing size={22} color={C.accent} />,
    title: 'Llamadas de salida automatizadas',
    desc:  'Outbound: tu agente llama a tus clientes para confirmar citas, hacer seguimiento o recordarles un pedido.',
  },
];

export default function WaitlistSection() {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const trimmed = email.trim();
    if (!trimmed) { setError('Ingresa tu email.'); return; }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!valid) { setError('El email no parece válido.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/waitlist', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json();
        setError(data.error ?? 'Ocurrió un error. Intenta de nuevo.');
      }
    } catch {
      setError('Ocurrió un error. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      style={{
        background: C.bgAlt,
        borderTop:  `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-20 sm:py-28">

        <AnimatedSection className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C.accent }}>
            Próximamente
          </p>
          <h2
            className="font-bold tracking-tight mb-4"
            style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: C.text }}
          >
            Lo que viene
          </h2>
          <p className="max-w-xl mx-auto text-base whitespace-nowrap" style={{ color: C.textSub }}>
            Centinelia sigue creciendo. Estas son las funciones que estamos construyendo.
          </p>
        </AnimatedSection>

        {/* Feature cards */}
        <div className="grid grid-cols-1 gap-5 mb-12 max-w-sm mx-auto w-full">
          {ITEMS.map((item) => (
            <AnimatedSection key={item.title}>
              <div
                className="rounded-2xl p-6 h-full flex flex-col gap-4"
                style={{
                  background:  C.surface,
                  border:      `1px solid ${C.border2}`,
                }}
              >
                {/* Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      background: 'rgba(108,59,255,0.08)',
                      color:      C.accentLt,
                      border:     `1px solid rgba(108,59,255,0.15)`,
                    }}
                  >
                    <span
                      style={{
                        display:      'inline-block',
                        width:        6,
                        height:       6,
                        borderRadius: '50%',
                        background:   C.accentLt,
                        flexShrink:   0,
                      }}
                    />
                    En desarrollo
                  </span>
                </div>

                {/* Icon + content */}
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{
                    width:      44,
                    height:     44,
                    background: 'rgba(108,59,255,0.08)',
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <h3 className="font-semibold mb-1.5 text-base" style={{ color: C.text }}>
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: C.textSub }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Waitlist CTA */}
        <AnimatedSection>
          <div
            className="rounded-2xl p-6 sm:p-8 text-center"
            style={{
              background: C.surface,
              border:     `1px solid ${C.border2}`,
            }}
          >
            <p className="font-semibold mb-1" style={{ color: C.text }}>
              ¿Te interesa alguna de estas funciones?
            </p>
            <p className="text-sm mb-6" style={{ color: C.textSub }}>
              Te avisamos cuando estén listas.
            </p>

            {done ? (
              <p
                className="text-sm font-medium py-3"
                style={{ color: C.accent }}
              >
                Listo, te avisamos cuando esté disponible.
              </p>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
                noValidate
              >
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  disabled={loading}
                  className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background:  'rgba(108,59,255,0.05)',
                    border:      `1px solid ${error ? '#DC2626' : C.border2}`,
                    color:       C.text,
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
                  style={{
                    background: `linear-gradient(135deg, ${C.accent}, ${C.accentLt})`,
                    color:      '#fff',
                  }}
                >
                  {loading ? 'Enviando…' : 'Avisarme'}
                </button>
              </form>
            )}

            {error && (
              <p className="text-xs mt-2" style={{ color: '#DC2626' }}>
                {error}
              </p>
            )}
          </div>
        </AnimatedSection>

      </div>
    </section>
  );
}
