'use client';

import { useState } from 'react';

interface Props {
  inviteToken:  string;
  email:        string;
  name:         string | null;
  accountEmail: string;
  expired:      boolean;
  used:         boolean;
}

export default function JoinForm({ inviteToken, email, name, accountEmail, expired, used }: Props) {
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const disabled = expired || used;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (password.length < 8)  { setError('Mínimo 8 caracteres.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/portal/join/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invite_token: inviteToken, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo completar el registro.'); return; }
      window.location.href = `/portal/${data.token}`;
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0517', color: '#F1EEFF', padding: '40px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 480, width: '100%', background: 'rgba(155,109,255,0.06)', border: '1px solid rgba(155,109,255,0.2)', borderRadius: 16, padding: 32 }}>
        <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 12, background: 'rgba(155,109,255,0.15)', color: '#9B6DFF', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 16 }}>
          INVITACIÓN
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
          {expired ? 'Invitación expirada' : used ? 'Invitación ya usada' : `Hola${name ? ` ${name}` : ''}`}
        </h1>
        <p style={{ color: '#C8BEE8', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
          {expired
            ? 'Este link expiró. Pídele al dueño de la cuenta que te envíe una nueva invitación.'
            : used
            ? 'Este link ya se usó. Si eres tú, inicia sesión con tu contraseña.'
            : <>Te invitaron a colaborar en <b>{accountEmail}</b>. Elige tu contraseña — solo la sabrás tú, ni el dueño puede verla.</>}
        </p>

        {!disabled && (
          <form onSubmit={submit}>
            <label style={{ fontSize: 12, color: '#8C7FB8', display: 'block', marginBottom: 6 }}>Tu correo</label>
            <input value={email} readOnly style={{ ...inputStyle, opacity: 0.6 }} />
            <div style={{ height: 16 }} />
            <label style={{ fontSize: 12, color: '#8C7FB8', display: 'block', marginBottom: 6 }}>Contraseña (mín. 8 caracteres)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} style={inputStyle} />
            <div style={{ height: 12 }} />
            <label style={{ fontSize: 12, color: '#8C7FB8', display: 'block', marginBottom: 6 }}>Repite la contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} style={inputStyle} />
            {error && <div style={{ marginTop: 12, padding: 12, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: 8, color: '#FF9999', fontSize: 13 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ marginTop: 20, width: '100%', padding: '12px 20px', background: '#6C3BFF', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creando cuenta…' : 'Aceptar invitación y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border:     '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding:    '12px 16px',
  color:      '#F1EEFF',
  width:      '100%',
  fontSize:   14,
  outline:    'none',
} as const;
