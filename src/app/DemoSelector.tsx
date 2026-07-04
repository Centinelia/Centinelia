'use client';

import { useState } from 'react';
import { Phone, ChevronRight, Stethoscope, UtensilsCrossed, Briefcase, Building2, ShoppingBag, Sparkles, Lightbulb } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Giro {
  id:    string;
  icon:  LucideIcon;
  label: string;
  sub:   string;
  hint:  string;
}

const GIROS: Giro[] = [
  {
    id:    'clinica',
    icon:  Stethoscope,
    label: 'Clínica / Consultorio',
    sub:   'Médicos, dentistas, psicólogos...',
    hint:  'El agente se presenta como recepcionista. Pregúntale por citas, costos o disponibilidad de doctores.',
  },
  {
    id:    'restaurante',
    icon:  UtensilsCrossed,
    label: 'Restaurante / Café',
    sub:   'Comida, bebidas, reservaciones...',
    hint:  'El agente tomará tu orden, responderá sobre el menú y podrá agendar una reservación para ti.',
  },
  {
    id:    'despacho',
    icon:  Briefcase,
    label: 'Despacho / Consultoría',
    sub:   'Contadores, abogados, agencias...',
    hint:  'El agente calificará tu consulta, tomará tus datos y te explicará los servicios de la firma.',
  },
  {
    id:    'inmobiliaria',
    icon:  Building2,
    label: 'Inmobiliaria',
    sub:   'Rentas, ventas, propiedades...',
    hint:  'El agente atenderá tu búsqueda, filtrará opciones según tu presupuesto y agendará una visita.',
  },
  {
    id:    'tienda',
    icon:  ShoppingBag,
    label: 'Tienda / Servicio',
    sub:   'Retail, entregas, pedidos...',
    hint:  'El agente tomará tu pedido, verificará disponibilidad y coordinará la entrega o recolección.',
  },
];

const OTRO: Giro = {
  id:    'otro',
  icon:  Sparkles,
  label: 'Otro giro',
  sub:   'Se adapta a cualquier negocio',
  hint:  'Dile al agente qué tipo de negocio quieres que simule. Él se adapta a cualquier escenario y llevará la conversación desde ahí.',
};

interface Props {
  demoPhone:     string;
  demoPhoneHref: string;
}

export default function DemoSelector({ demoPhone, demoPhoneHref }: Props) {
  const [selected, setSelected] = useState<Giro | null>(null);

  if (selected) {
    const SelectedIcon = selected.icon;
    return (
      <div style={{ animation: 'fadeUp 0.35s ease both' }}>
        <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:none } }`}</style>

        {/* Selected giro chip */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'rgba(108,59,255,0.1)',
              border:     '1px solid rgba(108,59,255,0.25)',
              color:      '#6C3BFF',
              cursor:     'pointer',
            }}
          >
            <SelectedIcon size={12} />
            {selected.label}
            <span style={{ opacity: 0.5 }}>· cambiar</span>
          </button>
        </div>

        {/* Phone card */}
        <div className="max-w-sm mx-auto mb-8">
          <a
            href={demoPhoneHref}
            className="flex flex-col items-center gap-3 rounded-2xl p-8 transition-all hover:scale-[1.02]"
            style={{
              background:     'linear-gradient(135deg, rgba(108,59,255,0.08), rgba(155,109,255,0.05))',
              border:         '1.5px solid rgba(108,59,255,0.3)',
              boxShadow:      '0 8px 40px rgba(108,59,255,0.1)',
              textDecoration: 'none',
            }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}
            >
              <Phone size={22} color="#fff" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'rgba(26,10,59,0.38)' }}>
                Agente demo · 24/7
              </p>
              <p className="font-bold tabular-nums" style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', color: '#1A0A3B' }}>
                {demoPhone}
              </p>
              <p className="text-xs mt-1 sm:hidden" style={{ color: 'rgba(26,10,59,0.38)' }}>Toca para llamar</p>
              <p className="text-xs mt-1 hidden sm:block" style={{ color: 'rgba(26,10,59,0.38)' }}>Marca este número desde tu teléfono</p>
            </div>
          </a>
        </div>

        {/* Hint */}
        <div
          className="max-w-md mx-auto rounded-xl px-5 py-4 text-center"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}
        >
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold mb-1" style={{ color: '#6C3BFF' }}>
            <Lightbulb size={12} /> Qué decir cuando contesten
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,10,59,0.65)' }}>
            {selected.hint}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-center text-sm mb-6" style={{ color: 'rgba(26,10,59,0.5)' }}>
        ¿Qué tipo de negocio quieres probar?
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[...GIROS, OTRO].map((g, idx) => {
          const Icon = g.icon;
          const isOtro = g.id === 'otro';
          return (
            <button
              key={g.id}
              onClick={() => setSelected(g)}
              className="flex items-center gap-4 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:border-purple-400"
              style={{
                background: isOtro ? 'rgba(108,59,255,0.04)' : '#FFFFFF',
                border:     isOtro ? '1px dashed rgba(108,59,255,0.25)' : '1px solid rgba(108,59,255,0.12)',
                cursor:     'pointer',
              }}
            >
              <div
                className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 40, height: 40, background: 'rgba(108,59,255,0.08)' }}
              >
                <Icon size={18} color="#6C3BFF" strokeWidth={1.75} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-semibold text-sm" style={{ color: '#1A0A3B' }}>{g.label}</p>
                <p className="text-xs truncate" style={{ color: 'rgba(26,10,59,0.45)', marginTop: 1 }}>{g.sub}</p>
              </div>
              <ChevronRight size={14} style={{ color: 'rgba(108,59,255,0.4)', flexShrink: 0 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
