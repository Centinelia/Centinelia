'use client';

// Comparativa laboral — humano vs empleado digital.
// Bloque de argumento pre-pricing: muestra el costo real de contratar
// un humano (sueldo + IMSS + aguinaldo + PTU + vacaciones + faltas +
// capacitación) vs el costo de un empleado digital de Centinelia.
//
// Estilo matching DemoNia/NiaInterview: bg #FAFBFF, dark text, purple accent,
// framer-motion via AnimatedSection.

import AnimatedSection from './AnimatedSection';
import { Check, X } from 'lucide-react';

interface Row {
  label:      string;
  humano:     string;
  digital:    string;
  humanoBad?: boolean;  // ícono X vs check
  digitalOk?: boolean;  // ícono check verde
}

const ROWS: Row[] = [
  { label: 'Arranca en',                    humano: '2 a 4 semanas',           digital: 'El siguiente lunes',        humanoBad: true,  digitalOk: true  },
  { label: 'Sueldo mensual',                humano: '$12,000 a $25,000',       digital: 'Desde $2,997 + IVA',        humanoBad: false, digitalOk: true  },
  { label: 'IMSS y prestaciones',           humano: '+30% del sueldo',         digital: 'Incluido',                  humanoBad: true,  digitalOk: true  },
  { label: 'Aguinaldo',                     humano: '15 días',                  digital: 'No aplica',                 humanoBad: true,  digitalOk: true  },
  { label: 'Vacaciones (crecen cada año)',  humano: 'Sí',                       digital: 'No aplica',                 humanoBad: true,  digitalOk: true  },
  { label: 'Utilidades (PTU)',              humano: 'Sí',                       digital: 'No aplica',                 humanoBad: true,  digitalOk: true  },
  { label: 'Faltas y llegadas tarde',       humano: 'Pasa',                     digital: 'Nunca falta',               humanoBad: true,  digitalOk: true  },
  { label: 'Capacitación',                  humano: 'Semanas',                  digital: '30 minutos',                humanoBad: true,  digitalOk: true  },
  { label: 'Trabaja 24/7',                  humano: 'No',                       digital: 'Sí',                        humanoBad: true,  digitalOk: true  },
  { label: 'Contesta el teléfono',          humano: 'Sí',                       digital: 'Sí' },
  { label: 'Manda correos',                 humano: 'Sí',                       digital: 'Sí' },
  { label: 'Usa tus sistemas',              humano: 'Después de entrenarlo',   digital: 'Desde el día 1',            humanoBad: true,  digitalOk: true  },
  { label: 'Cotiza y factura',              humano: 'Sí',                       digital: 'Sí' },
];

function CellValue({ text, ok, bad }: { text: string; ok?: boolean; bad?: boolean }) {
  const iconColor = ok ? '#22c55e' : bad ? 'rgba(26,10,59,0.35)' : '#6C3BFF';
  const Icon      = bad ? X : Check;
  return (
    <div className="flex items-center gap-2">
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-full"
        style={{ width: 18, height: 18, background: `${iconColor}18` }}
      >
        <Icon size={11} color={iconColor} strokeWidth={2.5} />
      </span>
      <span className="text-sm" style={{ color: '#1A0A3B' }}>{text}</span>
    </div>
  );
}

export default function Comparativa() {
  return (
    <section
      style={{
        background:  '#FAFBFF',
        borderTop:   '1px solid rgba(108,59,255,0.1)',
        overflow:    'hidden',
      }}
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-32">

        <AnimatedSection className="mb-14 sm:mb-16 max-w-3xl">
          <p className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#6C3BFF' }}>
            El costo real de contratar
          </p>
          <h2
            className="font-extrabold tracking-tight mb-5"
            style={{ fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', color: '#1A0A3B', lineHeight: 1.06 }}
          >
            No es solo el sueldo.<br />Y no es lo único que se acumula.
          </h2>
          <p
            className="leading-relaxed"
            style={{ fontSize: 'clamp(0.95rem, 1.8vw, 1.05rem)', color: 'rgba(26,10,59,0.55)' }}
          >
            Antes de contratar a alguien, revisa lo que realmente cuesta cada mes y lo que un empleado digital resuelve por una fracción.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-0 rounded-2xl overflow-hidden" style={{ border: '1.5px solid rgba(108,59,255,0.15)' }}>

            {/* Columna Humano */}
            <div style={{ background: 'rgba(26,10,59,0.03)', borderRight: '1px solid rgba(108,59,255,0.15)' }}>
              <div className="px-6 sm:px-8 py-5" style={{ borderBottom: '1.5px solid rgba(108,59,255,0.15)' }}>
                <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: 'rgba(26,10,59,0.5)' }}>
                  Opción 1
                </p>
                <h3 className="font-bold" style={{ fontSize: '1.5rem', color: '#1A0A3B' }}>
                  Contratar un humano
                </h3>
              </div>
              <ul className="divide-y" style={{ ['--tw-divide-opacity' as string]: 1 }}>
                {ROWS.map((r) => (
                  <li key={`h-${r.label}`} className="px-6 sm:px-8 py-4" style={{ borderColor: 'rgba(108,59,255,0.08)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'rgba(26,10,59,0.35)' }}>
                      {r.label}
                    </p>
                    <CellValue text={r.humano} bad={r.humanoBad} />
                  </li>
                ))}
              </ul>
            </div>

            {/* Columna Digital */}
            <div style={{ background: 'rgba(108,59,255,0.04)' }}>
              <div
                className="px-6 sm:px-8 py-5"
                style={{
                  background: 'linear-gradient(135deg, rgba(108,59,255,0.12), rgba(155,109,255,0.08))',
                  borderBottom: '1.5px solid rgba(108,59,255,0.3)',
                }}
              >
                <p className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: '#6C3BFF' }}>
                  Opción 2
                </p>
                <h3 className="font-bold" style={{ fontSize: '1.5rem', color: '#1A0A3B' }}>
                  Empleado digital Centinelia
                </h3>
              </div>
              <ul>
                {ROWS.map((r) => (
                  <li key={`d-${r.label}`} className="px-6 sm:px-8 py-4" style={{ borderBottom: '1px solid rgba(108,59,255,0.08)' }}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: '#6C3BFF', opacity: 0.7 }}>
                      {r.label}
                    </p>
                    <CellValue text={r.digital} ok={r.digitalOk} />
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </AnimatedSection>

        {/* Footer stat */}
        <AnimatedSection delay={0.18}>
          <div
            className="mt-8 rounded-2xl px-6 sm:px-10 py-8 sm:py-10"
            style={{
              background: 'linear-gradient(135deg, #1A0A3B 0%, #2D1560 100%)',
              overflow:   'hidden',
              position:   'relative',
            }}
          >
            <div style={{
              position:   'absolute',
              top:        -80,
              right:      -80,
              width:      280,
              height:     280,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(155,109,255,0.35) 0%, transparent 65%)',
              pointerEvents: 'none',
            }} />
            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#B89CFF' }}>
                  Al año
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Un empleado humano cuesta entre <strong style={{ color: '#fff' }}>$200,000 y $450,000</strong> con sueldo y carga laboral completa.
                </p>
                <p className="text-sm leading-relaxed mt-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Un empleado digital arranca desde <strong style={{ color: '#fff' }}>$35,964 + IVA</strong>.
                </p>
              </div>
              <div className="flex flex-col items-start md:items-end">
                <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#B89CFF' }}>
                  Ahorro anual
                </p>
                <p
                  className="font-extrabold tabular-nums leading-none mt-2"
                  style={{
                    fontSize: 'clamp(2.8rem, 6vw, 4.2rem)',
                    background: 'linear-gradient(135deg, #C4A8FF 0%, #FFFFFF 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor:  'transparent',
                  }}
                >
                  Hasta 12x
                </p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  menos costo, sin carga fiscal
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

      </div>
    </section>
  );
}
