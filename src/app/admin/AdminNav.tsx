'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Bot, BarChart3, Plus, CreditCard, FileText, Users, Settings, Phone } from 'lucide-react';

const links = [
  { href: '/admin/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/clientes',     icon: Users,           label: 'Clientes' },
  { href: '/admin/agentes',      icon: Bot,             label: 'Agentes' },
  { href: '/admin/llamadas',     icon: Phone,           label: 'Llamadas' },
  { href: '/admin/analytics',    icon: BarChart3,       label: 'Analytics' },
  { href: '/admin/billing',      icon: CreditCard,      label: 'Facturación' },
  { href: '/admin/contratos',    icon: FileText,        label: 'Contratos' },
];

export default function AdminNav() {
  const path = usePathname();

  return (
    <nav className="flex-1 min-h-0 p-4 flex flex-col gap-0.5 overflow-y-auto">
      <Link
        href="/admin/agentes/nuevo"
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity mb-2"
        style={{ background: '#6C3BFF', color: '#FAFBFF' }}
      >
        <Plus size={14} />
        Nuevo agente
      </Link>

      {links.map(({ href, icon: Icon, label }) => {
        const active = path === href || path.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
            style={{
              color: active ? '#9B6DFF' : 'rgba(255,255,255,0.45)',
              background: active ? 'rgba(108,59,255,0.12)' : 'transparent',
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}

      {/* Configuración — fijo al fondo del nav */}
      <div className="mt-auto pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        {(() => {
          const active = path === '/admin/configuracion' || path.startsWith('/admin/configuracion/');
          return (
            <Link
              href="/admin/configuracion"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all"
              style={{
                color: active ? '#9B6DFF' : 'rgba(255,255,255,0.45)',
                background: active ? 'rgba(108,59,255,0.12)' : 'transparent',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Settings size={16} />
              Configuración
            </Link>
          );
        })()}
      </div>

    </nav>
  );
}
