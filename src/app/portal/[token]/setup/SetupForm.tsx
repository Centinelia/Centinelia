'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';

export default function SetupForm({ token, businessName }: { token: string; businessName: string }) {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [pw, setPw]             = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (pw.length < 8)  { setError('La contraseña debe tener al menos 8 caracteres'); return; }

    setLoading(true);
    const res = await fetch('/api/portal/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, password: pw }),
    });
    const data = await res.json();

    if (res.ok) {
      router.push(`/portal/${token}`);
    } else if (data.error === 'already_registered') {
      router.push('/portal/login');
    } else {
      setError(data.error ?? 'Ocurrió un error, intenta de nuevo');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: '#0E0720' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <Image src="/logo-icon.png" alt="Centinelia" width={72} height={72} className="mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-white">Crea tu cuenta</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Portal de {businessName}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

            <div>
              <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FAFBFF' }}
              />
            </div>

            <div>
              <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Contraseña <span style={{ color: 'rgba(255,255,255,0.3)' }}>(mín. 8 caracteres)</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none pr-11"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FAFBFF' }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Confirmar contraseña
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FAFBFF' }}
              />
            </div>

            {error && (
              <p className="text-xs rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creando cuenta…' : 'Crear cuenta y entrar'}
            </button>
          </div>

          <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
            ¿Ya tienes cuenta?{' '}
            <a href="/portal/login" style={{ color: 'rgba(155,109,255,0.7)' }}>
              Inicia sesión
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
