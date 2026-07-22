'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Building2, Users, Phone, Mail, ChevronDown } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import IndustryFooter from '@/app/industrias/IndustryFooter';
import AnimatedSection from '@/app/AnimatedSection';

const INDUSTRIAS = [
  'Salud', 'Restaurantes / Alimentos', 'Retail / Comercio', 'Bienes Raíces',
  'Educación', 'Transporte / Logística', 'Legal / Contabilidad',
  'Tecnología', 'Manufactura', 'Servicios profesionales', 'Otro',
];

const EMPLEADOS_OPTS = [
  { value: '1',  label: '1 empleado' },
  { value: '2-3', label: '2 a 3 empleados' },
  { value: '4-6', label: '4 a 6 empleados' },
  { value: '7+',  label: '7 o más' },
];

const BENEFICIOS = [
  'Onboarding personalizado con tu equipo',
  'Oficina digital completa en menos de 48 h',
  'Soporte prioritario',
  'Precio por volumen',
];

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.58)',
  border:  'rgba(108,59,255,0.13)',
  accent:  '#6C3BFF',
  bg:      '#FAFBFF',
};

function FieldLabel({ children, required }: { children: string; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: C.textSub, marginBottom: 6, letterSpacing: '0.04em' }}>
      {children}{required && <span style={{ color: C.accent }}> *</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: '#fff', color: C.text,
  fontSize: '0.9rem', outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236C3BFF' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 38,
};

export default function CotizarPage() {
  const [form, setForm] = useState({
    empresa: '', industria: '', nombre: '', apellido: '',
    correo: '', telefono: '', empleados: '', mensaje: '',
  });
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/cotizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, overflowX: 'hidden' }}>
      <LandingNav />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(140deg, #1A0A3B 0%, #0D0520 100%)',
        paddingTop: 120, paddingBottom: 72,
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 700, height: 600, top: -100, left: '50%', transform: 'translateX(-50%)',
          background: 'radial-gradient(circle, rgba(108,59,255,0.2) 0%, transparent 65%)', pointerEvents: 'none' }} />

        <div className="relative max-w-2xl mx-auto px-5 sm:px-8" style={{ zIndex: 1 }}>
          <p style={{ color: 'rgba(155,109,255,0.85)', fontSize: '0.68rem', fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18 }}>
            Para equipos
          </p>
          <h1 style={{ color: '#fff', fontWeight: 800,
            fontSize: 'clamp(2.2rem, 5.5vw, 4rem)', lineHeight: 1.06, marginBottom: 20, letterSpacing: '-0.025em' }}>
            Diseña tu oficina<br />digital a la medida
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.48)', fontSize: 'clamp(0.95rem, 2vw, 1.1rem)',
            lineHeight: 1.75, maxWidth: 480, margin: '0 auto 36px' }}>
            Múltiples empleados, sucursales, integraciones y flujos personalizados. Cuéntanos lo que necesitas y armamos la propuesta.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {BENEFICIOS.map(b => (
              <span key={b} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                <Check size={11} color="#9B6DFF" /> {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FORM ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-16 sm:py-20">

          {status === 'success' ? (
            <AnimatedSection>
              <div className="rounded-2xl p-10 text-center"
                style={{ background: 'rgba(108,59,255,0.05)', border: `1px solid ${C.border}` }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'rgba(108,59,255,0.1)', border: `1px solid rgba(108,59,255,0.2)` }}>
                  <Check size={24} color={C.accent} strokeWidth={2.5} />
                </div>
                <h2 className="font-bold mb-3" style={{ fontSize: '1.5rem', color: C.text }}>
                  Solicitud recibida
                </h2>
                <p style={{ color: C.textSub, lineHeight: 1.7, maxWidth: 380, margin: '0 auto 28px' }}>
                  Te confirmamos por correo y nuestro equipo te contactará en menos de 24 horas con una propuesta personalizada.
                </p>
                <Link href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: C.accent, color: '#fff' }}>
                  Volver al inicio <ArrowRight size={13} />
                </Link>
              </div>
            </AnimatedSection>
          ) : (
            <AnimatedSection>
              <h2 className="font-bold mb-2" style={{ fontSize: 'clamp(1.3rem, 3vw, 1.8rem)', color: C.text }}>
                Cuéntanos sobre tu organización
              </h2>
              <p style={{ color: C.textSub, marginBottom: 36, lineHeight: 1.6 }}>
                Completa el formulario y te enviamos una propuesta en menos de 24 horas.
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Empresa + Industria */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <FieldLabel required>Nombre de la organización</FieldLabel>
                    <input required placeholder="Ej. Grupo Médico Torres" value={form.empresa}
                      onChange={set('empresa')} style={inputStyle} />
                  </div>
                  <div>
                    <FieldLabel>Industria</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <select value={form.industria} onChange={set('industria')} style={selectStyle}>
                        <option value="">Seleccionar</option>
                        {INDUSTRIAS.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Nombre + Apellido */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <FieldLabel required>Nombre(s)</FieldLabel>
                    <input required placeholder="Tu nombre" value={form.nombre}
                      onChange={set('nombre')} style={inputStyle} />
                  </div>
                  <div>
                    <FieldLabel required>Apellido(s)</FieldLabel>
                    <input required placeholder="Tu apellido" value={form.apellido}
                      onChange={set('apellido')} style={inputStyle} />
                  </div>
                </div>

                {/* Correo + Teléfono */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <FieldLabel required>Correo de contacto</FieldLabel>
                    <input required type="email" placeholder="correo@empresa.com" value={form.correo}
                      onChange={set('correo')} style={inputStyle} />
                  </div>
                  <div>
                    <FieldLabel required>Teléfono</FieldLabel>
                    <input required type="tel" placeholder="+52 81 0000 0000" value={form.telefono}
                      onChange={set('telefono')} style={inputStyle} />
                  </div>
                </div>

                {/* Número de empleados */}
                <div>
                  <FieldLabel required>¿Cuántos empleados digitales necesitas?</FieldLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}
                    className="sm:grid-cols-4">
                    {EMPLEADOS_OPTS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, empleados: opt.value }))}
                        style={{
                          padding: '10px 8px', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600,
                          border: `1.5px solid ${form.empleados === opt.value ? C.accent : C.border}`,
                          background: form.empleados === opt.value ? `rgba(108,59,255,0.07)` : '#fff',
                          color: form.empleados === opt.value ? C.accent : C.textSub,
                          cursor: 'pointer', transition: 'all 0.18s ease',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mensaje */}
                <div>
                  <FieldLabel>¿Algo que debamos saber?</FieldLabel>
                  <textarea
                    rows={4}
                    placeholder="Describe brevemente tu operación, integraciones que usas o necesidades específicas..."
                    value={form.mensaje}
                    onChange={set('mensaje')}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 96 }}
                  />
                </div>

                {status === 'error' && (
                  <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>
                    Algo salió mal. Escríbenos directamente a hola@centinelia.mx
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading' || !form.empleados}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.01]"
                  style={{
                    padding: '14px 32px',
                    background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
                    color: '#fff',
                    opacity: status === 'loading' || !form.empleados ? 0.6 : 1,
                    cursor: status === 'loading' || !form.empleados ? 'not-allowed' : 'pointer',
                  }}
                >
                  {status === 'loading' ? 'Enviando...' : 'Enviar solicitud'} {status !== 'loading' && <ArrowRight size={14} />}
                </button>

                <p style={{ fontSize: '0.75rem', color: C.textSub, textAlign: 'center' }}>
                  Respondemos en menos de 24 h · Sin compromiso
                </p>
              </form>
            </AnimatedSection>
          )}
        </div>
      </section>

      <IndustryFooter />
    </div>
  );
}
