'use client';

import { useState } from 'react';
import { Phone, ChevronRight, Stethoscope, UtensilsCrossed, Briefcase, Sparkles, PhoneOutgoing, Lightbulb, MessageSquareQuote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Scenario {
  id:         string;
  icon:       LucideIcon;
  role:       string;
  industry:   string;
  badge:      string;
  badgeColor: string;
  opening:    string;
  hint:       string;
}

const SCENARIOS: Scenario[] = [
  {
    id:         'medica',
    icon:       Stethoscope,
    role:       'Recepcionista médica',
    industry:   'Clínica · Consultorio · Dentista',
    badge:      'Citas + info',
    badgeColor: '#2563eb',
    opening:    'Hola, quiero agendar una consulta y preguntar por los costos.',
    hint:       'Tu empleado tomará tus datos, buscará disponibilidad y confirmará la cita. También responde preguntas sobre servicios, precios y doctores disponibles.',
  },
  {
    id:         'pedidos',
    icon:       UtensilsCrossed,
    role:       'Tomador de pedidos',
    industry:   'Restaurante · Cafetería · Delivery',
    badge:      'Pedidos + entregas',
    badgeColor: '#d97706',
    opening:    'Hola, quiero hacer un pedido para llevar.',
    hint:       'Pide lo que quieras del menú. Tu empleado capturará cada producto, preguntará si es para llevar o a domicilio, confirmará la dirección y cerrará el pedido.',
  },
  {
    id:         'vendedor',
    icon:       Briefcase,
    role:       'Vendedor / Calificador',
    industry:   'Agencia · Consultoría · Servicios B2B',
    badge:      'Leads + calificación',
    badgeColor: '#059669',
    opening:    'Hola, busco a alguien que me ayude con marketing digital para mi empresa.',
    hint:       'Tu empleado te calificará como prospecto: preguntará sobre tu negocio, presupuesto y urgencia. Así convierte llamadas frías en leads calificados.',
  },
  {
    id:         'seguimiento',
    icon:       PhoneOutgoing,
    role:       'Agente de seguimiento',
    industry:   'Cualquier negocio · Llamadas salientes',
    badge:      'Callbacks + recontacto',
    badgeColor: '#7c3aed',
    opening:    'Actúa como si me regresaras una llamada perdida de ayer.',
    hint:       'Verás cómo tu empleado retoma el contacto, se disculpa por no haber contestado antes y lleva la conversación desde cero. Así funciona la devolución automática de llamadas perdidas.',
  },
  {
    id:         'citas',
    icon:       Sparkles,
    role:       'Gestor de agenda',
    industry:   'Estética · Spa · Bienestar · Salud',
    badge:      'Agendar + modificar + cancelar',
    badgeColor: '#e11d48',
    opening:    'Necesito cambiar mi cita del jueves a la próxima semana.',
    hint:       'Tu empleado manejará la modificación, encontrará un nuevo horario disponible y lo confirmará. También puede cancelar citas o crear nuevas desde cero.',
  },
  {
    id:         'libre',
    icon:       Lightbulb,
    role:       'Tú decides el rol',
    industry:   'Cualquier giro · Cualquier función',
    badge:      'Personalizable al 100%',
    badgeColor: '#6C3BFF',
    opening:    'Actúa como si fueras la recepcionista de [tu negocio]. Voy a llamar como cliente.',
    hint:       'Dile qué negocio quieres que simule y empieza a interactuar. Tu empleado se adapta al instante: industria, tono, servicios, precios. Todo lo que le digas, lo adopta.',
  },
];

interface Props {
  demoPhone:     string;
  demoPhoneHref: string;
}

export default function DemoSelector({ demoPhone, demoPhoneHref }: Props) {
  const [selected, setSelected] = useState<Scenario | null>(null);

  if (selected) {
    const SelectedIcon = selected.icon;
    return (
      <div style={{ animation: 'fadeUp 0.3s ease both' }}>
        <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }`}</style>

        {/* Back chip */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-70"
            style={{
              background: `${selected.badgeColor}14`,
              border:     `1px solid ${selected.badgeColor}30`,
              color:      selected.badgeColor,
            }}
          >
            <SelectedIcon size={11} />
            {selected.role}
            <span style={{ opacity: 0.5 }}>· cambiar</span>
          </button>
        </div>

        <div className="max-w-md mx-auto flex flex-col gap-4">
          {/* Script — what to say */}
          <div
            className="rounded-2xl px-5 py-4"
            style={{ background: `${selected.badgeColor}0D`, border: `1px solid ${selected.badgeColor}28` }}
          >
            <p
              className="flex items-center gap-1.5 text-xs font-semibold mb-2"
              style={{ color: selected.badgeColor }}
            >
              <MessageSquareQuote size={12} /> Cuando contesten, di esto:
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: 'rgba(26,10,59,0.8)', fontStyle: 'italic' }}
            >
              &ldquo;{selected.opening}&rdquo;
            </p>
          </div>

          {/* Phone card */}
          <a
            href={demoPhoneHref}
            className="flex flex-col items-center gap-3 rounded-2xl p-7 transition-all hover:scale-[1.015]"
            style={{
              background:     'linear-gradient(135deg, rgba(108,59,255,0.07), rgba(155,109,255,0.04))',
              border:         '1.5px solid rgba(108,59,255,0.28)',
              boxShadow:      '0 6px 32px rgba(108,59,255,0.09)',
              textDecoration: 'none',
            }}
          >
            <div
              className="flex items-center justify-center rounded-full"
              style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)' }}
            >
              <Phone size={20} color="#fff" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold mb-1 tracking-widest uppercase" style={{ color: 'rgba(26,10,59,0.35)' }}>
                Agente demo · disponible 24/7
              </p>
              <p className="font-bold tabular-nums" style={{ fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', color: '#1A0A3B' }}>
                {demoPhone}
              </p>
              <p className="text-xs mt-1 sm:hidden" style={{ color: 'rgba(26,10,59,0.38)' }}>Toca para llamar</p>
              <p className="text-xs mt-1 hidden sm:block" style={{ color: 'rgba(26,10,59,0.38)' }}>Marca este número desde tu teléfono</p>
            </div>
          </a>

          {/* Hint — what to expect */}
          <div
            className="rounded-xl px-5 py-4"
            style={{ background: 'rgba(26,10,59,0.03)', border: '1px solid rgba(26,10,59,0.07)' }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: 'rgba(26,10,59,0.4)' }}>Qué esperar</p>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(26,10,59,0.6)' }}>
              {selected.hint}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-center text-sm mb-5" style={{ color: 'rgba(26,10,59,0.45)' }}>
        Contrata un:
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SCENARIOS.map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="flex flex-col gap-3 rounded-xl p-4 text-left transition-all hover:scale-[1.015]"
              style={{
                background: s.id === 'libre' ? 'rgba(108,59,255,0.03)' : '#FFFFFF',
                border:     s.id === 'libre' ? '1px dashed rgba(108,59,255,0.22)' : '1px solid rgba(108,59,255,0.1)',
                cursor:     'pointer',
              }}
            >
              {/* Top row: icon + badge + arrow */}
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 36, height: 36, background: `${s.badgeColor}12`, flexShrink: 0 }}
                >
                  <Icon size={16} color={s.badgeColor} strokeWidth={1.75} />
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${s.badgeColor}12`, color: s.badgeColor }}
                  >
                    {s.badge}
                  </span>
                  <ChevronRight size={13} style={{ color: 'rgba(26,10,59,0.25)', flexShrink: 0 }} />
                </div>
              </div>

              {/* Role + industry */}
              <div>
                <p className="font-semibold text-sm leading-snug" style={{ color: '#1A0A3B' }}>{s.role}</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(26,10,59,0.4)' }}>{s.industry}</p>
              </div>

              {/* Opening script preview */}
              <p
                className="text-xs leading-relaxed line-clamp-2"
                style={{
                  color:       'rgba(26,10,59,0.45)',
                  fontStyle:   'italic',
                  paddingTop:  6,
                  borderTop:   '1px solid rgba(26,10,59,0.06)',
                }}
              >
                &ldquo;{s.opening}&rdquo;
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
