'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calculator, TrendingUp } from 'lucide-react';
import { TIER_PRICE_MXN, FEATURE_PLAN_CONFIG } from '@/lib/billing/plans';

const C = {
  bg:      '#FAFBFF',
  bgAlt:   '#F4F0FF',
  surface: '#FFFFFF',
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  border:  'rgba(108,59,255,0.15)',
  accent:  '#6C3BFF',
};

interface Inputs {
  llamadasMes:       number;
  ticketPromedio:    number;
  conversion:        number;   // 0..100
  perdidasEstimadas: number;   // 0..100
  sueldoActual:      number;   // costo integrado mensual (con IMSS, aguinaldo, etc.)
}

const DEFAULT_INPUTS: Inputs = {
  llamadasMes:       200,
  ticketPromedio:    3000,
  conversion:        20,
  perdidasEstimadas: 25,
  sueldoActual:      15000,
};

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('es-MX')} MXN`;
}

function pickPlan(minutesPerMonth: number): { label: string; price: number; minutes: number } {
  // asumiendo llamada promedio de 2 min entrantes + 1 min saliente = 3 min
  // para efectos de recomendación conservadora, sumamos capacidad de salientes
  if (minutesPerMonth <= 250)  return { label: 'Esencial',     price: TIER_PRICE_MXN.starter, minutes: 250 };
  if (minutesPerMonth <= 500)  return { label: 'Profesional',  price: TIER_PRICE_MXN.growth,  minutes: 500 };
  if (minutesPerMonth <= 1000) return { label: 'Alta Demanda', price: TIER_PRICE_MXN.scale,   minutes: 1000 };
  return { label: 'Empresarial (cotización)', price: TIER_PRICE_MXN.scale, minutes: 1000 };
}

export default function CalculadoraForm() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);

  const resultado = useMemo(() => {
    const { llamadasMes, ticketPromedio, conversion, perdidasEstimadas, sueldoActual } = inputs;

    // Valor por llamada atendida (esperado)
    const valorPorLlamada = ticketPromedio * (conversion / 100);

    // Llamadas que hoy se pierden y por lo tanto valor perdido mensual
    const llamadasPerdidas   = llamadasMes * (perdidasEstimadas / 100);
    const valorMensualPerdido = llamadasPerdidas * valorPorLlamada;

    // Recomendación de plan (asumiendo 2 min promedio por llamada + 30% de salientes)
    const minutosEstimados = Math.round(llamadasMes * 2 * 1.3);
    const plan             = pickPlan(minutosEstimados);

    // Costo empleado digital primer año (mensualidad × 12 + setup one-time)
    const costoDigitalMensual = plan.price;
    const costoDigitalPrimerAnio = costoDigitalMensual * 12 + FEATURE_PLAN_CONFIG.pro.setupFee;
    const costoDigitalPromedioMensualPrimerAnio = costoDigitalPrimerAnio / 12;

    // Ahorro directo si sustituye una posición (aunque el modelo típico es híbrido)
    const ahorroDirectoMensual = Math.max(0, sueldoActual - costoDigitalMensual);

    // Ganancia por llamadas recuperadas (asumiendo que empleado digital atiende
    // el 90% de las que hoy se pierden — es conservador; en la realidad captura casi 100%)
    const gananciaMensualRecuperada = valorMensualPerdido * 0.9;

    // Ahorro/ganancia total mensual
    const impactoMensualTotal = ahorroDirectoMensual + gananciaMensualRecuperada;

    // Payback (meses para recuperar setup + primer mes de suscripción)
    const inversionInicial = FEATURE_PLAN_CONFIG.pro.setupFee + costoDigitalMensual;
    const mesesPayback     = impactoMensualTotal > 0 ? inversionInicial / impactoMensualTotal : Infinity;

    return {
      valorPorLlamada,
      llamadasPerdidas,
      valorMensualPerdido,
      plan,
      costoDigitalMensual,
      costoDigitalPromedioMensualPrimerAnio,
      ahorroDirectoMensual,
      gananciaMensualRecuperada,
      impactoMensualTotal,
      mesesPayback,
    };
  }, [inputs]);

  return (
    <div className="max-w-5xl mx-auto px-6" style={{ paddingTop: 40, paddingBottom: 80 }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Formulario */}
        <div className="rounded-2xl p-8" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: `${C.accent}18` }}>
              <Calculator size={22} color={C.accent} />
            </div>
            <h2 className="font-bold" style={{ color: C.text, fontSize: '1.15rem' }}>Tus números</h2>
          </div>

          <Field
            label="Llamadas al mes (entrantes + salientes esperadas)"
            value={inputs.llamadasMes}
            onChange={v => setInputs({ ...inputs, llamadasMes: v })}
            min={10} max={5000} step={10}
            suffix="llamadas"
          />

          <Field
            label="Ticket promedio por cliente cerrado"
            value={inputs.ticketPromedio}
            onChange={v => setInputs({ ...inputs, ticketPromedio: v })}
            min={100} max={200000} step={100}
            suffix="MXN"
          />

          <Field
            label="% de llamadas que cierran venta"
            value={inputs.conversion}
            onChange={v => setInputs({ ...inputs, conversion: v })}
            min={1} max={100} step={1}
            suffix="%"
          />

          <Field
            label="% de llamadas que hoy pierdes (hora pico, noche, fin de semana)"
            value={inputs.perdidasEstimadas}
            onChange={v => setInputs({ ...inputs, perdidasEstimadas: v })}
            min={0} max={80} step={1}
            suffix="%"
          />

          <Field
            label="Costo integrado mensual de tu recepcionista actual (con IMSS + aguinaldo + PTU)"
            value={inputs.sueldoActual}
            onChange={v => setInputs({ ...inputs, sueldoActual: v })}
            min={0} max={80000} step={500}
            suffix="MXN"
          />

          <p className="text-xs mt-2" style={{ color: C.textSub, lineHeight: 1.55 }}>
            Si aún no tienes recepcionista, deja este campo en 0 y compara solo contra el escenario de contratar.
          </p>
        </div>

        {/* Resultado */}
        <div className="rounded-2xl p-8" style={{ background: 'linear-gradient(135deg, #0D0520 0%, #1A0A3B 100%)', color: '#fff' }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: 'rgba(155,109,255,0.25)' }}>
              <TrendingUp size={22} color="#C4A8FF" />
            </div>
            <h2 className="font-bold" style={{ color: '#fff', fontSize: '1.15rem' }}>Tu escenario</h2>
          </div>

          <Row label="Valor esperado por llamada"     value={formatCurrency(resultado.valorPorLlamada)} />
          <Row label="Llamadas perdidas al mes"        value={`${resultado.llamadasPerdidas.toFixed(0)}`} />
          <Row label="Valor perdido cada mes"          value={formatCurrency(resultado.valorMensualPerdido)} accent />

          <div style={{ margin: '20px 0', borderTop: '1px solid rgba(255,255,255,0.12)' }} />

          <Row label="Plan recomendado"                value={resultado.plan.label} />
          <Row label="Costo empleado digital mensual"  value={formatCurrency(resultado.costoDigitalMensual)} />
          <Row label="Costo promedio primer año"       value={formatCurrency(resultado.costoDigitalPromedioMensualPrimerAnio)} muted />

          <div style={{ margin: '20px 0', borderTop: '1px solid rgba(255,255,255,0.12)' }} />

          <Row label="Ahorro directo mensual (vs recepcionista actual)"    value={formatCurrency(resultado.ahorroDirectoMensual)} />
          <Row label="Ganancia mensual por llamadas recuperadas"           value={formatCurrency(resultado.gananciaMensualRecuperada)} />

          <div style={{ margin: '24px 0 20px', padding: 20, borderRadius: 12, background: 'rgba(108,59,255,0.25)', border: '1px solid rgba(155,109,255,0.4)' }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Impacto mensual total
            </p>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>
              {formatCurrency(resultado.impactoMensualTotal)}
            </p>
            <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Ahorro directo + ganancia por llamadas recuperadas
            </p>
          </div>

          <Row
            label="Meses para recuperar la incorporación"
            value={Number.isFinite(resultado.mesesPayback) ? `${resultado.mesesPayback.toFixed(1)} meses` : '—'}
          />

          <Link
            href="/registro"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold mt-6 transition-all hover:opacity-90 hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
          >
            Contratar mi primer empleado digital <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      <p className="text-xs text-center mt-8" style={{ color: C.textSub, maxWidth: 640, margin: '32px auto 0' }}>
        Cálculo orientativo con supuestos conservadores. Asume 2 minutos de duración promedio por llamada más 30% de salientes.
        El plan recomendado y el impacto real se calculan finalmente con tus datos reales durante el onboarding.
      </p>
    </div>
  );
}

function Field({
  label, value, onChange, min, max, step, suffix,
}: {
  label:    string;
  value:    number;
  onChange: (v: number) => void;
  min:      number;
  max:      number;
  step:     number;
  suffix:   string;
}) {
  return (
    <label className="block" style={{ marginBottom: 20 }}>
      <span className="text-sm font-medium" style={{ color: C.text, display: 'block', marginBottom: 8 }}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
          min={min}
          max={max}
          step={step}
          className="rounded-xl px-4 py-2.5 flex-1"
          style={{ background: C.bg, border: `1px solid ${C.border}`, fontSize: '1rem', color: C.text, minWidth: 100 }}
        />
        <span className="text-xs" style={{ color: C.textSub, minWidth: 60 }}>{suffix}</span>
      </div>
    </label>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <span style={{
        fontSize:  '0.85rem',
        color:     muted ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.68)',
      }}>
        {label}
      </span>
      <span style={{
        fontSize:  accent ? '1.15rem' : '0.95rem',
        fontWeight: accent ? 700 : 600,
        color:     accent ? '#C4A8FF' : (muted ? 'rgba(255,255,255,0.6)' : '#fff'),
        textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}
