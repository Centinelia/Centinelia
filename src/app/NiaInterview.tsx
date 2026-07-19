'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Phone, PhoneOff, Sparkles, Loader2 } from 'lucide-react';
import AnimatedSection from './AnimatedSection';
import { motion, AnimatePresence } from 'motion/react';
import DailyIframe from '@daily-co/daily-js';

const DEMO_PHONE      = '+52 (81) 2188 8490';
const DEMO_PHONE_HREF = 'tel:+528121888490';

const INDUSTRIES = [
  { id: 'clinica',      label: 'Clínica' },
  { id: 'restaurante',  label: 'Restaurante' },
  { id: 'taller',       label: 'Taller' },
  { id: 'inmobiliaria', label: 'Inmobiliaria' },
  { id: 'dentista',     label: 'Dentista' },
];

const TASKS = [
  { id: 'cita',        label: 'Agendar una cita' },
  { id: 'pedido',      label: 'Tomar un pedido' },
  { id: 'cancelar',    label: 'Cancelar' },
  { id: 'seguimiento', label: 'Dar seguimiento' },
  { id: 'cobrar',      label: 'Cobrar' },
  { id: 'dudas',       label: 'Resolver dudas' },
];

const G: Record<string, Record<string, string>> = {
  clinica: {
    cita:        'Hola, gracias por llamar.\n\n¿Le agendo su cita o tiene alguna pregunta sobre nuestros servicios?',
    pedido:      'Hola, gracias por llamar a la clínica.\n\n¿En qué le puedo ayudar el día de hoy?',
    cancelar:    'Hola, buenas tardes.\n\n¿Me puede dar su nombre para buscar su cita?',
    seguimiento: 'Hola, le llamo de parte de la clínica.\n\n¿Tiene un momento para hablar?',
    dudas:       'Hola, gracias por llamar.\n\nCon gusto le oriento. ¿Qué le gustaría saber?',
    cobrar:      'Hola, buenas tardes.\n\nLe llamo para comentarle sobre un saldo pendiente. ¿Es buen momento?',
    default:     'Hola, gracias por llamar a la clínica.\n\n¿En qué le puedo ayudar?',
  },
  restaurante: {
    cita:        'Hola, gracias por llamar.\n\n¿Le hago su reservación o tiene alguna pregunta?',
    pedido:      'Hola, gracias por llamar a La Trattoria.\n\n¿Es para una reservación o para ordenar?',
    cancelar:    'Hola, con gusto.\n\n¿Me puede dar su nombre para buscar su reservación?',
    seguimiento: 'Hola, le llamo para confirmar su reservación de esta noche.\n\n¿Sigue todo bien?',
    dudas:       'Hola, buenas tardes.\n\n¿Tiene alguna pregunta sobre nuestro menú o servicios?',
    cobrar:      'Hola, le llamo del restaurante.\n\n¿Tiene un momento para hablar?',
    default:     'Hola, gracias por llamar.\n\n¿Le ayudo con un pedido o una reservación?',
  },
  taller: {
    cita:        'Hola, buenas tardes.\n\n¿Le agendo una cita para la revisión de su vehículo?',
    pedido:      'Hola, gracias por llamar al taller.\n\n¿Qué servicio o refacción necesita?',
    cancelar:    'Hola, con gusto.\n\n¿Para qué fecha tiene programada su cita?',
    seguimiento: 'Hola, le llamo del taller.\n\nSu vehículo ya está listo. ¿Cuándo puede pasar por él?',
    dudas:       'Hola, con gusto le explico.\n\n¿Qué está presentando su vehículo?',
    cobrar:      'Hola, le llamo para comentarle el costo del servicio de su vehículo.',
    default:     'Hola, gracias por llamar al taller.\n\n¿En qué le puedo ayudar?',
  },
  inmobiliaria: {
    cita:        'Hola, gracias por llamar.\n\n¿Le agendo una visita a alguna propiedad?',
    pedido:      'Hola, buenas tardes.\n\n¿Busca comprar, rentar o tiene una propiedad para poner en el mercado?',
    cancelar:    'Hola, con gusto.\n\n¿Qué cita desea cancelar o reagendar?',
    seguimiento: 'Hola, le llamo para darle una actualización sobre la propiedad que visitó.',
    dudas:       'Hola, ¿tiene alguna pregunta sobre alguna propiedad o proceso de compra?',
    cobrar:      'Hola, le llamo para recordarle un pago pendiente.\n\n¿Tiene un momento?',
    default:     'Hola, gracias por llamar.\n\n¿Busca comprar, rentar o vender una propiedad?',
  },
  dentista: {
    cita:        'Hola, gracias por llamar al consultorio.\n\n¿Le agendo su cita con el dentista?',
    pedido:      'Hola, con gusto.\n\n¿Qué tratamiento le interesa conocer?',
    cancelar:    'Hola, ¿me puede dar su nombre para buscar su cita?',
    seguimiento: 'Hola, le llamo para saber cómo se ha sentido después de su tratamiento.',
    dudas:       'Hola, con gusto le explico.\n\n¿Qué tratamiento le interesa?',
    cobrar:      'Hola, le llamo para comentarle un saldo pendiente de su tratamiento.',
    default:     'Hola, gracias por llamar al consultorio dental.\n\n¿En qué le puedo ayudar?',
  },
};

function getGreeting(industry: string | null, task: string | null): string | null {
  if (!industry && !task) return null;
  const ind = industry ?? 'clinica';
  const tsk = task ?? 'default';
  return G[ind]?.[tsk] ?? G[ind]?.['default'] ?? 'Hola, gracias por llamar.\n\n¿En qué le puedo ayudar?';
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
      style={{
        background: active ? '#6C3BFF' : 'rgba(108,59,255,0.06)',
        color:      active ? '#fff'    : 'rgba(26,10,59,0.65)',
        border:     `1.5px solid ${active ? '#6C3BFF' : 'rgba(108,59,255,0.18)'}`,
        transform:  active ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {label}
    </button>
  );
}

/* iPhone-style chat bubble card */
function ChatBubble({ greeting }: { greeting: string }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#F2F0F7', border: '1px solid rgba(108,59,255,0.1)' }}
    >
      {/* iOS-style call bar */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ background: '#fff', borderBottom: '1px solid rgba(26,10,59,0.06)' }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}
        >
          <Phone size={14} color="#fff" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold leading-tight" style={{ color: '#1A0A3B' }}>Nia</p>
          <p className="text-[9px] leading-tight mt-0.5" style={{ color: 'rgba(26,10,59,0.38)' }}>
            Primera palabra que escucha tu cliente
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-wider" style={{ color: '#22c55e' }}>
          <span className="relative flex" style={{ width: 7, height: 7 }}>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#22c55e' }} />
            <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: '#22c55e' }} />
          </span>
          EN LÍNEA
        </span>
      </div>

      {/* Chat area */}
      <div className="px-4 pb-5 pt-4">
        <p
          className="text-[10px] font-bold mb-2 tracking-wide"
          style={{ color: '#6C3BFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}
        >
          Nia
        </p>
        {/* Speech bubble — incoming message style (rounded except bottom-left) */}
        <div
          className="inline-block px-4 py-3"
          style={{
            background:   '#6C3BFF',
            borderRadius: '18px 18px 18px 4px',
            maxWidth:     '90%',
          }}
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: '#fff', whiteSpace: 'pre-line' }}
          >
            {greeting}
          </p>
        </div>
      </div>
    </div>
  );
}

/* Employee credential card */
function NiaCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden mt-4"
      style={{
        background: '#fff',
        border:     '1.5px solid rgba(108,59,255,0.18)',
        boxShadow:  '0 4px 28px rgba(108,59,255,0.1)',
      }}
    >
      {/* Header band */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: 'linear-gradient(135deg, #6C3BFF 0%, #9B6DFF 100%)' }}
      >
        <p style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>
          Recepcionista
        </p>
        <p style={{ fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', fontFamily: 'monospace' }}>
          Empleado Digital
        </p>
      </div>

      {/* Body */}
      <div className="px-5 py-5">

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(108,59,255,0.1)', margin: '4px 0 16px' }} />

        {/* Fields */}
        <div className="flex flex-col gap-4">

          <div className="flex items-center justify-between">
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(26,10,59,0.28)' }}>
              Estado
            </p>
            <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#15803d' }}>
              <span className="relative flex" style={{ width: 7, height: 7 }}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#22c55e' }} />
                <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: '#22c55e' }} />
              </span>
              En servicio
            </span>
          </div>

          <div className="flex items-center justify-between">
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(26,10,59,0.28)' }}>
              Horario
            </p>
            <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>24 horas</p>
          </div>

          <div className="flex items-start justify-between">
            <p style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(26,10,59,0.28)' }}>
              Idiomas
            </p>
            <div className="text-right flex flex-col gap-0.5">
              <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>Español</p>
              <p className="text-xs font-semibold" style={{ color: '#1A0A3B' }}>Inglés</p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 mt-4 pt-4"
          style={{ borderTop: '1px solid rgba(108,59,255,0.1)' }}
        >
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(108,59,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 8, color: '#6C3BFF', fontWeight: 800 }}>
            ✓
          </span>
          <p style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(26,10,59,0.38)' }}>
            Empleado verificado · Centinelia
          </p>
        </div>

      </div>
    </div>
  );
}

type CallState = 'idle' | 'connecting' | 'active' | 'ended';

export default function NiaInterview() {
  const [industry, setIndustry]             = useState<string | null>(null);
  const [task, setTask]                     = useState<string | null>(null);
  const [desc, setDesc]                     = useState('');
  const [customGreeting, setCustomGreeting] = useState<string | null>(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [callState, setCallState]           = useState<CallState>('idle');
  const callObjRef                          = useRef<any>(null);

  const presetGreeting = getGreeting(industry, task);
  const activeGreeting = customGreeting ?? presetGreeting;
  const hasSelection   = !!(industry || task || customGreeting);

  function toggleIndustry(id: string) {
    setIndustry(prev => prev === id ? null : id);
    setCustomGreeting(null);
    setError(null);
  }

  function toggleTask(id: string) {
    setTask(prev => prev === id ? null : id);
    setCustomGreeting(null);
    setError(null);
  }

  async function handleCall() {
    if (callState === 'active') {
      await callObjRef.current?.leave();
      return;
    }
    if (callState === 'connecting') return;

    setCallState('connecting');
    setError(null);

    // Pedir micrófono antes del fetch — en móvil el permiso debe solicitarse
    // dentro del contexto del tap del usuario, antes de cualquier await async.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (err: unknown) {
      setCallState('idle');
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Permiso de micrófono bloqueado. Ve a Ajustes > Safari (o tu navegador) > Micrófono y actívalo para este sitio.');
      } else {
        setError('No pudimos acceder al micrófono. Verifica que tu dispositivo tenga uno disponible.');
      }
      return;
    }

    try {
      const greeting = activeGreeting ?? 'Hola, gracias por llamar. ¿En qué le puedo ayudar?';

      const res = await fetch('/api/landing/demo-call', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ greeting }),
      });
      const data = await res.json() as { webCallUrl?: string; error?: string };
      if (!data.webCallUrl) throw new Error(data.error ?? 'No se recibió URL de llamada');

      const callObj = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: false,
      });
      callObjRef.current = callObj;

      callObj.on('left-meeting', () => {
        setCallState('ended');
        callObjRef.current = null;
        setTimeout(() => setCallState('idle'), 3500);
      });

      callObj.on('error', (e: unknown) => {
        console.error('[demo-call] Daily error', e);
        setCallState('idle');
        callObjRef.current = null;
        setError('Error de conexión. Intenta de nuevo.');
      });

      await callObj.join({ url: data.webCallUrl, startVideoOff: true });
      setCallState('active');
    } catch (e) {
      console.error('[demo-call] error', e);
      setCallState('idle');
      setError('No se pudo iniciar la llamada. Marca al ' + DEMO_PHONE);
    }
  }

  async function handleCreateDemo() {
    if (!desc.trim()) return;
    setLoading(true);
    setCustomGreeting(null);
    setError(null);
    setIndustry(null);
    setTask(null);
    try {
      const r = await fetch('/api/landing/demo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ description: desc.trim().slice(0, 400) }),
      });
      const data = await r.json() as { greeting?: string; error?: string };
      if (data.greeting) setCustomGreeting(data.greeting);
      else setError('No se pudo generar el demo. Intenta de nuevo.');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      id="demo"
      style={{ background: '#FAFBFF', borderTop: '1px solid rgba(108,59,255,0.1)', overflow: 'hidden' }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-32">

        {/* Header — headline first, label second */}
        <AnimatedSection className="mb-16 sm:mb-20">
          <h2
            className="font-extrabold tracking-tight"
            style={{
              fontSize:   'clamp(2.4rem, 5.5vw, 4.2rem)',
              color:      '#1A0A3B',
              lineHeight: 1.06,
            }}
          >
            Antes de contratarla...<br />Conócela
          </h2>
          <p
            className="text-xs font-bold tracking-widest uppercase mt-5"
            style={{ color: '#6C3BFF' }}
          >
            Primera entrevista
          </p>
          <p
            className="leading-relaxed mt-4"
            style={{
              fontSize: 'clamp(0.95rem, 1.8vw, 1.05rem)',
              color:    'rgba(26,10,59,0.55)',
              maxWidth: 500,
            }}
          >
            Descubre cómo sonará el primer contacto de tu nueva oficina digital.
            Dile qué tipo de organización tienes y Nia actuará como tu próxima recepcionista.
          </p>
        </AnimatedSection>

        {/* Two-column layout */}
        <div className="grid lg:grid-cols-[460px_1fr] gap-10 lg:gap-16 items-start">

          {/* LEFT: Nia portrait + employee card */}
          <AnimatedSection>
            {/* Portrait */}
            <div
              className="relative rounded-[28px] overflow-hidden"
              style={{
                height:     'clamp(360px, 55vw, 520px)',
                background: 'linear-gradient(180deg, #EDE6FF 0%, #D6CBFF 65%, #C9BBFF 100%)',
              }}
            >
              <Image
                src="/meerkats/nia.png"
                alt="Nia"
                fill
                sizes="(max-width: 1024px) 100vw, 460px"
                style={{ objectFit: 'contain', objectPosition: 'center 4%' }}
                priority
              />
              {/* Subtle nameplate */}
              <div
                className="absolute bottom-0 left-0 right-0 px-7 py-5"
                style={{ background: 'linear-gradient(to top, rgba(15,5,36,0.72) 0%, transparent 100%)' }}
              >
                <p className="font-bold" style={{ fontSize: '1.5rem', color: '#fff', lineHeight: 1.1 }}>
                  Nia
                </p>
              </div>
            </div>

            {/* Employee card */}
            <NiaCard />
          </AnimatedSection>

          {/* RIGHT: Interactive panel */}
          <AnimatedSection delay={0.12}>
            <div className="flex flex-col gap-7">

              {/* Industry pills */}
              <div>
                <p
                  className="text-xs font-semibold mb-3"
                  style={{ color: 'rgba(26,10,59,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                >
                  ¿En qué tipo de organización trabajará?
                </p>
                <div className="flex flex-wrap gap-2">
                  {INDUSTRIES.map(ind => (
                    <Pill
                      key={ind.id}
                      label={ind.label}
                      active={industry === ind.id}
                      onClick={() => toggleIndustry(ind.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Task pills */}
              <div>
                <p
                  className="text-xs font-semibold mb-3"
                  style={{ color: 'rgba(26,10,59,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                >
                  ¿Qué quieres que haga?
                </p>
                <div className="flex flex-wrap gap-2">
                  {TASKS.map(t => (
                    <Pill
                      key={t.id}
                      label={t.label}
                      active={task === t.id}
                      onClick={() => toggleTask(t.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Chat bubble greeting */}
              <AnimatePresence mode="wait">
                {activeGreeting && (
                  <motion.div
                    key={activeGreeting}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ChatBubble greeting={activeGreeting} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Call button */}
              <div>
                {callState === 'ended' ? (
                  <div
                    className="flex items-center justify-center gap-2 rounded-2xl py-4 font-semibold text-sm"
                    style={{ background: 'rgba(34,197,94,0.08)', border: '1.5px solid rgba(34,197,94,0.25)', color: '#15803d' }}
                  >
                    Llamada terminada. Hasta pronto.
                  </div>
                ) : (
                  <button
                    onClick={handleCall}
                    disabled={callState === 'connecting'}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 font-bold transition-all hover:opacity-92 hover:scale-[1.015] disabled:cursor-not-allowed"
                    style={{
                      background: callState === 'active'
                        ? 'linear-gradient(135deg, #dc2626, #ef4444)'
                        : hasSelection
                          ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)'
                          : 'rgba(108,59,255,0.07)',
                      color:     (callState === 'active' || hasSelection) ? '#fff' : 'rgba(26,10,59,0.4)',
                      border:    `1.5px solid ${callState === 'active' || hasSelection ? 'transparent' : 'rgba(108,59,255,0.15)'}`,
                      boxShadow: callState === 'active'
                        ? '0 8px 32px rgba(220,38,38,0.28)'
                        : hasSelection
                          ? '0 8px 32px rgba(108,59,255,0.32)'
                          : 'none',
                      fontSize:   '1rem',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {callState === 'connecting' && <Loader2 size={18} className="animate-spin" />}
                    {callState === 'active'     && <PhoneOff size={18} />}
                    {(callState === 'idle')     && <Phone size={18} />}
                    {callState === 'connecting' ? 'Conectando...'
                      : callState === 'active'  ? 'Terminar llamada'
                      : 'Llamar a Nia'}
                  </button>
                )}

                {callState === 'idle' && (
                  <p className="text-center text-xs mt-2" style={{ color: 'rgba(26,10,59,0.3)' }}>
                    <span className="sm:hidden">o llama al · </span>
                    <span className="hidden sm:inline">o marca desde tu teléfono · </span>
                    {DEMO_PHONE}
                  </p>
                )}
                {callState === 'active' && (
                  <p className="flex items-center justify-center gap-1.5 text-center text-xs mt-2 font-medium" style={{ color: '#15803d' }}>
                    <span className="relative flex" style={{ width: 6, height: 6 }}>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#22c55e' }} />
                      <span className="relative inline-flex rounded-full" style={{ width: 6, height: 6, background: '#22c55e' }} />
                    </span>
                    En llamada con Nia
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="flex items-center gap-4 mt-1">
                <div style={{ flex: 1, height: 1, background: 'rgba(26,10,59,0.07)' }} />
                <span className="text-xs whitespace-nowrap" style={{ color: 'rgba(26,10,59,0.3)' }}>
                  o cuéntale sobre tu organización
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(26,10,59,0.07)' }} />
              </div>

              {/* Custom description */}
              <div className="flex flex-col gap-2">
                <textarea
                  value={desc}
                  onChange={e => { setDesc(e.target.value); setError(null); }}
                  placeholder="Describe tu organización..."
                  rows={3}
                  maxLength={400}
                  className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background:  '#fff',
                    border:      '1.5px solid rgba(108,59,255,0.15)',
                    color:       '#1A0A3B',
                    lineHeight:  1.65,
                    transition:  'border-color 0.18s ease',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#6C3BFF')}
                  onBlur={e  => (e.target.style.borderColor = 'rgba(108,59,255,0.15)')}
                />

                <p className="text-xs" style={{ color: 'rgba(26,10,59,0.38)' }}>
                  Nia aprenderá cómo debe atender.
                </p>

                {error && (
                  <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
                )}

                <button
                  onClick={handleCreateDemo}
                  disabled={!desc.trim() || loading}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: 'rgba(108,59,255,0.07)',
                    color:      '#6C3BFF',
                    border:     '1.5px solid rgba(108,59,255,0.2)',
                  }}
                >
                  {loading
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Sparkles size={14} />
                  }
                  {loading ? 'Procesando...' : 'Cuéntale cómo trabaja tu organización'}
                </button>
              </div>

            </div>
          </AnimatedSection>

        </div>
      </div>
    </section>
  );
}
