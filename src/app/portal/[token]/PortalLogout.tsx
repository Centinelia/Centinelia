'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function PortalLogout({ onDark = false }: { onDark?: boolean } = {}) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/portal/auth/logout', { method: 'POST' });
    router.push('/portal/login');
  };

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-80"
      style={{ color: onDark ? 'rgba(255,255,255,0.85)' : 'var(--c-text-4)' }}
      title="Cerrar sesión"
    >
      <LogOut size={13} />
      <span className="hidden sm:inline">Salir</span>
    </button>
  );
}
