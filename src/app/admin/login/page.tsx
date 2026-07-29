'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';

function LoginForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/admin/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    if (res.ok) {
      const from = params.get('from');
      // Solo respetamos `from` si empieza con /admin/ — nunca fuera del panel.
      const target = from && from.startsWith('/admin/') ? from : '/admin/inicio';
      window.location.href = target;
    } else {
      setError('Contraseña incorrecta');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-6 overflow-hidden film-grain"
      style={{ background: '#120726' }}
    >
      {/* Orbs */}
      <div className="orb" style={{ width: 600, height: 600, top: -200, left: '50%', transform: 'translateX(-50%)', background: 'radial-gradient(circle, rgba(108,59,255,0.25) 0%, transparent 65%)', ['--orb-dur' as string]: '11s' }} />
      <div className="orb" style={{ width: 280, height: 280, bottom: -80, right: -60, background: 'radial-gradient(circle, rgba(155,109,255,0.18) 0%, transparent 65%)', ['--orb-dur' as string]: '15s' }} />

      <div className="w-full max-w-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <Image src="/logo-icon.png" alt="Centinelia" width={68} height={68} style={{ width: 68, height: 68, objectFit: 'contain' }} />
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-sora)' }}>Centinelia</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--c-text-3)' }}>Panel de administración</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
          style={{
            background:           'rgba(255,255,255,0.04)',
            backdropFilter:       'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border:               '1px solid rgba(255,255,255,0.09)',
            borderRadius:         20,
            padding:              28,
          }}
        >
          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--c-text-2)' }}>Contraseña</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
                required
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 pr-10 text-sm"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border:     `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color:      '#e2e8f0',
                  outline:    'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors"
                style={{ color: 'var(--c-text-2)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {error && <p className="text-xs mt-2" style={{ color: '#f87171' }}>{error}</p>}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
              color:      '#fff',
              opacity:    loading || !password ? 0.6 : 1,
              border:     'none',
              cursor:     loading || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
