'use client';

import {
  ArrowLeftRight, Globe, Cpu, Zap,
  Mic, ShieldCheck, PhoneIncoming, FileText, Clock, BadgeCheck, Mail, Phone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS: { icon: LucideIcon; label: string }[] = [
  { icon: Phone,          label: 'Atención 24/7' },
  { icon: ArrowLeftRight, label: 'Transferencia inteligente' },
  { icon: Globe,          label: 'Multiidioma ES + EN' },
  { icon: Cpu,            label: 'Empleados automatizados' },
  { icon: Zap,            label: 'Activo en 24 horas' },
  { icon: Mic,            label: 'Voz natural y fluida' },
  { icon: ShieldCheck,    label: 'Sin contratos' },
  { icon: PhoneIncoming,  label: 'Número local incluido' },
  { icon: FileText,       label: 'Grabaciones y transcripciones' },
  { icon: Clock,          label: 'Soporte en español' },
  { icon: BadgeCheck,     label: 'Recuperador de llamadas perdidas' },
  { icon: Mail,          label: 'Resúmenes por correo' },
];

export default function Marquee() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="marquee-track" aria-hidden>
      <div className="marquee-inner">
        {doubled.map((item, i) => {
          const Icon = item.icon;
          return (
            <span key={i} className="marquee-item">
              <Icon size={13} color="#6C3BFF" strokeWidth={2} style={{ flexShrink: 0 }} />
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
