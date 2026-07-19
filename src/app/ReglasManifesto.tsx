'use client';

import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Phone, X, ShieldAlert, Lock } from 'lucide-react';

// ─── Shared styles ─────────────────────────────────────────────────────────
const CARD_S = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(108,59,255,0.2)', borderRadius: 12, overflow: 'hidden' as const };
const DIV_S  = { borderTop: '1px solid rgba(108,59,255,0.1)' };
const FOOT_S = { ...DIV_S, background: 'rgba(74,222,128,0.04)' };
const LBL_S  = { fontSize: '9px', fontWeight: 700 as const, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'rgba(108,59,255,0.5)' };

function GreenCheck({ label }: { label: string }) {
  return (
    <div className="px-4 py-3 flex items-center gap-2" style={FOOT_S}>
      <Check size={11} strokeWidth={2.5} color="#4ade80" />
      <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>{label}</span>
    </div>
  );
}

// ─── Example: 01 — CRM card ─────────────────────────────────────────────────
function CrmExample() {
  const rows = [
    { label: 'Última conversación', value: 'Hace 21 días' },
    { label: 'Pendiente',           value: 'Enviar cotización Premium' },
    { label: 'Próxima acción',      value: 'Llamar mañana 10:00 AM' },
  ];
  return (
    <div style={CARD_S}>
      <div className="px-4 py-3 flex items-center gap-3" style={DIV_S}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.22)', fontSize: 11, fontWeight: 800, color: '#9B6DFF' }}>
          CR
        </div>
        <div>
          <p className="font-semibold text-sm leading-none mb-0.5" style={{ color: '#fff' }}>Carlos Ruiz</p>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>cliente · activo</p>
        </div>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {rows.map((row, i) => (
          <motion.div key={row.label}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.05 + i * 0.1 }}>
            <p style={LBL_S} className="mb-1">{row.label}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{row.value}</p>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}>
        <GreenCheck label="Recuperado automáticamente" />
      </motion.div>
    </div>
  );
}

// ─── Example: 02 — Call timeline ────────────────────────────────────────────
function CallExample() {
  return (
    <div style={CARD_S}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0 }}
        className="px-4 py-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <Phone size={12} color="#ef4444" />
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>11:47 PM · Llamada entrante</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>No disponible</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
        className="flex justify-center" style={{ margin: '-4px 0' }}>
        <div style={{ width: 1, height: 20, background: 'rgba(108,59,255,0.3)' }} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.5 }}
        className="px-4 py-4 flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(108,59,255,0.2)', border: '1px solid rgba(108,59,255,0.4)', fontSize: 11, fontWeight: 800, color: '#9B6DFF' }}>
          C
        </div>
        <div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>11:48 PM · Centinelia</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: 500, lineHeight: 1.55 }}>
            Hola. Gracias por llamar.<br />¿En qué puedo ayudarte?
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
        className="flex justify-center" style={{ margin: '-4px 0' }}>
        <div style={{ width: 1, height: 20, background: 'rgba(108,59,255,0.3)' }} />
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
        <GreenCheck label="Cita agendada" />
      </motion.div>
    </div>
  );
}

// ─── Example: 03 — Learning bar chart ──────────────────────────────────────
function LearningExample() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const rows = [
    { label: 'Semana 1', filled: 2, pct: 15 },
    { label: 'Semana 2', filled: 4, pct: 45 },
    { label: 'Semana 4', filled: 8, pct: 90 },
  ];

  return (
    <div style={CARD_S}>
      <div className="px-4 py-3"
        style={{ background: 'rgba(108,59,255,0.1)', borderBottom: '1px solid rgba(108,59,255,0.22)' }}>
        <p style={{ ...LBL_S, color: '#9B6DFF' }}>Resolución autónoma</p>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {rows.map((row, ri) => (
          <div key={row.label}>
            <div className="flex items-center gap-2.5">
              <span style={{ minWidth: 68, fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
              <div className="flex gap-[3px]">
                {Array.from({ length: 8 }).map((_, bi) => (
                  <div key={bi} style={{
                    width: 9, height: 9, borderRadius: 2,
                    background: mounted && bi < row.filled ? '#6C3BFF' : 'rgba(255,255,255,0.1)',
                    transition: `background 0.22s ease ${bi * 0.055 + ri * 0.22}s`,
                  }} />
                ))}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#9B6DFF', minWidth: 30,
                opacity: mounted ? 1 : 0,
                transition: `opacity 0.25s ease ${0.5 + ri * 0.22}s`,
              }}>
                {row.pct}%
              </span>
            </div>
            {ri < rows.length - 1 && (
              <div style={{ height: 1, background: 'rgba(108,59,255,0.08)', marginTop: 10, marginBottom: 2 }} />
            )}
          </div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
        <GreenCheck label="Sin intervención manual" />
      </motion.div>
    </div>
  );
}

// ─── Example: 04 — Blocked action notification ──────────────────────────────
function BlockedActionExample() {
  return (
    <div style={CARD_S}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0 }}
        className="px-4 py-3 flex items-center gap-2"
        style={{ background: 'rgba(251,146,60,0.08)', borderBottom: '1px solid rgba(251,146,60,0.18)' }}>
        <ShieldAlert size={13} color="#fb923c" />
        <span className="font-bold tracking-widest uppercase"
          style={{ fontSize: '9px', letterSpacing: '0.16em', color: '#fb923c' }}>
          Acción bloqueada
        </span>
      </motion.div>

      {/* Body */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="px-4 pt-5 pb-5">
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
          Centinelia intentó:
        </p>
        <p style={{ fontSize: 15, color: '#fff', fontWeight: 600, lineHeight: 1.45 }}>
          Modificar el precio<br />de un servicio.
        </p>
      </motion.div>

      {/* Divider */}
      <motion.div
        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        style={{ height: 1, background: 'rgba(108,59,255,0.18)', margin: '0 16px', transformOrigin: 'left' }}
      />

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.6 }}
        className="px-4 py-4 flex items-start gap-2.5">
        <Lock size={12} color="rgba(155,109,255,0.55)" style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
          Requiere aprobación<br />del administrador.
        </p>
      </motion.div>
    </div>
  );
}

// ─── Example: 05 — Privacy checklist ────────────────────────────────────────
function PrivacyExample() {
  const items = [
    'Cifrada',
    'Acceso privado',
    'Organización aislada',
    'Sin entrenamiento público',
  ];
  return (
    <div style={CARD_S}>
      <div className="px-4 py-3"
        style={{ background: 'rgba(74,222,128,0.07)', borderBottom: '1px solid rgba(74,222,128,0.18)' }}>
        <p style={{ ...LBL_S, color: 'rgba(74,222,128,0.8)' }}>Información</p>
      </div>
      <div className="px-4 py-4 flex flex-col gap-3">
        {items.map((item, i) => (
          <motion.div key={item}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.05 + i * 0.12 }}
            className="flex items-center gap-2.5">
            <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)' }}>
              <Check size={9} strokeWidth={3} color="#4ade80" />
            </div>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>{item}</span>
          </motion.div>
        ))}
      </div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
        <div className="px-4 py-3" style={FOOT_S}>
          <p style={{ fontSize: 11, color: 'rgba(74,222,128,0.75)', lineHeight: 1.55 }}>
            Tu conocimiento pertenece únicamente<br />a tu organización.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────────
const REGLAS = [
  { n: '01', rule: 'Nada importante\nvuelve a perderse.',  sub: 'Cada cliente, llamada y tarea queda registrada automáticamente.', Example: CrmExample         },
  { n: '02', rule: 'Siempre hay alguien disponible.',      sub: 'Tu oficina nunca deja de atender.',                            Example: CallExample        },
  { n: '03', rule: 'Cada día conoce mejor tu organización.',    sub: null,                                                              Example: LearningExample    },
  { n: '04', rule: 'Centinelia ejecuta.\nTú decides.',      sub: 'Tu oficina puede trabajar sola.\nLas decisiones importantes siguen siendo tuyas.', Example: BlockedActionExample },
  { n: '05', rule: 'Tu información\nsigue siendo tuya.',   sub: null,                                                                                   Example: PrivacyExample       },
];

type Phase = 'before' | 'pinned' | 'after';

// ─── Main ────────────────────────────────────────────────────────────────────
export default function ReglasManifesto() {
  const outerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [phase,  setPhase]  = useState<Phase>('before');

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const update = () => {
      const rect    = outer.getBoundingClientRect();
      const scrolled = -rect.top;                           // px scrolled past section top
      const total    = outer.offsetHeight - window.innerHeight; // total scroll distance

      if (scrolled <= 0) {
        setPhase('before');
      } else if (scrolled >= total) {
        setPhase('after');
        setActive(REGLAS.length - 1);
      } else {
        setPhase('pinned');
        const progress = scrolled / total;
        setActive(Math.max(0, Math.min(Math.floor(progress * REGLAS.length), REGLAS.length - 1)));
      }
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => window.removeEventListener('scroll', update);
  }, []);

  const panelCss: React.CSSProperties =
    phase === 'pinned'
      ? { position: 'fixed',    top: 0,    left: 0, right: 0 }
      : phase === 'after'
      ? { position: 'absolute', bottom: 0, left: 0, right: 0 }
      : { position: 'absolute', top: 0,    left: 0, right: 0 };

  const { n, rule, sub, Example } = REGLAS[active];

  return (
    <div ref={outerRef} className="relative" style={{ height: '520vh', background: '#130826' }}>
      <div style={{ ...panelCss, height: '100vh', background: '#130826', overflow: 'hidden', zIndex: 10 }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-10 h-full flex flex-col justify-center gap-6 sm:gap-8">

          {/* Section header */}
          <div>
            <p className="text-xs font-bold tracking-widest uppercase mb-2"
              style={{ color: 'rgba(155,109,255,0.4)' }}>
              Principios
            </p>
            <p className="font-bold tracking-tight"
              style={{ fontSize: 'clamp(1rem, 2.2vw, 1.4rem)', color: 'rgba(255,255,255,0.4)', lineHeight: 1.15 }}>
              Las reglas de tu oficina digital.
            </p>
          </div>

          {/* Progress pills */}
          <div className="flex items-center gap-2">
            {REGLAS.map((_, i) => (
              <div key={i} style={{
                height: 3, borderRadius: 2,
                width: i === active ? 28 : 6,
                background: i === active ? '#6C3BFF' : 'rgba(255,255,255,0.14)',
                transition: 'all 0.4s ease',
              }} />
            ))}
          </div>

          {/* Active principle */}
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
              exit={{ opacity: 0, y: -20, transition: { duration: 0.22, ease: 'easeIn' } }}
              className="flex flex-col sm:flex-row gap-6 sm:gap-14 items-start"
            >
              {/* Text column */}
              <div className="flex-1 min-w-0">
                <p className="font-bold tabular-nums mb-3"
                  style={{ fontSize: '0.65rem', letterSpacing: '0.28em', color: 'rgba(108,59,255,0.5)' }}>
                  {n}
                </p>
                <h3 className="font-bold mb-3"
                  style={{ fontSize: 'clamp(1.7rem, 3.8vw, 2.9rem)', color: '#fff', lineHeight: 1.08, whiteSpace: 'pre-line' }}>
                  {rule}
                </h3>
                {sub && (
                  <p className="text-sm leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.36)', maxWidth: 440, whiteSpace: 'pre-line' }}>
                    {sub}
                  </p>
                )}
              </div>

              {/* Example card */}
              <div className="w-full sm:w-72 flex-shrink-0">
                <Example />
              </div>
            </motion.div>
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
