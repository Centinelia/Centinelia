'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const C = {
  text:    '#1A0A3B',
  textSub: 'rgba(26,10,59,0.55)',
  surface: '#FFFFFF',
  border:  'rgba(108,59,255,0.1)',
  accent:  '#6C3BFF',
};

const FAQS = [
  {
    q: '¿Suena natural o robótico?',
    a: 'Tu empleado usa voces de ElevenLabs, la misma tecnología que usan estudios de doblaje y plataformas globales. La mayoría de los clientes no notan la diferencia. Si quieres comprobarlo antes de contratar, llama al empleado demo.',
  },
  {
    q: '¿Qué pasa si no sabe responder algo?',
    a: 'Tu empleado reconoce sus límites. Si no tiene la información, lo dice con honestidad y ofrece tomar los datos del cliente para que el equipo le llame de regreso. Nunca inventa respuestas ni da información incorrecta.',
  },
  {
    q: '¿Cuánto tiempo tarda en estar activo?',
    a: 'Menos de 24 horas. Después de contratar, accedes al portal, agregas la información de tu organización (horarios, servicios, precios, FAQs) y tu empleado queda listo. No necesitas saber de tecnología.',
  },
  {
    q: '¿Funciona para mi tipo de organización?',
    a: 'Funciona para cualquier organización que reciba llamadas: clínicas, restaurantes, despachos, inmobiliarias, tiendas, universidades y más. Tu empleado aprende sobre tu organización específica, no viene preconfigurado para otro negocio.',
  },
  {
    q: '¿Puedo cancelar cuando quiera?',
    a: 'Sí, sin penalizaciones ni trámites. No hay contratos de permanencia. Si decides cancelar, el servicio termina al final del ciclo de facturación.',
  },
  {
    q: '¿Qué pasa si comete un error?',
    a: 'Tienes acceso a las grabaciones y transcripciones de cada llamada desde tu portal. Si algo no quedó bien, lo ajustas en la configuración en tiempo real y el cambio se aplica en minutos.',
  },
  {
    q: '¿Mis clientes van a saber que no están hablando con una persona?',
    a: 'Tu empleado habla de forma natural y no menciona proactivamente que es automatizado. Si algún cliente pregunta directamente, responde con honestidad. Puedes personalizar el nombre y la voz para que se sienta parte de tu equipo.',
  },
];

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {FAQS.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            style={{
              borderRadius: 14,
              border:       `1px solid ${isOpen ? 'rgba(108,59,255,0.25)' : C.border}`,
              background:   C.surface,
              overflow:     'hidden',
              transition:   'border-color 0.2s',
            }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              style={{
                width:          '100%',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                gap:            16,
                padding:        '16px 20px',
                background:     'none',
                border:         'none',
                cursor:         'pointer',
                textAlign:      'left',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
                {f.q}
              </span>
              <ChevronDown
                size={16}
                color={C.accent}
                style={{
                  flexShrink: 0,
                  transform:  isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s',
                }}
              />
            </button>
            {isOpen && (
              <p
                style={{
                  margin:     0,
                  padding:    '0 20px 16px',
                  fontSize:   13,
                  lineHeight: 1.65,
                  color:      C.textSub,
                }}
              >
                {f.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
