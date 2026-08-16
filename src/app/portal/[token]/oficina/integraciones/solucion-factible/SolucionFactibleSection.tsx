'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Loader2, FileText, Settings, Trash2, Upload, ArrowLeft } from 'lucide-react';

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

// Catálogo de PACs disponibles. Agregar aquí cuando se integre uno nuevo.
// El backend usa `organizations.invoicing_provider = <id>` para decidir en
// `resolveInvoicingPath()` a qué provider singleton llamar.
//
// Para agregar Facturama, Finkok, PACSA etc:
//  1. Implementar src/lib/invoicing/{id}/index.ts (InvoicingProvider interface)
//  2. Agregar case en resolveInvoicingPath() de emitir-factura.ts
//  3. Agregar mapping de sus error codes en error-mapping.ts
//  4. Marcar enabled: true aquí
interface PacDef {
  id: string;
  label: string;
  tagline: string;
  logoColor: string;
  enabled: boolean;
  note?: string;
}
const PAC_CATALOG: PacDef[] = [
  {
    id: 'solucion_factible',
    label: 'Solucion Factible',
    tagline: 'PAC autorizado SAT · Timbrado CFDI 4.0 + Cancelacion',
    logoColor: '#1A56DB',
    enabled: true,
  },
  {
    id: 'contpaqi_timbra',
    label: 'CONTPAQi Timbra',
    tagline: 'PAC autorizado SAT · Timbrado CFDI 4.0 (REST/JSON)',
    logoColor: '#E85D2F',
    enabled: false,
    note: 'En integración',
  },
  {
    id: 'facturama',
    label: 'Facturama',
    tagline: 'PAC autorizado SAT · Timbrado CFDI 4.0',
    logoColor: '#0EA5E9',
    enabled: false,
    note: 'Próximamente',
  },
  {
    id: 'finkok',
    label: 'Finkok',
    tagline: 'PAC autorizado SAT · Timbrado CFDI 4.0',
    logoColor: '#10B981',
    enabled: false,
    note: 'Próximamente',
  },
];

function PacLogo({ color }: { color: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}18`, border: `1px solid ${color}44` }}>
      <FileText size={16} style={{ color }} strokeWidth={2.2} />
    </div>
  );
}

export default function SolucionFactibleSection({ token }: { token: string }) {
  const [org, setOrg]     = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]     = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy]   = useState(false);
  const [selectedPac, setSelectedPac] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/portal/${token}/invoicing/config`);
      if (!r.ok) { setOrg({}); return; }
      const d = await r.json();
      setOrg(d);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const connected = !!org?.invoicing_provider;
  const csdReady  = !!org?.invoicing_csd_no_certificado;

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
    if (r.ok) await load();
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
    if (r.ok) await load();
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
      await load();
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar Solucion Factible. Los empleados volveran a escalar facturas a humano. Continuar?')) return;
    setBusy(true);
    await fetch(`/api/portal/${token}/invoicing/disconnect`, { method: 'DELETE' });
    await load();
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm py-4" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={14} className="animate-spin" /> Cargando...
      </div>
    );
  }

  const o = org ?? {};

  return (
    <div className="flex flex-col gap-4">

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

      {/* PAC catálogo (disconnected + no PAC seleccionado aún) */}
      {!connected && !selectedPac && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Elige tu PAC</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
              Un PAC (Proveedor Autorizado de Certificacion) es quien timbra los CFDI ante el SAT. Elige con cual tienes cuenta.
            </p>
          </div>
          <div className="flex flex-col">
            {PAC_CATALOG.map((p, i) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.enabled}
                onClick={() => p.enabled && setSelectedPac(p.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                style={{
                  borderBottom: i === PAC_CATALOG.length - 1 ? 'none' : '1px solid var(--c-border)',
                  background:   'transparent',
                  cursor:       p.enabled ? 'pointer' : 'default',
                  opacity:      p.enabled ? 1 : 0.55,
                }}
                onMouseEnter={e => { if (p.enabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-surface)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <PacLogo color={p.logoColor} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{p.label}</span>
                  <span className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{p.tagline}</span>
                </div>
                {p.enabled ? (
                  <span className="text-xs font-semibold" style={{ color: p.logoColor }}>Conectar →</span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: 'var(--c-surface)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
                    {p.note ?? 'Pronto'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Connect form (después de elegir PAC) */}
      {!connected && selectedPac === 'solucion_factible' && (
        <div className="rounded-xl overflow-hidden"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <button
              type="button"
              onClick={() => setSelectedPac(null)}
              className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-70"
              style={{ color: 'var(--c-text-3)' }}
            >
              <ArrowLeft size={12} /> Cambiar PAC
            </button>
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>·</span>
            <PacLogo color="#1A56DB" />
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Conectar Solucion Factible</h2>
              <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Ingresa las credenciales de tu cuenta PAC.</p>
            </div>
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

      {/* Connected identity summary */}
      {connected && (
        <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
          style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
          <span><span className="font-semibold" style={{ color: 'var(--c-text)' }}>RFC:</span> {o.invoicing_rfc_emisor}</span>
          <span><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Razon social:</span> {o.invoicing_razon_social}</span>
          <span><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Regimen:</span> {o.invoicing_regimen_fiscal}</span>
          <span><span className="font-semibold" style={{ color: 'var(--c-text)' }}>Lugar exp.:</span> {o.invoicing_lugar_expedicion}</span>
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
                {' '} · Version {o.invoicing_csd_version}
                {' '} · No. {o.invoicing_csd_no_certificado}
                {o.invoicing_csd_expires_at && (
                  <> · Vence {new Date(o.invoicing_csd_expires_at).toLocaleDateString('es-MX', { dateStyle: 'medium' })}</>
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
                defaultChecked={o.invoicing_test_mode !== false}
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
                defaultChecked={!!o.invoicing_allow_agent_cancellation}
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

            <div className="pt-3" style={{ borderTop: '1px solid var(--c-border)' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: 'var(--c-text-2)' }}>Limites automaticos</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Monto maximo por CFDI (MXN)</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={o.invoicing_limits?.monto_max_mxn ?? 50000}
                    onBlur={e => void saveConfig({ limits: { ...o.invoicing_limits, monto_max_mxn: Number(e.currentTarget.value) } })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Maximo CFDI por hora al mismo RFC</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={o.invoicing_limits?.max_stamps_per_hour_per_rfc ?? 3}
                    onBlur={e => void saveConfig({ limits: { ...o.invoicing_limits, max_stamps_per_hour_per_rfc: Number(e.currentTarget.value) } })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Maximo CFDI por dia</span>
                  <input
                    type="number"
                    min={1}
                    defaultValue={o.invoicing_limits?.max_stamps_per_day ?? 50}
                    onBlur={e => void saveConfig({ limits: { ...o.invoicing_limits, max_stamps_per_day: Number(e.currentTarget.value) } })}
                    className="rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-text)', outline: 'none' }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Usos CFDI bloqueados (separados por coma)</span>
                  <input
                    type="text"
                    defaultValue={(o.invoicing_limits?.blocked_uso_cfdi ?? []).join(',')}
                    placeholder="G01,G03"
                    onBlur={e => void saveConfig({
                      limits: {
                        ...o.invoicing_limits,
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
