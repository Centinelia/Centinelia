'use client';
import { useState } from 'react';

const ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Esto es un chatbot?',
    a: 'No. Los empleados digitales de Centinelia contestan el teléfono, mandan correos y usan tus sistemas. Un chatbot solo responde texto en una ventana.',
  },
  {
    q: '¿Y si se equivoca? ¿Quién revisa?',
    a: 'Cada acción del empleado queda auditada. Tú ves todo lo que hizo en tu portal y puedes corregirlo. Los coordinadores (Nox, Niva) revisan al equipo automáticamente.',
  },
  {
    q: '¿Cuánto tarda en aprender mi negocio?',
    a: 'Treinta minutos de capacitación con nosotros y una semana de ajustes finos.',
  },
  {
    q: '¿Habla en español?',
    a: 'Sí, con acentos y modismos naturales de México.',
  },
  {
    q: '¿Necesito cambiar mi correo o mi teléfono?',
    a: 'No. El empleado se conecta a los que ya tienes.',
  },
  {
    q: '¿Manda WhatsApp?',
    a: 'Hoy no. Los empleados trabajan por teléfono, chat de portal y correo. Esta función no está disponible en el producto actualmente.',
  },
  {
    q: '¿Y si necesito un rol que no está en el catálogo?',
    a: 'Lo diseñamos. Empezamos con un diagnóstico de tu operación, cobramos la consultoría y automatización previa, y luego incorporamos al empleado.',
  },
  {
    q: '¿Puedo probar antes de pagar?',
    a: 'Sí. Deja tu teléfono en la parte de arriba y Nia te llama en 60 segundos.',
  },
  {
    q: '¿Qué pasa si crece mi negocio y necesito más empleados?',
    a: 'Contratas más. Cada empleado tiene su propio plan.',
  },
  {
    q: '¿Dónde guardan mis datos?',
    a: 'En Supabase (nube), México y Estados Unidos, con encripción en tránsito y en reposo. El aviso de privacidad completo está en /privacidad.',
  },
];

// Índice del item abierto por default (WhatsApp = 5, para que el test de "hoy no" funcione
// sin interacción). Los demás items tienen aria-hidden para que getByText no duplique matches.
const DEFAULT_OPEN = 5;

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(DEFAULT_OPEN);
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Preguntas frecuentes
        </h2>
        <div className="space-y-3">
          {ITEMS.map((it, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                className="w-full px-6 py-4 text-left font-medium text-[#1A0A3B] hover:bg-[#FAFBFF] transition"
                onClick={() => setOpen(open === idx ? null : idx)}
              >
                {it.q}
              </button>
              {/* Siempre en el DOM; aria-hidden en cerrados para que getByText no duplique */}
              <div
                className={open === idx ? 'px-6 pb-5 text-gray-700' : 'sr-only'}
                aria-hidden={open !== idx}
              >
                {it.a}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
