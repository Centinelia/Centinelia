'use client';

import { useEffect, useState } from 'react';
import { Server, CheckCircle, Loader2, Trash2, AlertTriangle } from 'lucide-react';

interface Config {
  configured:   boolean;
  host:         string | null;
  port:         number | null;
  secure:       boolean;
  username:     string | null;
  from_display: string | null;
  status:       'active' | 'error' | null;
  tls_insecure: boolean;
  imap_host:    string | null;
  imap_port:    number | null;
  imap_configured: boolean;
}

/**
 * MVP outbound-only: cliente ingresa creds SMTP (host, port, user, pass) del
 * proveedor real de su correo (Telmex, Titan, cPanel, cualquier IMAP/SMTP
 * estándar). Los empleados envían FROM el dominio del cliente sin OAuth ni
 * cambios de DNS. Fase 2 amplía a leer inbox por IMAP.
 */
export default function SmtpConnectSection({ token, agentId }: { token: string; agentId: string }) {
  const [cfg,        setCfg]        = useState<Config | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);
  const [editing,    setEditing]    = useState(false);

  const [host,         setHost]         = useState('');
  const [port,         setPort]         = useState('465');
  const [secure,       setSecure]       = useState(true);
  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [fromDisplay,  setFromDisplay]  = useState('');
  const [tlsInsecure,  setTlsInsecure]  = useState(false);
  const [enableImap,   setEnableImap]   = useState(false);
  const [imapHost,     setImapHost]     = useState('');
  const [imapPort,     setImapPort]     = useState('993');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/integrations/imap-smtp?agent_id=${encodeURIComponent(agentId)}`);
      const data = await res.json();
      setCfg(data as Config);
      if (data.configured) {
        setHost((data.host as string) ?? '');
        setPort(String(data.port ?? 465));
        setSecure(data.secure !== false);
        setUsername((data.username as string) ?? '');
        setFromDisplay((data.from_display as string) ?? '');
        setTlsInsecure(data.tls_insecure === true);
        setEnableImap(data.imap_configured === true);
        setImapHost((data.imap_host as string) ?? '');
        setImapPort(String(data.imap_port ?? 993));
      }
    } catch {
      setError('No pude cargar la configuración actual.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [token, agentId]);

  async function save() {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/portal/${token}/integrations/imap-smtp?agent_id=${encodeURIComponent(agentId)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          host, port: Number(port), secure, username, password,
          from_display: fromDisplay || undefined,
          send_test: true,
          tls_insecure: tlsInsecure,
          ...(enableImap && imapHost ? { imap_host: imapHost, imap_port: Number(imapPort) || 993 } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No pude guardar.'); return; }
      setSuccess('Configuración guardada. Se envió un correo de prueba al mismo buzón.');
      setPassword('');
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('¿Desconectar el servidor SMTP? Los empleados volverán a enviar desde notificaciones@centinelia.mx.')) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      const res = await fetch(`/api/portal/${token}/integrations/imap-smtp?agent_id=${encodeURIComponent(agentId)}`, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json(); setError(data.error ?? 'Falló la desconexión.'); return; }
      setPassword(''); setHost(''); setUsername(''); setFromDisplay('');
      setPort('465'); setSecure(true);
      setEditing(false);
      await load();
    } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--c-text-3)' }}>
      <Loader2 size={13} className="animate-spin" /> Cargando configuración…
    </div>;
  }

  // Configured + no editing → mostrar estado
  if (cfg?.configured && !editing) {
    const statusOk = cfg.status === 'active';
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: statusOk ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }}>
            {statusOk ? <CheckCircle size={16} style={{ color: '#22c55e' }} /> : <AlertTriangle size={16} style={{ color: '#ef4444' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--c-text-1)' }}>{cfg.username}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              SMTP {cfg.host}:{cfg.port} · {cfg.secure ? 'SSL/TLS' : 'STARTTLS'}
              {cfg.from_display ? ` · "${cfg.from_display}"` : ''}
            </p>
            {cfg.imap_configured && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                IMAP {cfg.imap_host}:{cfg.imap_port} · empleado lee inbox
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="text-[12px] px-3 py-1.5 rounded-md font-medium" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
            Cambiar credenciales
          </button>
          <button onClick={remove} disabled={saving} className="flex items-center gap-1 text-[12px] px-3 py-1.5 rounded-md font-medium" style={{ background: 'transparent', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
            <Trash2 size={11} /> Desconectar
          </button>
        </div>
        {success && <p className="text-[12px]" style={{ color: '#22c55e' }}>{success}</p>}
        {error   && <p className="text-[12px]" style={{ color: '#ef4444' }}>{error}</p>}
      </div>
    );
  }

  // Form
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(108,59,255,0.10)' }}>
          <Server size={16} style={{ color: '#6C3BFF' }} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--c-text-1)' }}>Servidor SMTP del negocio</p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Conecta el correo hospedado (Telmex, Titan, cPanel, etc.) para que los empleados envíen desde tu dominio. Solo necesita host, puerto y contraseña.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Servidor SMTP</span>
          <input value={host} onChange={e => setHost(e.target.value)} placeholder="mail.tudominio.com.mx" className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Puerto</span>
          <input value={port} onChange={e => setPort(e.target.value)} placeholder="465" className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Usuario / correo</span>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="servicioalcliente@tudominio.com.mx" className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Contraseña</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={cfg?.configured ? '••••• (deja vacío para conservar)' : 'La misma del webmail'} className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Nombre visible (opcional)</span>
          <input value={fromDisplay} onChange={e => setFromDisplay(e.target.value)} placeholder='Ej: "Nelia · Tortillería Estrella"' className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--c-text-2)' }}>
        <input type="checkbox" checked={secure} onChange={e => setSecure(e.target.checked)} />
        SSL/TLS (recomendado; casi todos los servidores modernos)
      </label>
      <label className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--c-text-2)' }}>
        <input type="checkbox" checked={tlsInsecure} onChange={e => setTlsInsecure(e.target.checked)} className="mt-0.5" />
        <span>
          Ignorar validación del certificado TLS
          <span className="block text-[10px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Necesario para Telmex/Prodigy (el hosting real es CarrierZone y el certificado no coincide con el dominio). Si el error incluye "altnames" o "certificate", actívalo.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--c-text-2)' }}>
        <input type="checkbox" checked={enableImap} onChange={e => setEnableImap(e.target.checked)} className="mt-0.5" />
        <span>
          Empleado también lee este buzón (IMAP inbound)
          <span className="block text-[10px] mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Necesario para que el empleado responda correos entrantes (facturación, cotizaciones, etc.). Sin esto solo envía. Se poléa cada 10 minutos.
          </span>
        </span>
      </label>

      {enableImap && (
        <div className="grid grid-cols-2 gap-2 pl-6">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Servidor IMAP</span>
            <input value={imapHost} onChange={e => setImapHost(e.target.value)} placeholder="mail.tudominio.com.mx" className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium" style={{ color: 'var(--c-text-3)' }}>Puerto IMAP</span>
            <input value={imapPort} onChange={e => setImapPort(e.target.value)} placeholder="993" className="px-2.5 py-2 rounded-md text-[12px]" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-1)' }} />
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !host || !username || !password || !port} className="flex items-center gap-2 text-[12px] px-4 py-2 rounded-md font-semibold" style={{ background: '#6C3BFF', color: '#fff', border: 'none', opacity: (saving || !host || !username || !password || !port) ? 0.5 : 1 }}>
          {saving ? <><Loader2 size={12} className="animate-spin" /> Probando…</> : 'Probar y guardar'}
        </button>
        {editing && (
          <button onClick={() => { setEditing(false); void load(); }} disabled={saving} className="text-[12px] px-3 py-2 rounded-md font-medium" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
            Cancelar
          </button>
        )}
      </div>

      {success && <p className="text-[12px]" style={{ color: '#22c55e' }}>{success}</p>}
      {error   && <p className="text-[12px]" style={{ color: '#ef4444' }}>{error}</p>}
      <p className="text-[10px] italic" style={{ color: 'var(--c-text-3)' }}>
        Se hace una prueba real de autenticación y se envía un correo al mismo buzón antes de guardar.
      </p>
    </div>
  );
}
