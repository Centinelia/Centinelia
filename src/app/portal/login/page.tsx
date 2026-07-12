'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const from         = searchParams.get('from') ?? '';

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/portal/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    if (res.ok) {
      const { token } = await res.json();
      const dest = from.startsWith('/portal/') ? from : `/portal/${token}`;
      router.push(dest);
    } else {
      const { error: msg } = await res.json().catch(() => ({ error: 'Error al iniciar sesión' }));
      setError(msg ?? 'Error al iniciar sesión');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center px-4 overflow-hidden film-grain"
      style={{ background: '#0E0720' }}
    >
      {/* Orbs */}
      <div className="orb" style={{ width: 700, height: 700, top: -300, left: '40%', background: 'radial-gradient(circle, rgba(108,59,255,0.22) 0%, transparent 65%)', ['--orb-dur' as string]: '13s' }} />
      <div className="orb" style={{ width: 400, height: 400, bottom: -150, right: -100, background: 'radial-gradient(circle, rgba(155,109,255,0.14) 0%, transparent 65%)', ['--orb-dur' as string]: '17s' }} />

      <div className="w-full max-w-sm" style={{ position: 'relative', zIndex: 1 }}>
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <Image src="/logo-icon.png" alt="Centinelia" width={68} height={68} style={{ width: 68, height: 68, objectFit: 'contain' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#FAFBFF', fontFamily: 'var(--font-sora)' }}>Centinelia</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--c-text-3)' }}>Portal del cliente</p>
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
          <h2 className="text-base font-semibold mb-1" style={{ color: '#FAFBFF', fontFamily: 'var(--font-sora)' }}>
            Iniciar sesión
          </h2>

          {error && (
            <div className="px-3 py-2.5 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--c-text-2)' }}>Correo electrónico</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full px-4 py-3 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FAFBFF', outline: 'none' }}
            />
          </div>

          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--c-text-2)' }}>Contraseña</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-11 rounded-xl text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FAFBFF', outline: 'none' }}
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#FAFBFF', opacity: loading ? 0.7 : 1, border: 'none', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
          ¿Problemas para entrar? Contacta a tu asesor de Centinelia.
        </p>
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
