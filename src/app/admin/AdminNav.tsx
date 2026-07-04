'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Settings, BarChart3, Plus, CreditCard, LogOut, FileText, Users, MessageCircle, BookOpen, Phone, Bot } from 'lucide-react';

const links = [
  { href: '/admin/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/clientes',     icon: Users,           label: 'Clientes' },
  { href: '/admin/agentes',      icon: Settings,        label: 'Agentes de voz' },
  { href: '/admin/llamadas',     icon: Phone,           label: 'Llamadas' },
  { href: '/admin/demo',         icon: Bot,             label: 'Agente demo' },
  { href: '/admin/whatsapp',     icon: MessageCircle,   label: 'WhatsApp' },
  { href: '/admin/analytics',    icon: BarChart3,       label: 'Analytics' },
  { href: '/admin/billing',      icon: CreditCard,      label: 'Facturación' },
  { href: '/admin/contratos',    icon: FileText,        label: 'Contratos' },
  { href: '/admin/conocimiento', icon: BookOpen,        label: 'Conocimiento' },
];

export default function AdminNav() {
  const path = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  return (
    <nav className="flex-1 p-4 flex flex-col gap-0.5 overflow-y-auto">
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

      <div className="mt-4 pt-4 flex flex-col gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <Link
          href="/admin/agentes/nuevo"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
          style={{ background: '#6C3BFF', color: '#FAFBFF' }}
        >
          <Plus size={14} />
          Nuevo agente
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors text-left"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </nav>
  );
}
