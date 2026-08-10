'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Mail } from 'lucide-react';

type Step = 'request' | 'verify';

interface Props {
  token:        string;
  businessName: string;
  maskedEmail:  string;
}

export default function SetupForm({ token, businessName, maskedEmail }: Props) {
  const router = useRouter();
  const [step, setStep]         = useState<Step>('request');
  const [code, setCode]         = useState('');
  const [pw, setPw]             = useState('');
  const [confirm, setConfirm]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');

  const requestCode = async () => {
    setError(''); setInfo(''); setLoading(true);
    const res = await fetch('/api/portal/auth/setup/request-code', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'No se pudo enviar el código, intenta de nuevo');
      return;
    }
    setStep('verify');
    setInfo(`Enviamos un código a ${maskedEmail}. Revisa tu bandeja (y spam).`);
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6)     { setError('El código tiene 6 dígitos'); return; }
    if (pw !== confirm)        { setError('Las contraseñas no coinciden'); return; }
    if (pw.length < 8)         { setError('La contraseña debe tener al menos 8 caracteres'); return; }

    setLoading(true);
    const res = await fetch('/api/portal/auth/setup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, code, password: pw }),
    });
    const data = await res.json();

    if (res.ok) {
      router.push(`/portal/${data.token ?? token}`);
      return;
    }
    setLoading(false);
    if (data.error === 'already_registered') {
      router.push('/portal/login');
      return;
    }
    setError(data.error ?? 'Ocurrió un error, intenta de nuevo');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0E0720' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mb-4">
            <Image src="/logo-icon.png" alt="Centinelia" width={72} height={72} className="mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-white">Crea tu cuenta</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Portal de {businessName}</p>
        </div>

        {step === 'request' && (
          <div className="rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 flex-shrink-0" style={{ background: 'rgba(108,59,255,0.15)' }}>
                <Mail size={18} style={{ color: '#9B6DFF' }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#FAFBFF' }}>Verifica que eres tú</p>
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  Te enviaremos un código de 6 dígitos a
                </p>
                <p className="text-sm font-mono mt-1" style={{ color: '#9B6DFF' }}>{maskedEmail}</p>
              </div>
            </div>

            {error && (
              <p className="text-xs rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {error}
              </p>
            )}

            <button onClick={requestCode} disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
              style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Enviando…' : 'Enviar código'}
            </button>

            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              ¿No es tu correo?{' '}
              <a href="mailto:hola@centinelia.mx" style={{ color: 'rgba(155,109,255,0.7)' }}>
                Contáctanos
              </a>
            </p>
          </div>
        )}

        {step === 'verify' && (
          <form onSubmit={submitVerify} className="flex flex-col gap-4">
            <div className="rounded-2xl p-6 flex flex-col gap-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

              {info && (
                <p className="text-xs rounded-lg px-3 py-2"
                  style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.2)', color: '#C8BEE8' }}>
                  {info}
                </p>
              )}

              <div>
                <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  Código de 6 dígitos
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full rounded-xl px-4 py-3 text-lg text-center font-mono tracking-widest outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FAFBFF' }}
                />
              </div>

              <div>
                <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  Contraseña <span style={{ color: 'rgba(255,255,255,0.5)' }}>(mín. 8 caracteres)</span>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs mb-2" style={{ color: 'rgba(255,255,255,0.72)' }}>
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

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
                style={{ background: '#6C3BFF', color: '#FAFBFF', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Creando cuenta…' : 'Crear cuenta y entrar'}
              </button>

              <button type="button" onClick={() => { setStep('request'); setCode(''); setError(''); setInfo(''); }}
                className="text-xs" style={{ color: 'rgba(155,109,255,0.7)' }}>
                ← Cambiar correo o reenviar código
              </button>
            </div>

            <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              ¿Ya tienes cuenta?{' '}
              <a href="/portal/login" style={{ color: 'rgba(155,109,255,0.7)' }}>Inicia sesión</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
