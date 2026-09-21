'use client';

// DemoNia — sección de demo dinamizado para /v2.
//
// Preserva el visual language del NiaInterview original (bg #FAFBFF,
// 2-col layout con Nia portrait a la izquierda + panel interactivo a la
// derecha, framer-motion, gradientes purple).
//
// Diferencia con el original:
//  * Sin pills industry/task ni webRTC. En su lugar, 3 campos de contexto
//    (nombre del negocio + qué hace + qué quiere probar) + teléfono MX.
//  * Al submit → OTP por SMS → Vapi outbound al teléfono real del prospect
//    con prompt dinámico que hace a Nia actuar como su empleada.

import { useState } from 'react';
import Image from 'next/image';
import { Phone, Loader2, Check, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import AnimatedSection from '../AnimatedSection';

const MX_PHONE_RE = /^[1-9]\d{9}$/;

type Stage = 'form' | 'otp' | 'dialing' | 'fallback' | 'error';

interface SubmitResponse {
  ok:         boolean;
  requestId?: string;
  error?:     string;
  warning?:   string;
}

interface VerifyResponse {
  ok:          boolean;
  callStatus?: 'dialing' | 'fallback_manual';
  reason?:     string;
  error?:      string;
}

/* Employee credential card — copia del NiaInterview para preservar el look */
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
      <div className="px-5 py-5">
        <div style={{ borderTop: '1px solid rgba(108,59,255,0.1)', margin: '4px 0 16px' }} />
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
        <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(108,59,255,0.1)' }}>
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

function fieldStyle(active: boolean): React.CSSProperties {
  return {
    background:  '#fff',
    border:      `1.5px solid ${active ? '#6C3BFF' : 'rgba(108,59,255,0.15)'}`,
    color:       '#1A0A3B',
    lineHeight:  1.65,
    transition:  'border-color 0.18s ease',
  };
}

export default function DemoNia() {
  const [stage,      setStage]      = useState<Stage>('form');
  const [orgName,    setOrgName]    = useState('');
  const [orgDesc,    setOrgDesc]    = useState('');
  const [expect,     setExpect]     = useState('');
  const [phone,      setPhone]      = useState('');
  const [consent,    setConsent]    = useState(false);
  const [otpCode,    setOtpCode]    = useState('');
  const [requestId,  setRequestId]  = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [fbReason,   setFbReason]   = useState<string | null>(null);

  const formValid =
    orgName.trim().length   >= 2   && orgName.trim().length   <= 200 &&
    orgDesc.trim().length   >= 3   && orgDesc.trim().length   <= 400 &&
    expect.trim().length    >= 3   && expect.trim().length    <= 400 &&
    MX_PHONE_RE.test(phone) &&
    consent;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/landing/callback-request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phone,
          org_name:        orgName.trim(),
          org_description: orgDesc.trim(),
          expectation:     expect.trim(),
          consent:         true,
        }),
      });
      const data = await res.json() as SubmitResponse;
      if (!res.ok || !data.ok || !data.requestId) {
        setError(mapError(data.error) ?? 'No pudimos procesar tu solicitud. Intenta de nuevo.');
        return;
      }
      setRequestId(data.requestId);
      setStage('otp');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !requestId || otpCode.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/landing/callback-verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requestId, code: otpCode }),
      });
      const data = await res.json() as VerifyResponse;
      if (!res.ok || !data.ok) {
        setError(mapError(data.error) ?? 'No pudimos verificar el código. Intenta de nuevo.');
        return;
      }
      if (data.callStatus === 'dialing') {
        setStage('dialing');
      } else {
        setFbReason(data.reason ?? null);
        setStage('fallback');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function mapError(code?: string): string | null {
    if (!code) return null;
    switch (code) {
      case 'wrong_code':         return 'Ese código no coincide. Revísalo y vuelve a intentar.';
      case 'expired':            return 'El código expiró. Empieza el demo de nuevo.';
      case 'too_many_attempts':  return 'Demasiados intentos. Empieza el demo de nuevo.';
      case 'ip_rate_limit':      return 'Estamos recibiendo muchas solicitudes desde tu red. Intenta en un rato.';
      case 'phone_rate_limit':   return 'Ya solicitaste una llamada con este número recientemente. Espera unos minutos.';
      case 'invalid_phone':      return 'El teléfono no es válido. Usa 10 dígitos MX sin espacios.';
      case 'invalid_context':    return 'Completa los tres campos antes de continuar.';
      case 'invalid_payload':    return 'Revisa que todos los campos estén llenos.';
      case 'invalid_json':       return 'Error de comunicación. Intenta de nuevo.';
      default:                   return null;
    }
  }

  return (
    <section
      id="demo"
      style={{ background: '#FAFBFF', borderTop: '1px solid rgba(108,59,255,0.1)', overflow: 'hidden' }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-32">

        <AnimatedSection className="mb-16 sm:mb-20">
          <h2
            className="font-extrabold tracking-tight"
            style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4.2rem)', color: '#1A0A3B', lineHeight: 1.06 }}
          >
            Antes de contratarla...<br />Conócela
          </h2>
          <p className="text-xs font-bold tracking-widest uppercase mt-5" style={{ color: '#6C3BFF' }}>
            Primera entrevista
          </p>
          <p
            className="leading-relaxed mt-4"
            style={{ fontSize: 'clamp(0.95rem, 1.8vw, 1.05rem)', color: 'rgba(26,10,59,0.55)', maxWidth: 520 }}
          >
            Cuéntale a Nia de qué se trata tu negocio y qué quieres probar. En menos de un minuto te llama al teléfono como si ya fuera parte de tu equipo.
          </p>
        </AnimatedSection>

        <div className="grid lg:grid-cols-[460px_1fr] gap-10 lg:gap-16 items-start">

          {/* LEFT: Nia portrait + credential card (mismo look que la landing) */}
          <AnimatedSection>
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
              <div
                className="absolute bottom-0 left-0 right-0 px-7 py-5"
                style={{ background: 'linear-gradient(to top, rgba(15,5,36,0.72) 0%, transparent 100%)' }}
              >
                <p className="font-bold" style={{ fontSize: '1.5rem', color: '#fff', lineHeight: 1.1 }}>Nia</p>
              </div>
            </div>
            <NiaCard />
          </AnimatedSection>

          {/* RIGHT: Panel interactivo con state machine */}
          <AnimatedSection delay={0.12}>
            <AnimatePresence mode="wait">

              {stage === 'form' && (
                <motion.form
                  key="form"
                  onSubmit={handleSubmit}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                  className="flex flex-col gap-6"
                >
                  <div>
                    <label htmlFor="org_name" className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(26,10,59,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      ¿Cuál es el nombre de tu negocio?
                    </label>
                    <input
                      id="org_name"
                      type="text"
                      value={orgName}
                      onChange={e => { setOrgName(e.target.value.slice(0, 200)); setError(null); }}
                      placeholder="Tortillería Estrella, Constructora AC..."
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                      style={fieldStyle(orgName.trim().length >= 2)}
                    />
                  </div>

                  <div>
                    <label htmlFor="org_desc" className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(26,10,59,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      ¿A qué se dedica?
                    </label>
                    <textarea
                      id="org_desc"
                      value={orgDesc}
                      onChange={e => { setOrgDesc(e.target.value.slice(0, 400)); setError(null); }}
                      placeholder="Reparto de tortilla a tienditas y clientes por ruta en Monterrey."
                      rows={2}
                      className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
                      style={fieldStyle(orgDesc.trim().length >= 3)}
                    />
                  </div>

                  <div>
                    <label htmlFor="expectation" className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(26,10,59,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      ¿Qué te gustaría probar en la llamada?
                    </label>
                    <textarea
                      id="expectation"
                      value={expect}
                      onChange={e => { setExpect(e.target.value.slice(0, 400)); setError(null); }}
                      placeholder="Que tome un pedido de 5 kilos de tortilla y me confirme la dirección."
                      rows={2}
                      className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
                      style={fieldStyle(expect.trim().length >= 3)}
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(26,10,59,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Tu teléfono
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null); }}
                      placeholder="8112345678"
                      maxLength={10}
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                      style={fieldStyle(MX_PHONE_RE.test(phone))}
                    />
                    <p className="text-xs mt-2" style={{ color: 'rgba(26,10,59,0.38)' }}>
                      10 dígitos MX. Recibirás un código por SMS para confirmar.
                    </p>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer" style={{ color: 'rgba(26,10,59,0.65)' }}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={e => setConsent(e.target.checked)}
                      className="mt-0.5 cursor-pointer"
                      style={{ accentColor: '#6C3BFF' }}
                    />
                    <span className="text-xs leading-relaxed">
                      Autorizo que Centinelia me contacte por teléfono y SMS para esta llamada demo. Ver{' '}
                      <a href="/privacidad-datos" className="underline" style={{ color: '#6C3BFF' }}>aviso de privacidad</a>.
                    </span>
                  </label>

                  {error && (
                    <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!formValid || loading}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 font-bold transition-all hover:opacity-92 hover:scale-[1.015] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    style={{
                      background: formValid ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' : 'rgba(108,59,255,0.07)',
                      color:      formValid ? '#fff' : 'rgba(26,10,59,0.4)',
                      border:     `1.5px solid ${formValid ? 'transparent' : 'rgba(108,59,255,0.15)'}`,
                      boxShadow:  formValid ? '0 8px 32px rgba(108,59,255,0.32)' : 'none',
                      fontSize:   '1rem',
                    }}
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <Phone size={18} />}
                    {loading ? 'Enviando...' : 'Deja que Nia te llame'}
                  </button>
                </motion.form>
              )}

              {stage === 'otp' && (
                <motion.form
                  key="otp"
                  onSubmit={handleVerifyOtp}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                  className="flex flex-col gap-6"
                >
                  <div>
                    <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#6C3BFF' }}>
                      Paso 2 de 2
                    </p>
                    <h3 className="font-bold" style={{ fontSize: 'clamp(1.4rem, 2.5vw, 1.75rem)', color: '#1A0A3B', lineHeight: 1.15 }}>
                      Te mandamos un código por SMS
                    </h3>
                    <p className="text-sm mt-2" style={{ color: 'rgba(26,10,59,0.55)' }}>
                      Escribe los 6 dígitos que llegan a <strong style={{ color: '#1A0A3B' }}>+52 {phone}</strong> para confirmar tu teléfono.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="otp" className="text-xs font-semibold mb-2 block" style={{ color: 'rgba(26,10,59,0.65)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Código
                    </label>
                    <input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpCode}
                      onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                      placeholder="123456"
                      maxLength={6}
                      className="w-full rounded-xl px-4 py-4 text-lg tracking-widest text-center outline-none"
                      style={fieldStyle(otpCode.length === 6)}
                    />
                  </div>

                  {error && (
                    <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={otpCode.length !== 6 || loading}
                    className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 font-bold transition-all hover:opacity-92 hover:scale-[1.015] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                    style={{
                      background: otpCode.length === 6 ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' : 'rgba(108,59,255,0.07)',
                      color:      otpCode.length === 6 ? '#fff' : 'rgba(26,10,59,0.4)',
                      border:     `1.5px solid ${otpCode.length === 6 ? 'transparent' : 'rgba(108,59,255,0.15)'}`,
                      boxShadow:  otpCode.length === 6 ? '0 8px 32px rgba(108,59,255,0.32)' : 'none',
                      fontSize:   '1rem',
                    }}
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                    {loading ? 'Verificando...' : 'Verificar y llamar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setStage('form'); setOtpCode(''); setError(null); }}
                    className="text-xs font-medium transition-opacity hover:opacity-70"
                    style={{ color: 'rgba(26,10,59,0.45)' }}
                  >
                    ← Regresar y corregir mis datos
                  </button>
                </motion.form>
              )}

              {stage === 'dialing' && (
                <motion.div
                  key="dialing"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26 }}
                  className="rounded-2xl p-8"
                  style={{ background: 'rgba(108,59,255,0.05)', border: '1.5px solid rgba(108,59,255,0.2)' }}
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-2xl"
                      style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', boxShadow: '0 8px 24px rgba(108,59,255,0.35)' }}
                    >
                      <Phone size={22} color="#fff" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6C3BFF' }}>
                        Marcando ahora
                      </p>
                      <h3 className="font-bold mt-1" style={{ fontSize: '1.3rem', color: '#1A0A3B', lineHeight: 1.2 }}>
                        Nia te está llamando
                      </h3>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,10,59,0.6)' }}>
                    En segundos suena tu teléfono <strong style={{ color: '#1A0A3B' }}>+52 {phone}</strong>. Contesta como si fuera una llamada de trabajo. Nia va a hablar como si fuera parte del equipo de <strong style={{ color: '#1A0A3B' }}>{orgName}</strong>.
                  </p>
                  <div className="flex items-center gap-2 mt-5 text-xs font-medium" style={{ color: '#15803d' }}>
                    <span className="relative flex" style={{ width: 8, height: 8 }}>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: '#22c55e' }} />
                      <span className="relative inline-flex rounded-full" style={{ width: 8, height: 8, background: '#22c55e' }} />
                    </span>
                    Llamada activa
                  </div>
                </motion.div>
              )}

              {stage === 'fallback' && (
                <motion.div
                  key="fallback"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26 }}
                  className="rounded-2xl p-8"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1.5px solid rgba(245,158,11,0.25)' }}
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-2xl"
                      style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}
                    >
                      <Check size={22} color="#fff" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: '#d97706' }}>
                        Recibido
                      </p>
                      <h3 className="font-bold mt-1" style={{ fontSize: '1.3rem', color: '#1A0A3B', lineHeight: 1.2 }}>
                        Te llamamos en menos de 30 minutos
                      </h3>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,10,59,0.6)' }}>
                    {fbReason === 'out_of_hours'
                      ? `Nia no está tomando llamadas automáticas en este horario. Nazre (fundador) te llama al ${phone} en cuanto vuelva a abrir la oficina (9 am hora MTY).`
                      : `Se nos complicó llamarte automático en este momento. Nazre te llama al ${phone} en menos de 30 minutos.`}
                  </p>
                </motion.div>
              )}

            </AnimatePresence>
          </AnimatedSection>

        </div>
      </div>
    </section>
  );
}
