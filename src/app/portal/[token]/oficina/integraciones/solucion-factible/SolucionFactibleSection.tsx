'use client';
import { useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, FileText, Settings, Trash2, Upload } from 'lucide-react';

interface Org {
  invoicing_provider?: string | null;
  invoicing_rfc_emisor?: string | null;
  invoicing_razon_social?: string | null;
  invoicing_regimen_fiscal?: string | null;
  invoicing_lugar_expedicion?: string | null;
  invoicing_test_mode?: boolean;
  invoicing_allow_agent_cancellation?: boolean;
  invoicing_csd_version?: number;
  invoicing_csd_expires_at?: string | null;
  invoicing_csd_no_certificado?: string | null;
  invoicing_limits?: {
    monto_max_mxn: number;
    blocked_uso_cfdi: string[];
    max_stamps_per_day: number;
    max_stamps_per_hour_per_rfc: number;
  };
}

const SFLogo = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
    <rect width="48" height="48" rx="8" fill="#1A56DB" />
    <rect x="10" y="8" width="28" height="32" rx="3" fill="#fff" fillOpacity=".15" />
    <rect x="13" y="11" width="22" height="26" rx="2" fill="#fff" />
    <path d="M17 18h14M17 23h14M17 28h8" stroke="#1A56DB" strokeWidth="2" strokeLinecap="round" />
    <path d="M30 30l4 4" stroke="#1A56DB" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

function StatusBadge({ connected, csdReady }: { connected: boolean; csdReady: boolean }) {
  if (!connected) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
        Desconectado
      </span>
    );
  }
  if (!csdReady) {
    return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: 'rgba(245,158,11,0.1)', color: '#B45309', border: '1px solid rgba(245,158,11,0.25)' }}>
        <AlertTriangle size={10} /> Sin CSD
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
      <CheckCircle size={10} /> Activo
    </span>
  );
}

export default function SolucionFactibleSection({ token, org }: { token: string; org: Org }) {
  const [msg, setMsg]   = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const connected = !!org.invoicing_provider;
  const csdReady  = !!org.invoicing_csd_no_certificado;

  async function connect(fd: FormData) {
    setBusy(true); setMsg(null);
    const body = {
      usuario:          fd.get('usuario'),
      password:         fd.get('password'),
      rfc_emisor:       fd.get('rfc_emisor'),
      razon_social:     fd.get('razon_social'),
      regimen_fiscal:   fd.get('regimen_fiscal'),
      lugar_expedicion: fd.get('lugar_expedicion'),
      test_mode:        fd.get('test_mode') === 'true',
    };
    const r = await fetch(`/api/portal/${token}/invoicing/connect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    setBusy(false);
    setMsg({ ok: r.ok, text: r.ok ? 'Conexion exitosa. Ahora sube tu CSD.' : (j.error ?? 'Error al conectar.') });
    if (r.ok) setTimeout(() => location.reload(), 800);
  }

  async function uploadCsd(fd: FormData) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/portal/${token}/invoicing/csd/upload`, { method: 'POST', body: fd });
    const j = await r.json();
    setBusy(false);
    setMsg({
      ok:   r.ok,
      text: r.ok
        ? `CSD v${j.version} registrado. Vence ${new Date(j.expires_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}.`
        : (j.error ?? 'Error al subir CSD.'),
    });
    if (r.ok) setTimeout(() => location.reload(), 800);
  }

  async function saveConfig(patch: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/portal/${token}/invoicing/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json();
      setMsg({ ok: false, text: j.error ?? 'Error al guardar.' });
    } else {
      setMsg({ ok: true, text: 'Cambios guardados.' });
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar Solucion Factible. Los empleados volveran a escalar facturas a humano. Continuar?')) return;
    setBusy(true);
    await fetch(`/api/portal/${token}/invoicing/disconnect`, { method: 'DELETE' });
    location.reload();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(26,86,219,0.1)', border: '1px solid rgba(26,86,219,0.25)' }}>
          <SFLogo />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold" style={{ color: 'var(--c-text)' }}>
              Solucion Factible
            </h1>
            <StatusBadge connected={connected} csdReady={csdReady} />
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            Timbrado CFDI 4.0 · PAC autorizado SAT
          </p>
        </div>
      </div>

      {/* Feedback message */}
      {msg && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            background: msg.ok ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
            border:     msg.ok ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.25)',
            color:      msg.ok ? '#15803d' : '#b91c1c',
          }}>
          {msg.ok
            ? <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Connect form */}
      {!connected && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Conectar cuenta</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Ingresa las credenciales de tu cuenta en Solucion Factible para que tus empleados timbren CFDI automaticamente.
            </p>
          </div>
          <form
            className="px-4 py-4 flex flex-col gap-4"
            onSubmit={e => { e.preventDefault(); void connect(new FormData(e.currentTarget)); }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Usuario SF</span>
                <input
                  name="usuario"
                  required
                  autoComplete="username"
                  placeholder="usuario@ejemplo.com"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Contrasena SF</span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>RFC del emisor</span>
                <input
                  name="rfc_emisor"
                  required
                  placeholder="AAA010101AAA"
                  className="rounded-lg px-3 py-2 text-sm uppercase"
                  style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Razon social</span>
                <input
                  name="razon_social"
                  required
                  placeholder="Mi Empresa SA de CV"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Regimen fiscal</span>
                <input
                  name="regimen_fiscal"
                  required
                  placeholder="601"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Lugar de expedicion (CP)</span>
                <input
                  name="lugar_expedicion"
                  required
                  pattern="\d{5}"
                  placeholder="64000"
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
              <input type="checkbox" name="test_mode" value="true" defaultChecked className="rounded" />
              Modo pruebas (sandbox) - desactivar al pasar a produccion
            </label>
            <div>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: '#1A56DB', color: '#fff' }}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Conectar Solucion Factible
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSD section */}
      {connected && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <FileText size={14} style={{ color: 'var(--c-text-3)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Certificado de Sello Digital (CSD)
            </h2>
          </div>

          {csdReady && (
            <div className="px-4 py-3 flex items-start gap-2"
              style={{ borderBottom: '1px solid var(--c-border)', background: 'rgba(34,197,94,0.04)' }}>
              <CheckCircle size={13} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
              <div className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                <span className="font-semibold" style={{ color: 'var(--c-text)' }}>CSD registrado</span>
                {' '} · Version {org.invoicing_csd_version}
                {' '} · No. {org.invoicing_csd_no_certificado}
                {org.invoicing_csd_expires_at && (
                  <> · Vence {new Date(org.invoicing_csd_expires_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</>
                )}
              </div>
            </div>
          )}

          {!csdReady && (
            <div className="px-4 py-3 flex items-start gap-2"
              style={{ borderBottom: '1px solid var(--c-border)', background: 'rgba(245,158,11,0.04)' }}>
              <AlertTriangle size={13} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: '#92400E' }}>
                Sube tu CSD para que tus empleados puedan timbrar facturas.
              </p>
            </div>
          )}

          <form
            className="px-4 py-4 flex flex-col gap-3"
            onSubmit={e => { e.preventDefault(); void uploadCsd(new FormData(e.currentTarget)); }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Archivo .cer</span>
                <input
                  name="cer"
                  type="file"
                  accept=".cer"
                  required
                  className="text-xs"
                  style={{ color: 'var(--c-text-3)' }}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Archivo .key</span>
                <input
                  name="key"
                  type="file"
                  accept=".key"
                  required
                  className="text-xs"
                  style={{ color: 'var(--c-text-3)' }}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Contrasena de la llave privada</span>
              <input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                className="rounded-lg px-3 py-2 text-sm"
                style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: '#1A56DB', color: '#fff' }}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {csdReady ? 'Reemplazar CSD' : 'Subir CSD'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Config section */}
      {connected && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <Settings size={14} style={{ color: 'var(--c-text-3)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Configuracion</h2>
          </div>

          <div className="px-4 py-4 flex flex-col gap-4">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={org.invoicing_test_mode !== false}
                onChange={e => void saveConfig({ test_mode: e.currentTarget.checked })}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>Modo pruebas (sandbox)</span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  Desactiva esta opcion para timbrar facturas en produccion ante el SAT.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked={!!org.invoicing_allow_agent_cancellation}
                onChange={e => void saveConfig({ allow_agent_cancellation: e.currentTarget.checked })}
                className="mt-0.5 rounded"
              />
              <div>
                <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>Permitir cancelacion por empleado</span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  Cuando esta activo, tu empleado puede solicitar la cancelacion de un CFDI. Por defecto esta desactivado.
                </p>
              </div>
            </label>

            <div className="pt-1" style={{ borderTop: '1px solid var(--c-border)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--c-text-2)' }}>Limites automaticos</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Monto maximo por CFDI (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={org.invoicing_limits?.monto_max_mxn ?? 50000}
                    onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, monto_max_mxn: Number(e.currentTarget.value) } })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Maximo CFDI por hora al mismo RFC</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={org.invoicing_limits?.max_stamps_per_hour_per_rfc ?? 3}
                    onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, max_stamps_per_hour_per_rfc: Number(e.currentTarget.value) } })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Maximo CFDI por dia</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={org.invoicing_limits?.max_stamps_per_day ?? 50}
                    onBlur={e => void saveConfig({ limits: { ...org.invoicing_limits, max_stamps_per_day: Number(e.currentTarget.value) } })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Usos CFDI bloqueados (separados por coma)</span>
                  <input
                    type="text"
                    defaultValue={(org.invoicing_limits?.blocked_uso_cfdi ?? []).join(',')}
                    placeholder="G01,G03"
                    onBlur={e => void saveConfig({
                      limits: {
                        ...org.invoicing_limits,
                        blocked_uso_cfdi: e.currentTarget.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean),
                      },
                    })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Capabilities callout */}
      <div className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--c-border)', background: 'var(--c-bg)' }}>
        <p className="px-3 pt-2.5 pb-2 text-[10px] font-semibold tracking-widest uppercase"
          style={{ color: 'var(--c-text-4)', borderBottom: '1px solid var(--c-border)' }}>
          Tu empleado puede
        </p>
        <div className="flex flex-col gap-1.5 px-3 py-3">
          {[
            'Generar y timbrar facturas CFDI 4.0 ante el SAT',
            'Enviar el PDF y XML al correo del cliente',
            'Consultar el estado de un CFDI ya emitido',
            'Cancelar facturas cuando este configurado',
          ].map(cap => (
            <div key={cap} className="flex items-center gap-2">
              <FileText size={10} style={{ color: '#1A56DB', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{cap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Disconnect */}
      {connected && (
        <div className="flex justify-end pt-1">
          <button
            onClick={disconnect}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{ color: 'var(--c-text-3)' }}
          >
            <Trash2 size={12} />
            Desconectar Solucion Factible
          </button>
        </div>
      )}
    </div>
  );
}
