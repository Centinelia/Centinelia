'use client';

import { useState, useMemo, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Check, Clock, Sparkles, Wrench, Rocket } from 'lucide-react';
import LandingNav from '@/app/LandingNav';
import IndustryFooter from '@/app/industrias/IndustryFooter';
import AnimatedSection from '@/app/AnimatedSection';
import { MEERKAT_MAP, PUBLIC_MEERKAT_ROLES, avatarImgStyle, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

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
  'Diagnóstico sin compromiso',
  'Implementación en 2 a 3 semanas',
  'Supervisión los primeros 90 días',
  'Soporte prioritario',
];

const TIMELINE_STEPS = [
  { icon: Sparkles, title: 'Diagnóstico',    desc: 'Entendemos tu operación en una llamada corta.' },
  { icon: Wrench,   title: 'Implementación', desc: 'Diseñamos, integramos con tus sistemas y probamos.' },
  { icon: Rocket,   title: 'Go-live',        desc: 'Tu empleado digital arranca con supervisión directa.' },
];

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.58)',
  textMute:'rgba(26,10,59,0.4)',
  border:  'rgba(108,59,255,0.13)',
  accent:  '#6C3BFF',
  accentLt:'#9B6DFF',
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

// Subtítulo del hero por meerkat. 1-2 frases, channel-agnostic (voz, correo y
// chat caben), estilo descriptivo de lo que hace el empleado digital. Si falta
// uno, cae al `descripcion` del role en meerkat-roles.ts.
const ROLE_SUBTITLE: Partial<Record<MeerkatRoleId, string>> = {
  nia:   'Contesta llamadas 24/7, agenda citas, toma datos del cliente y transfiere a tu equipo cuando hace falta.',
  noah:  'Trabaja tu lista de prospectos, los califica y los lleva al cierre con la persistencia de tu mejor vendedor.',
  nico:  'Busca a tus clientes con saldo pendiente, negocia planes de pago y mantiene bitácora completa de cada intento y promesa.',
  nelia: 'Resuelve dudas de tus clientes a cualquier hora: estatus de órdenes, cambios, cancelaciones. Escala a tu equipo solo lo que requiere criterio humano.',
  neo:   'Resuelve tickets técnicos recurrentes, documenta cada incidente y escala solo lo que necesita intervención humana.',
  nara:  'Coordina procesos entre áreas, da seguimiento a pendientes de todos y reporta estatus a dirección sin que nada se caiga entre sillas.',
  naia:  'Organiza vacaciones, permisos y expedientes del equipo. Lleva onboarding de nuevos y recordatorios internos sin que nadie se le escape.',
  nova:  'Despacha equipos en campo, actualiza estatus de órdenes de trabajo, coordina salidas y reporta avances al cliente final.',
  nala:  'Timbra tus CFDIs con el PAC que ya usas, archiva XML y PDF ordenadamente, y verifica datos fiscales antes de cada emisión.',
  nalu:  'Concilia tu banca contra la contabilidad todos los días, detecta diferencias y te entrega el reporte financiero cada mañana.',
  nami:  'Lleva control del inventario multi-bodega, detecta faltantes antes de que te duelan y dispara reposiciones con tus proveedores.',
};

// Resumen por rol para el sidebar sticky. Si falta uno, usamos el fallback.
// Mantener corto: 3-4 bullets máximo para que entre junto al form.
const ROLE_SUMMARY: Partial<Record<MeerkatRoleId, { subtitle: string; bullets: string[] }>> = {
  noah:  { subtitle: 'Lo que trabaja Noah',  bullets: ['Llama a tu lista de prospectos', 'Califica leads y los pasa a tu equipo', 'Agenda demos y da seguimiento', 'Reporta avances diarios al cerrador humano'] },
  nico:  { subtitle: 'Lo que trabaja Nico',  bullets: ['Llama a cuentas con saldo pendiente', 'Negocia planes de pago', 'Registra promesas y da seguimiento', 'Escala casos complejos a tu equipo'] },
  nelia: { subtitle: 'Lo que trabaja Nelia', bullets: ['Resuelve dudas de clientes 24/7', 'Consulta estatus de órdenes o cuentas', 'Escala tickets reales a tu equipo', 'Mantiene tono de tu marca'] },
  neo:   { subtitle: 'Lo que trabaja Neo',   bullets: ['Resuelve tickets técnicos recurrentes', 'Documenta incidentes y acciones', 'Monitorea tus sistemas', 'Escala al equipo humano cuando aplica'] },
  nara:  { subtitle: 'Lo que trabaja Nara',  bullets: ['Coordina procesos cross-area', 'Da seguimiento a pendientes de todos', 'Mantiene expedientes y bitácoras', 'Reporta estatus a la dirección'] },
  naia:  { subtitle: 'Lo que trabaja Naia',  bullets: ['Organiza vacaciones y permisos', 'Lleva expedientes del equipo', 'Agenda onboarding de nuevos', 'Recordatorios de cumpleaños y aniversarios'] },
  nova:  { subtitle: 'Lo que trabaja Nova',  bullets: ['Despacha equipos en campo', 'Actualiza estatus de órdenes de trabajo', 'Coordina salidas y rutas', 'Reporta avances al cliente final'] },
  nala:  { subtitle: 'Lo que trabaja Nala',  bullets: ['Timbra CFDIs con tu PAC', 'Archiva comprobantes XML y PDF', 'Verifica datos fiscales del cliente', 'Mantiene orden del catálogo de productos'] },
  nalu:  { subtitle: 'Lo que trabaja Nalú',  bullets: ['Concilia banca contra tu contabilidad', 'Detecta diferencias y los flagea', 'Entrega reporte financiero diario', 'Alerta de saldos bajos'] },
  nami:  { subtitle: 'Lo que trabaja Nami',  bullets: ['Lleva conteo de inventario multi-bodega', 'Detecta faltantes y dispara reposiciones', 'Procesa órdenes de compra y entradas', 'Reporta valor del inventario'] },
  nia:   { subtitle: 'Lo que trabaja Nia',   bullets: ['Contesta llamadas 24/7', 'Agenda citas y toma datos del cliente', 'Transfiere a tu equipo cuando aplica', 'Deja grabación y transcripción'] },
};
const ROLE_FALLBACK = { subtitle: 'Lo que incluye tu propuesta', bullets: ['Diagnóstico operativo guiado', 'Integración con los sistemas que usas', 'Automatización previa si aplica', 'Supervisión directa 90 días'] };

const DEFAULT_HERO_IMG = '/meerkats/nia.png';

export default function CotizarPage() {
  return (
    <Suspense>
      <CotizarInner />
    </Suspense>
  );
}

function CotizarInner() {
  const params = useSearchParams();
  const rawRole = params.get('role') as MeerkatRoleId | null;
  const validIds = useMemo(() => new Set(PUBLIC_MEERKAT_ROLES.map(r => r.id)), []);
  const selectedMeerkat = rawRole && validIds.has(rawRole) ? MEERKAT_MAP[rawRole] : null;
  const roleColor = selectedMeerkat?.color ?? C.accent;
  const summary = selectedMeerkat ? (ROLE_SUMMARY[selectedMeerkat.id] ?? ROLE_FALLBACK) : ROLE_FALLBACK;

  const [form, setForm] = useState({
    empresa: '', industria: '', nombre: '', apellido: '',
    correo: '', telefono: '', empleados: '', mensaje: '', preguntas: '',
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
        body: JSON.stringify({ ...form, meerkat_role_id: selectedMeerkat?.id ?? null }),
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

      {/* ── HERO 2-col con meerkat anclado al borde inferior ──────────── */}
      <section
        className="pt-28 pb-14 lg:pb-0"
        style={{
          background: 'linear-gradient(140deg, #1A0A3B 0%, #0D0520 100%)',
          position: 'relative', overflow: 'hidden',
          minHeight: 640,
        }}
      >
        {/* Orbs decorativos */}
        <div className="orb" style={{
          width: 700, height: 600, top: -140, left: '45%', transform: 'translateX(-50%)',
          background: `radial-gradient(circle, ${roleColor}2e 0%, transparent 65%)`,
          pointerEvents: 'none',
          ['--orb-dur' as string]: '14s',
        }} />
        <div className="orb" style={{
          width: 300, height: 300, top: 180, right: '12%',
          background: 'radial-gradient(circle, rgba(155,109,255,0.14) 0%, transparent 65%)',
          pointerEvents: 'none',
          ['--orb-dur' as string]: '18s',
          animationDelay: '-5s',
        }} />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8" style={{ zIndex: 1 }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-6 items-center lg:items-end">

            {/* Columna izquierda: copy */}
            <div className="order-2 lg:order-1 text-center lg:text-left lg:pb-24">
              {/* Chip: carga el tagline del rol cuando hay meerkat seleccionado,
                  fallback a label genérico si no. Estilo liquid glass. */}
              {selectedMeerkat ? (
                <div
                  className="inline-flex items-center gap-2.5 mb-6 px-4 py-2 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(22px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(22px) saturate(160%)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    boxShadow: [
                      'inset 0 1px 0 rgba(255,255,255,0.22)',
                      'inset 0 -1px 0 rgba(255,255,255,0.04)',
                      '0 8px 24px rgba(0,0,0,0.3)',
                      `0 0 32px ${roleColor}22`,
                    ].join(', '),
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: roleColor, boxShadow: `0 0 8px ${roleColor}`,
                  }} />
                  <span style={{
                    fontSize: '0.74rem', fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: '#fff', opacity: 0.95,
                    textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                  }}>
                    {selectedMeerkat.tagline}
                  </span>
                </div>
              ) : (
                <p style={{ color: 'rgba(155,109,255,0.85)', fontSize: '0.68rem', fontWeight: 700,
                  letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18 }}>
                  Centinelia Operación
                </p>
              )}

              <h1 style={{ color: '#fff', fontWeight: 800,
                fontSize: 'clamp(2rem, 4.6vw, 3.6rem)', lineHeight: 1.05, marginBottom: 18, letterSpacing: '-0.025em' }}>
                {selectedMeerkat ? (
                  <>Diseñemos a <span style={{
                    background: `linear-gradient(135deg, ${roleColor}, #C4A8FF)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>{selectedMeerkat.nombre}</span><br />para tu operación</>
                ) : (
                  <>Diseña tu oficina<br />digital a la medida</>
                )}
              </h1>

              <p style={{ color: 'rgba(255,255,255,0.52)', fontSize: 'clamp(0.95rem, 1.8vw, 1.1rem)',
                lineHeight: 1.7, maxWidth: 520, marginBottom: 28 }} className="mx-auto lg:mx-0">
                {selectedMeerkat
                  ? `${ROLE_SUBTITLE[selectedMeerkat.id] ?? selectedMeerkat.descripcion} Cuéntanos de tu operación y armamos la propuesta en menos de 24 horas.`
                  : 'Múltiples empleados, sucursales, integraciones y flujos personalizados. Cuéntanos lo que necesitas y armamos la propuesta.'
                }
              </p>

              <div className="flex flex-wrap justify-center lg:justify-start gap-x-5 gap-y-2">
                {BENEFICIOS.map(b => (
                  <span key={b} className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    <Check size={11} color="#9B6DFF" /> {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Columna derecha: meerkat anclado al pie del hero */}
            <div className="order-1 lg:order-2 relative flex justify-center items-end"
              style={{
                // En desktop, el bloque sube hasta el tope de la sección: el
                // Image internal es flex-end, por lo que los pies tocan el
                // borde inferior del hero (donde empieza el blanco de abajo).
                alignSelf: 'flex-end',
                width: '100%',
                height: '100%',
                minHeight: 360,
              }}
            >
              {/* Halo detrás del personaje, pegado al piso */}
              <div style={{
                position: 'absolute',
                bottom: 0, left: '50%', transform: 'translateX(-50%)',
                width: 'min(460px, 95%)', height: 'min(360px, 90%)',
                background: `radial-gradient(ellipse at bottom, ${roleColor}55 0%, ${roleColor}00 65%)`,
                borderRadius: '50%',
                pointerEvents: 'none',
                filter: 'blur(10px)',
              }} />
              {/* Imagen del meerkat — nivelada con la altura del título.
                  translateY empuja los pies para que toquen el borde del hero
                  (los PNG tienen ~15px de whitespace transparente abajo).
                  Nova se escala 1.16 porque su PNG es casi cuadrado (687x692)
                  y en el container portrait quedaba chaparra. */}
              <div style={{
                position: 'relative',
                width: 'clamp(260px, 38vw, 460px)',
                height: 'clamp(340px, 58vh, 540px)',
                zIndex: 1,
                display: 'block',
                transform: selectedMeerkat?.id === 'nova'
                  ? 'translateY(16px) scale(1.16)'
                  : 'translateY(16px)',
                transformOrigin: 'bottom center',
              }}>
                <Image
                  src={selectedMeerkat?.imagen ?? DEFAULT_HERO_IMG}
                  alt={selectedMeerkat?.nombre ?? 'Centinelia'}
                  fill
                  priority
                  sizes="(max-width: 1024px) 80vw, 560px"
                  style={{
                    objectFit: 'contain',
                    objectPosition: 'bottom center',
                    filter: `drop-shadow(0 24px 40px ${roleColor}66)`,
                  }}
                />
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ── TIMELINE: cómo trabajamos ────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: '#fff' }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
          <AnimatedSection>
            <p className="text-xs font-bold tracking-widest uppercase mb-6 text-center" style={{ color: C.accent, letterSpacing: '0.12em' }}>
              Así trabajamos
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 relative">
              {TIMELINE_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="relative text-center sm:text-left">
                    <div className="flex items-center gap-3 mb-3 justify-center sm:justify-start">
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: `${C.accent}12`, border: `1px solid ${C.accent}28`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Icon size={16} color={C.accent} />
                      </div>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: C.textMute, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Paso {i + 1}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
                      {s.title}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: C.textSub, lineHeight: 1.55 }}>
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* ── FORM + sidebar meerkat ───────────────────────────────────── */}
      <section>
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-14 sm:py-20">

          {status === 'success' ? (
            <AnimatedSection>
              <div className="rounded-2xl p-10 text-center mx-auto" style={{ maxWidth: 560, background: 'rgba(108,59,255,0.05)', border: `1px solid ${C.border}` }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: `${roleColor}18`, border: `1px solid ${roleColor}30` }}>
                  <Check size={24} color={roleColor} strokeWidth={2.5} />
                </div>
                <h2 className="font-bold mb-3" style={{ fontSize: '1.5rem', color: C.text }}>
                  Solicitud recibida
                </h2>
                <p style={{ color: C.textSub, lineHeight: 1.7, maxWidth: 380, margin: '0 auto 28px' }}>
                  {selectedMeerkat
                    ? `Te confirmamos por correo y te contactamos en menos de 24 horas con una propuesta para implementar a ${selectedMeerkat.nombre}.`
                    : 'Te confirmamos por correo y nuestro equipo te contactará en menos de 24 horas con una propuesta personalizada.'}
                </p>
                <Link href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: C.accent, color: '#fff' }}>
                  Volver al inicio <ArrowRight size={13} />
                </Link>
              </div>
            </AnimatedSection>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-14 items-start">

              {/* Form */}
              <AnimatedSection>
                <h2 className="font-bold mb-2" style={{ fontSize: 'clamp(1.3rem, 2.6vw, 1.8rem)', color: C.text }}>
                  Cuéntanos sobre tu organización
                </h2>
                <p style={{ color: C.textSub, marginBottom: 32, lineHeight: 1.6 }}>
                  Completa el formulario y te enviamos una propuesta en menos de 24 horas.
                </p>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

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

                  {/* Cuántos empleados: solo tiene sentido en flujo genérico
                      (sin role específico). Si el usuario viene por Noah o
                      Nami, pedir "cuántos" causa ruido. */}
                  {!selectedMeerkat && (
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
                  )}

                  <div>
                    <FieldLabel>¿Algo que debamos saber de tu operación?</FieldLabel>
                    <textarea
                      rows={4}
                      placeholder={selectedMeerkat
                        ? `Qué sistemas usa hoy tu equipo para esto, cuántas transacciones al mes, qué quieres que ${selectedMeerkat.nombre} ataque primero...`
                        : 'Describe brevemente tu operación, integraciones que usas o necesidades específicas...'}
                      value={form.mensaje}
                      onChange={set('mensaje')}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 96 }}
                    />
                  </div>

                  <div>
                    <FieldLabel>¿Tienes dudas que quieras resolver antes?</FieldLabel>
                    <textarea
                      rows={3}
                      placeholder={selectedMeerkat
                        ? `Lo que sea sobre ${selectedMeerkat.nombre}, integraciones, costos, tiempos, soporte... te respondemos todo en el seguimiento.`
                        : 'Dudas sobre precios, implementación, integraciones, tiempos... te respondemos todo en el seguimiento.'}
                      value={form.preguntas}
                      onChange={set('preguntas')}
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                    />
                  </div>

                  {status === 'error' && (
                    <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>
                      Algo salió mal. Escríbenos directamente a hola@centinelia.mx
                    </p>
                  )}

                  {(() => {
                    const needsEmpleadosCount = !selectedMeerkat;
                    const disabled = status === 'loading' || (needsEmpleadosCount && !form.empleados);
                    return (
                  <button
                    type="submit"
                    disabled={disabled}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-bold transition-all hover:opacity-90 hover:scale-[1.01]"
                    style={{
                      padding: '14px 32px',
                      background: `linear-gradient(135deg, ${roleColor}, ${C.accentLt})`,
                      color: '#fff',
                      opacity: disabled ? 0.6 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {status === 'loading' ? 'Enviando...' : 'Enviar solicitud'} {status !== 'loading' && <ArrowRight size={14} />}
                  </button>
                    );
                  })()}

                  <p style={{ fontSize: '0.75rem', color: C.textSub, textAlign: 'center' }}>
                    Respondemos en menos de 24 h · Sin compromiso
                  </p>
                </form>
              </AnimatedSection>

              {/* Sidebar sticky con detalle del meerkat */}
              <aside className="order-first lg:order-last">
                <div className="lg:sticky lg:top-24">
                  <AnimatedSection>
                    <div className="rounded-2xl overflow-hidden"
                      style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 6px 32px rgba(108,59,255,0.08)' }}>

                      {/* Header con el personaje mini */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14,
                        padding: '18px 20px', background: `linear-gradient(135deg, ${roleColor}10, ${roleColor}04)`,
                        borderBottom: `1px solid ${roleColor}22`,
                      }}>
                        {/* Avatar circular estilo "foto de perfil". Mismo
                            patrón que admin/staff: <img> plano (no next/image
                            fill — tiene wrappers que rompen el transform) +
                            border-radius 50% + object-cover + scale + origin
                            per meerkat. */}
                        <span style={{
                          width: 64, height: 64, borderRadius: '50%',
                          overflow: 'hidden', display: 'inline-block',
                          flexShrink: 0,
                          background: `${roleColor}15`,
                          border: `2px solid ${roleColor}35`,
                        }}>
                          {selectedMeerkat?.imagen ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={selectedMeerkat.imagen}
                              alt={selectedMeerkat.nombre}
                              style={avatarImgStyle(selectedMeerkat)}
                            />
                          ) : (
                            <span style={{
                              width: '100%', height: '100%',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: roleColor, fontWeight: 800, fontSize: 24,
                            }}>
                              C
                            </span>
                          )}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: '0.62rem', fontWeight: 700, color: roleColor,
                            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                            {selectedMeerkat ? 'Empleado digital' : 'Centinelia Operación'}
                          </p>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: C.text, lineHeight: 1.1 }}>
                            {selectedMeerkat?.nombre ?? 'A medida'}
                          </h3>
                          {selectedMeerkat?.rol && (
                            <p style={{ fontSize: '0.78rem', color: C.textSub, marginTop: 2 }}>
                              {selectedMeerkat.rol}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bullets */}
                      <div style={{ padding: '18px 20px' }}>
                        <p style={{ fontSize: '0.65rem', fontWeight: 700, color: C.textMute,
                          letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                          {summary.subtitle}
                        </p>
                        <ul style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                          {summary.bullets.map(b => (
                            <li key={b} className="flex items-start gap-2" style={{ fontSize: '0.85rem', color: C.textSub, lineHeight: 1.5 }}>
                              <Check size={14} color={roleColor} className="flex-shrink-0" style={{ marginTop: 2 }} />
                              <span>{b}</span>
                            </li>
                          ))}
                          <li className="flex items-start gap-2"
                            style={{
                              fontSize: '0.82rem', color: C.textMute, lineHeight: 1.5,
                              fontStyle: 'italic', marginTop: 2,
                            }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 14, height: 14, borderRadius: 4,
                              background: `${roleColor}18`, color: roleColor, fontWeight: 700, fontSize: 12,
                              flexShrink: 0, marginTop: 1,
                            }}>+</span>
                            <span>Y más, que diseñamos a la medida de tu operación.</span>
                          </li>
                        </ul>
                      </div>

                      {/* Footer: tiempo + sin compromiso */}
                      <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, background: C.bg,
                        display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Clock size={14} color={C.textMute} />
                        <p style={{ fontSize: '0.78rem', color: C.textSub, lineHeight: 1.4 }}>
                          <strong style={{ color: C.text, fontWeight: 700 }}>2 a 3 semanas</strong> de implementación tras el diagnóstico.
                        </p>
                      </div>
                    </div>

                    {/* Enlace sutil para cambiar de empleado */}
                    {selectedMeerkat && (
                      <p className="text-center lg:text-left mt-4" style={{ fontSize: '0.78rem', color: C.textMute }}>
                        ¿Prefieres otro empleado?{' '}
                        <Link href="/registro" style={{ color: C.accent, fontWeight: 600, textDecoration: 'none' }}>
                          Explora el roster →
                        </Link>
                      </p>
                    )}
                  </AnimatedSection>
                </div>
              </aside>

            </div>
          )}

        </div>
      </section>

      <IndustryFooter />
    </div>
  );
}
