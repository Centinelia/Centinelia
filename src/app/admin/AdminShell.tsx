'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Toaster } from 'sonner';
import AdminNav from './AdminNav';
import ThemeToggle from '@/components/ThemeToggle';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [open,    setOpen]    = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router   = useRouter();

  const handleLogout = async () => {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    router.push('/admin/login');
  };

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--c-bg)', color: 'var(--c-text)' }}>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-52 flex-shrink-0 flex flex-col overflow-hidden border-r transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ borderColor: 'rgba(255,255,255,0.07)', background: '#1A0A3B' }}
      >
        {/* Logo header */}
        <div
          className="px-4 py-2.5 border-b flex items-center justify-between gap-2 flex-shrink-0"
          style={{
            borderColor: 'rgba(255,255,255,0.12)',
            background: 'linear-gradient(135deg, #5B28FF 0%, #8B3FFF 100%)',
          }}
        >
          <Link href="/admin/dashboard" className="flex-1 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-tagline.png"
              alt="Centinelia"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
                filter: 'brightness(0) invert(1)',
              }}
            />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <AdminNav />

        {/* Cerrar sesión + ThemeToggle */}
        <div className="px-3 pb-2 flex-shrink-0 flex items-center justify-between">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--c-text-3)' }}
          >
            <LogOut size={13} />
            Cerrar sesión
          </button>
          {mounted && <ThemeToggle />}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-3 flex-shrink-0 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <p className="text-xs whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Powered by{' '}
            <a
              href="https://pneumastudio.mx"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'rgba(255,255,255,0.2)' }}
              className="hover:opacity-80 transition-opacity"
            >
              Pneuma Studio
            </a>
          </p>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile top bar */}
        <div
          className="lg:hidden flex items-center gap-3 px-4 py-1.5 sticky top-0 z-30 border-b"
          style={{
            background: 'linear-gradient(135deg, #5B28FF 0%, #8B3FFF 100%)',
            borderColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg flex-shrink-0"
            style={{ color: 'rgba(255,255,255,0.8)' }}
          >
            <Menu size={20} />
          </button>
          <Link href="/admin/dashboard" className="flex-1 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-tagline.png"
              alt="Centinelia"
              style={{
                height: 44,
                width: 'auto',
                display: 'block',
                filter: 'brightness(0) invert(1)',
              }}
            />
          </Link>
        </div>

        <main className="flex-1 overflow-auto" style={{ background: 'var(--c-bg)' }}>
          {children}
        </main>
      </div>

      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: { background: '#1e0d45', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' },
        }}
      />
    </div>
  );
}
