'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';
import LandingNav      from '@/app/LandingNav';
import AnimatedSection from '@/app/AnimatedSection';
import IndustryFooter  from '@/app/industrias/IndustryFooter';

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.12)',
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  accent:  '#6C3BFF',
};

const INTEGRACIONES_DISPONIBLES = [
  'QuickBooks',
  'Notion',
  'Google Sheets',
  'Google Drive',
  'Dropbox',
  'Google Calendar',
  'Mercado Libre',
  'WhatsApp',
  'Correo (Gmail / Outlook)',
  'CRM propio (API)',
  'ERP propio (SAT / CONTPAQi / Aspel)',
  'Otro',
];

const TONOS = [
  { id: 'formal',        label: 'Formal',                desc: 'Trato de "usted", tono corporativo' },
  { id: 'cercano',       label: 'Cercano',               desc: 'Trato de "tú", cálido y amigable' },
  { id: 'ejecutivo',     label: 'Ejecutivo',             desc: 'Directo al punto, sin rodeos' },
  { id: 'tecnico',       label: 'Técnico',               desc: 'Preciso, con lenguaje del sector' },
];

export default function PedirRolPage() {
  const [businessName,       setBusinessName]       = useState('');
  const [contactName,        setContactName]        = useState('');
  const [contactEmail,       setContactEmail]       = useState('');
  const [contactWhatsapp,    setContactWhatsapp]    = useState('');
  const [rolImaginado,       setRolImaginado]       = useState('');
  const [funcionesEsperadas, setFuncionesEsperadas] = useState('');
  const [tonoDeseado,        setTonoDeseado]        = useState<string | null>(null);
  const [integraciones,      setIntegraciones]      = useState<string[]>([]);
  const [busy,               setBusy]               = useState(false);
  const [ok,                 setOk]                 = useState(false);
  const [error,              setError]              = useState<string | null>(null);

  function toggleIntegracion(name: string) {
    setIntegraciones(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/pedir-rol', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          business_name:        businessName.trim(),
          contact_name:         contactName.trim(),
          contact_email:        contactEmail.trim(),
          contact_whatsapp:     contactWhatsapp.trim() || null,
          rol_imaginado:        rolImaginado.trim(),
          funciones_esperadas:  funcionesEsperadas.trim(),
          tono_deseado:         tonoDeseado,
          integraciones,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? 'No pudimos enviar tu solicitud.'); setBusy(false); return; }
      setOk(true);
    } catch {
      setError('Falló el envío. Intenta de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <>
        <LandingNav />
        <main style={{ background: C.bg, minHeight: '100vh', paddingTop: 80 }}>
          <section style={{ padding: 'clamp(80px, 12vw, 140px) clamp(20px, 5vw, 48px)' }}>
            <div className="max-w-2xl mx-auto text-center">
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(108,59,255,0.12)',
                border: `1px solid ${C.accent}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <CheckCircle size={28} style={{ color: C.accent }} />
              </div>
              <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 800, color: C.text, marginBottom: 16, letterSpacing: '-0.025em' }}>
                Recibimos tu propuesta.
              </h1>
              <p style={{ color: C.textSub, fontSize: '1.05rem', lineHeight: 1.65, marginBottom: 40, maxWidth: 520, margin: '0 auto 40px' }}>
                Vamos a revisar el rol que necesitas y te contactamos en los próximos días hábiles. Si es viable, lo diseñamos y lo sumamos al roster oficial.
              </p>
              <Link
                href="/empleados"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                style={{ background: C.accent, color: '#fff' }}
              >
                <ArrowLeft size={13} /> Volver al equipo
              </Link>
            </div>
          </section>
          <IndustryFooter />
        </main>
      </>
    );
  }

  return (
    <>
      <LandingNav />
      <main style={{ background: C.bg, minHeight: '100vh', paddingTop: 80 }}>

        {/* Hero */}
        <section style={{ padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 48px) clamp(32px, 5vw, 56px)' }}>
          <div className="max-w-3xl mx-auto text-center">
            <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: 14 }}>
              Propón un rol nuevo
            </p>
            <h1 style={{
              fontSize: 'clamp(2.2rem, 5vw, 3.6rem)', fontWeight: 800,
              color: C.text, lineHeight: 1.05, letterSpacing: '-0.03em',
              marginBottom: 20,
            }}>
              ¿Necesitas un empleado que no está en el roster?
            </h1>
            <p style={{ color: C.textSub, fontSize: 'clamp(1rem, 1.8vw, 1.15rem)', lineHeight: 1.65, maxWidth: 620, margin: '0 auto' }}>
              Cada especialista del equipo nació de una necesidad real. Cuéntanos qué rol te falta, qué haría y con qué sistemas trabajaría. Si es viable, lo diseñamos y lo sumamos al roster oficial.
            </p>
          </div>
        </section>

        {/* Form */}
        <section style={{ paddingBottom: 96 }}>
          <AnimatedSection>
            <form
              onSubmit={submit}
              className="max-w-2xl mx-auto"
              style={{
                background: '#fff', border: `1px solid ${C.border}`,
                borderRadius: 24, padding: 'clamp(28px, 4vw, 44px)',
                boxShadow: '0 12px 40px -18px rgba(26,10,59,0.15)',
                marginInline: 20,
              }}
            >
              {/* Sección 1: Negocio + Contacto */}
              <FieldLabel>Nombre del negocio *</FieldLabel>
              <Input value={businessName} onChange={setBusinessName} placeholder="Ej. Aire Acondicionado Proyectos" required />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div>
                  <FieldLabel>Tu nombre *</FieldLabel>
                  <Input value={contactName} onChange={setContactName} placeholder="María Pérez" required />
                </div>
                <div>
                  <FieldLabel>Tu correo *</FieldLabel>
                  <Input type="email" value={contactEmail} onChange={setContactEmail} placeholder="maria@empresa.com" required />
                </div>
              </div>

              <FieldLabel style={{ marginTop: 16 }}>WhatsApp (opcional)</FieldLabel>
              <Input value={contactWhatsapp} onChange={setContactWhatsapp} placeholder="+52 811 234 5678" />

              {/* Divider */}
              <div style={{ margin: '28px 0', height: 1, background: C.border }} />

              {/* Sección 2: El rol */}
              <FieldLabel>¿Qué rol imaginas? *</FieldLabel>
              <Input value={rolImaginado} onChange={setRolImaginado} placeholder="Ej. Coordinador de flotilla, Facturista de tortillería, Reclutador especializado" required />
              <p style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>
                En una línea. Piensa en qué le dirías a un humano que estás contratando.
              </p>

              <FieldLabel style={{ marginTop: 16 }}>¿Qué haría este empleado día a día? *</FieldLabel>
              <textarea
                value={funcionesEsperadas}
                onChange={e => setFuncionesEsperadas(e.target.value)}
                required
                rows={5}
                placeholder="Describe las tareas concretas. Ej: recibe reportes de fallas por WhatsApp, los captura en el sistema, avisa al técnico de guardia, hace seguimiento hasta cerrar el caso, envía resumen semanal al dueño."
                style={{
                  width: '100%', padding: '12px 14px',
                  border: `1px solid ${C.border}`, borderRadius: 12,
                  fontSize: 14, background: '#fff', color: C.text,
                  outline: 'none', resize: 'vertical', minHeight: 100,
                  fontFamily: 'inherit',
                }}
              />

              <FieldLabel style={{ marginTop: 16 }}>Tono deseado</FieldLabel>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mt-1">
                {TONOS.map(t => {
                  const selected = tonoDeseado === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTonoDeseado(selected ? null : t.id)}
                      style={{
                        padding: '10px 12px', textAlign: 'left', borderRadius: 10,
                        border: selected ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
                        background: selected ? 'rgba(108,59,255,0.06)' : '#fff',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? C.accent : C.text, marginBottom: 2 }}>{t.label}</div>
                      <div style={{ fontSize: 10.5, color: C.textSub, lineHeight: 1.35 }}>{t.desc}</div>
                    </button>
                  );
                })}
              </div>

              <FieldLabel style={{ marginTop: 20 }}>¿Con qué sistemas necesita integrarse?</FieldLabel>
              <div className="flex flex-wrap gap-2 mt-1">
                {INTEGRACIONES_DISPONIBLES.map(name => {
                  const selected = integraciones.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleIntegracion(name)}
                      style={{
                        padding: '6px 12px', borderRadius: 999,
                        fontSize: 12, fontWeight: 500,
                        border: selected ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`,
                        background: selected ? 'rgba(108,59,255,0.08)' : '#fff',
                        color: selected ? C.accent : C.textSub,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  marginTop: 20, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  color: '#b91c1c', fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={busy}
                className="w-full mt-8 py-3.5 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${C.accent}, #9B6DFF)` }}
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Enviando...</> : <>Enviar propuesta <ArrowRight size={14} /></>}
              </button>

              <p style={{ fontSize: 11, color: C.textSub, marginTop: 14, textAlign: 'center', lineHeight: 1.5 }}>
                Revisamos cada propuesta manualmente. Si el rol tiene sentido para más negocios, lo diseñamos y aparece en el roster oficial para todos.
              </p>
            </form>
          </AnimatedSection>
        </section>

        <IndustryFooter />
      </main>
    </>
  );
}

// ── Reusable field components ────────────────────────────────────────────────
function FieldLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 6, ...style }}>
      {children}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', required,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      style={{
        width: '100%', padding: '11px 14px',
        border: `1px solid ${C.border}`, borderRadius: 10,
        fontSize: 14, background: '#fff', color: C.text,
        outline: 'none',
      }}
    />
  );
}
