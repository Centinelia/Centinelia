'use client';

/**
 * Panel reutilizable de Setup CONTPAQi.
 *
 * Contiene:
 * - Fetch de estado (Dropbox conectado, config existente).
 * - Form de datos fiscales.
 * - POST guardar + generar writer_api_token.
 * - Panel post-guardar: download del installer + config copyable + pasos.
 *
 * Usado desde:
 *  - Modal en tab Herramientas de Nala (Configurar) → primary UX.
 *  - Página /oficina/facturas/setup-contpaqi → backward-compat / entrada directa.
 *
 * Emite `onConfigured()` cuando el usuario guarda con éxito.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Download, Copy, KeyRound, Info } from 'lucide-react';

interface Config {
  rfc_emisor:                 string;
  regimen_fiscal:             string;
  codigo_postal_emisor:       string;
  serie_default:              string;
  uso_cfdi_default:           string;
  clave_sat_default_producto: string;
  dropbox_base_path:          string;
}

interface StateResp {
  dropbox_connected: boolean;
  dropbox: { account_label: string; expires_at: string } | null;
  configured: boolean;
  updated_at: string | null;
  config: Config | null;
  writer_api_token: string | null;
  endpoint_base: string;
}

const REGIMENES: Array<{ code: string; label: string }> = [
  { code: '601', label: '601 · General de Ley Personas Morales' },
  { code: '603', label: '603 · Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 · Sueldos y Salarios' },
  { code: '606', label: '606 · Arrendamiento' },
  { code: '612', label: '612 · Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '621', label: '621 · Incorporación Fiscal' },
  { code: '622', label: '622 · Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { code: '624', label: '624 · Coordinados' },
  { code: '626', label: '626 · Régimen Simplificado de Confianza (RESICO)' },
];

const USOS_CFDI: Array<{ code: string; label: string }> = [
  { code: 'G01', label: 'G01 · Adquisición de mercancías' },
  { code: 'G03', label: 'G03 · Gastos en general' },
  { code: 'S01', label: 'S01 · Sin efectos fiscales' },
  { code: 'P01', label: 'P01 · Por definir' },
];

export default function ContpaqiSetupPanel({ token, onConfigured }: { token: string; onConfigured?: () => void }) {
  const [state,   setState]   = useState<StateResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const [saved,   setSaved]   = useState(false);

  const [rfc,      setRfc]      = useState('');
  const [regimen,  setRegimen]  = useState('601');
  const [cp,       setCp]       = useState('');
  const [serie,    setSerie]    = useState('T');
  const [usoCFDI,  setUsoCFDI]  = useState('G03');
  const [claveSat, setClaveSat] = useState('50161509');
  const [basePath, setBasePath] = useState('/Facturacion');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/setup-contpaqi`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: StateResp = await res.json();
      setState(data);
      if (data.config) {
        setRfc(data.config.rfc_emisor);
        setRegimen(data.config.regimen_fiscal || '601');
        setCp(data.config.codigo_postal_emisor);
        setSerie(data.config.serie_default);
        setUsoCFDI(data.config.uso_cfdi_default);
        setClaveSat(data.config.clave_sat_default_producto);
        setBasePath(data.config.dropbox_base_path);
      }
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setErr(null); setSaved(false);
    try {
      const res = await fetch(`/api/portal/${token}/setup-contpaqi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfc_emisor:                 rfc.trim().toUpperCase(),
          regimen_fiscal:             regimen,
          codigo_postal_emisor:       cp.trim(),
          serie_default:              serie.trim(),
          uso_cfdi_default:           usoCFDI,
          clave_sat_default_producto: claveSat.trim(),
          dropbox_base_path:          basePath.trim() || '/Facturacion',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSaved(true);
      await load();
      onConfigured?.();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
        <Loader2 size={12} className="animate-spin" /> Cargando estado...
      </div>
    );
  }

  if (!state?.dropbox_connected) {
    return (
      <div className="rounded-2xl p-5"
           style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)' }}>
        <div className="flex items-start gap-3">
          <AlertCircle size={16} className="mt-0.5" style={{ color: '#b45309' }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#b45309' }}>Primero conecta Dropbox</p>
            <p className="text-xs mt-1" style={{ color: '#92400e' }}>
              El Writer sincroniza tu catálogo de CONTPAQi con Dropbox. Necesitas conectar Dropbox en Nala antes de configurar esto.
            </p>
            <p className="text-xs mt-2">
              Ve al tab <strong>Herramientas → Almacenamiento en la nube → Dropbox → Conectar</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg px-3 py-2 flex items-center gap-2 text-xs"
           style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#15803d' }}>
        <CheckCircle2 size={12} />
        Dropbox conectado ({state.dropbox?.account_label})
      </div>

      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
          <FormField label="RFC emisor" required>
            <input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())}
                   required maxLength={13} placeholder="XAXX010101000"
                   className="w-full px-2 py-1.5 rounded font-mono"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
          <FormField label="Régimen fiscal" required>
            <select value={regimen} onChange={e => setRegimen(e.target.value)} required
                    className="w-full px-2 py-1.5 rounded"
                    style={{ background: '#fff', border: '1px solid var(--c-border)' }}>
              {REGIMENES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </FormField>
          <FormField label="Código postal (5 dígitos)" required>
            <input value={cp} onChange={e => setCp(e.target.value.replace(/\D/g, '').slice(0, 5))}
                   required inputMode="numeric" placeholder="64000"
                   className="w-full px-2 py-1.5 rounded"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
          <FormField label="Serie CFDI default">
            <input value={serie} onChange={e => setSerie(e.target.value.toUpperCase().slice(0, 5))}
                   placeholder="T"
                   className="w-full px-2 py-1.5 rounded"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
          <FormField label="Uso CFDI default">
            <select value={usoCFDI} onChange={e => setUsoCFDI(e.target.value)}
                    className="w-full px-2 py-1.5 rounded"
                    style={{ background: '#fff', border: '1px solid var(--c-border)' }}>
              {USOS_CFDI.map(u => <option key={u.code} value={u.code}>{u.label}</option>)}
            </select>
          </FormField>
          <FormField label="Clave SAT default producto">
            <input value={claveSat} onChange={e => setClaveSat(e.target.value.replace(/\D/g, '').slice(0, 10))}
                   inputMode="numeric" placeholder="50161509"
                   className="w-full px-2 py-1.5 rounded font-mono"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
          <FormField label="Carpeta base en Dropbox" wide>
            <input value={basePath} onChange={e => setBasePath(e.target.value)}
                   placeholder="/Facturacion"
                   className="w-full px-2 py-1.5 rounded font-mono"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
              Debe existir en tu Dropbox. El Writer creará dentro: Config/, Importables_CONTPAQi/pendientes/, timbrados/, errores/.
            </p>
          </FormField>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#6C3BFF', color: '#fff' }}>
            {saving ? <><Loader2 size={12} className="inline animate-spin mr-1" /> Guardando...</> : 'Guardar y continuar'}
          </button>
          {state?.configured && <span className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>Actualizado {new Date(state.updated_at ?? '').toLocaleString('es-MX')}</span>}
          {saved && <CheckCircle2 size={14} style={{ color: '#15803d' }} />}
        </div>
        {err && (
          <p className="mt-3 text-xs flex items-center gap-1.5" style={{ color: '#b91c1c' }}>
            <AlertCircle size={12} /> {err}
          </p>
        )}
      </form>

      {(state?.configured || saved) && state?.writer_api_token && (
        <div className="rounded-2xl p-5"
             style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5" style={{ color: '#6C3BFF' }}>
            <KeyRound size={14} /> Writer para Windows
          </h3>
          <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
            Instala este pequeño programa en la máquina de la oficina donde vive CONTPAQi. Se conecta a tu CONTPAQi y a tu Dropbox para mantener el catálogo sincronizado y timbrar las facturas que Nala genere.
          </p>
          <DownloadInstallerButton token={token} />

          <div className="mt-5 text-xs space-y-1" style={{ color: 'var(--c-text-2)' }}>
            <p className="font-semibold" style={{ color: 'var(--c-text)' }}>Pasos rápidos:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Descarga el ZIP y descomprímelo en la máquina de la oficina.</li>
              <li>Ejecuta <code>BillingContpaqiWriter.exe</code>.</li>
              <li>Al primer arranque toma la configuración automáticamente (<code>centinelia-config.json</code>).</li>
              <li>Te va a pedir elegir empresa/BD de CONTPAQi.</li>
              <li>Autoriza Dropbox si te lo pide de nuevo.</li>
            </ol>
            <p className="pt-2 flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }} />
              <span>
                El Writer corre en background. Verás en unos minutos <code>contpaqi_clientes.csv</code> y <code>contpaqi_productos.csv</code> en tu Dropbox dentro de <code>{state.config?.dropbox_base_path ?? '/Facturacion'}/Config/</code>. Cuando aparezcan, ya está funcionando.
              </span>
            </p>
          </div>

          {/* Config visible por si quieren copiarla manualmente (backup si el zip pre-configurado falla) */}
          <details className="mt-4">
            <summary className="text-[10px] uppercase tracking-widest font-bold cursor-pointer" style={{ color: 'var(--c-text-4)' }}>
              Configuración manual (si el auto-setup falla)
            </summary>
            <div className="mt-2">
              <CopyableConfig
                values={{
                  endpoint:          state.endpoint_base,
                  api_token:         state.writer_api_token,
                  dropbox_base_path: state.config?.dropbox_base_path ?? '/Facturacion',
                }}
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function FormField({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? 'col-span-2' : ''}`}>
      <span className="block text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--c-text-4)' }}>
        {label}{required && <span style={{ color: '#b91c1c' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function DownloadInstallerButton({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/writer-download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'centinelia-writer.zip';
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={download} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: '#22c55e', color: '#fff' }}>
        {busy ? <><Loader2 size={14} className="animate-spin" /> Preparando (~10s)…</> : <><Download size={14} /> Descargar Writer para Windows (.zip)</>}
      </button>
      <p className="text-[10px] mt-1.5" style={{ color: 'var(--c-text-3)' }}>
        Zip pre-configurado con tus credenciales — el writer arranca sin pedirte nada.
      </p>
      {err && <p className="mt-2 text-xs" style={{ color: '#b91c1c' }}>{err}</p>}
    </div>
  );
}

function CopyableConfig({ values }: { values: Record<string, string> }) {
  const text = Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n');
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* no-op */ }
  }

  return (
    <div className="relative rounded-lg p-3 font-mono text-[11px] whitespace-pre-wrap"
         style={{ background: '#0f0a1f', color: '#c9c1e6' }}>
      <button onClick={copy}
              className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] inline-flex items-center gap-1"
              style={{ background: 'rgba(255,255,255,0.1)', color: copied ? '#22c55e' : '#c9c1e6' }}>
        {copied ? <><CheckCircle2 size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
      </button>
      {text}
    </div>
  );
}
