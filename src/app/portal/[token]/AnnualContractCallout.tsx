// Callout reusable que reemplaza los botones de compra Stripe (contratar
// empleado, comprar minutos, comprar tareas, cambiar plan) cuando la
// organización opera bajo contrato anual prepagado.
//
// Ver docs/superpowers/specs/2026-08-02-annual-contracts-design.md §7.

'use client';

import { Mail } from 'lucide-react';

type Action = 'contratar_empleado' | 'comprar_minutos' | 'comprar_tareas' | 'cambiar_plan';

const HEADLINE: Record<Action, string> = {
  contratar_empleado: 'Para contratar empleados adicionales, contáctanos',
  comprar_minutos:    'Para comprar minutos adicionales, contáctanos',
  comprar_tareas:     'Para comprar paquetes de tareas, contáctanos',
  cambiar_plan:       'Para modificar tu plan, contáctanos',
};

const SUBJECT: Record<Action, string> = {
  contratar_empleado: 'Agregar empleado al contrato',
  comprar_minutos:    'Minutos adicionales al contrato',
  comprar_tareas:     'Tareas adicionales al contrato',
  cambiar_plan:       'Modificación de contrato',
};

interface Props {
  action:     Action;
  folio:      string;   // ej. CTR-2026-0003
  endDate:    string;   // ISO date
  isExpired?: boolean;  // muestra tono más urgente si el contrato expiró
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function AnnualContractCallout({ action, folio, endDate, isExpired }: Props) {
  const mailtoHref = `mailto:hola@centinelia.mx?subject=${encodeURIComponent(`${SUBJECT[action]} ${folio}`)}`;

  return (
    <div
      className="rounded-2xl border p-6 text-center"
      style={{
        borderColor: isExpired ? 'rgba(239,68,68,0.20)' : 'rgba(108,59,255,0.15)',
        background:  isExpired ? 'rgba(239,68,68,0.05)' : '#F4F0FF',
      }}
    >
      <p className="text-base font-semibold" style={{ color: '#1A0A3B' }}>
        {isExpired ? 'Contrato vencido' : HEADLINE[action]}
      </p>
      <p className="text-sm mt-2" style={{ color: 'rgba(26,10,59,0.65)' }}>
        {isExpired
          ? `Tu oficina opera bajo contrato anual (${folio}) que venció el ${formatDate(endDate)}. Para reactivar tu oficina y agregar empleados, contáctanos.`
          : `Tu oficina opera bajo contrato anual (${folio}), vigente hasta el ${formatDate(endDate)}.`}
      </p>
      <a
        href={mailtoHref}
        className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: '#6C3BFF' }}
      >
        <Mail size={14} />
        Escribir a Centinelia
      </a>
    </div>
  );
}
