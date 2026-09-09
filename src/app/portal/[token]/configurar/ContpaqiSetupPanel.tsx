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

interface WindowsConfig {
  sdk_path:         string;
  empresa_path:     string;
  usuario:          string;
  concepto:         string;
  sql_connection:   string;
  password_set:     boolean;
  csd_password_set: boolean;
}

interface Config {
  rfc_emisor:                 string;
  regimen_fiscal:             string;
  codigo_postal_emisor:       string;
  serie_default:              string;
  uso_cfdi_default:           string;
  clave_sat_default_producto: string;
  dropbox_base_path:          string;
  windows?:                   WindowsConfig;
}

const PASSWORD_UNCHANGED = '__unchanged__';

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

  // Windows-locales — capturados aquí para que el writer NO tenga que preguntarlos
  // en la máquina de la clienta. Passwords enviadas como PASSWORD_UNCHANGED si el
  // input queda vacío y ya había una guardada; se sobrescriben si el usuario teclea.
  const [sdkPath,      setSdkPath]      = useState('C:\\Program Files (x86)\\Compac\\COMERCIAL');
  const [empresaPath,  setEmpresaPath]  = useState('');
  const [usuario,      setUsuario]      = useState('SUPERVISOR');
  const [concepto,     setConcepto]     = useState('440');
  const [sqlConn,      setSqlConn]      = useState('');
  const [password,     setPassword]     = useState('');
  const [csdPassword,  setCsdPassword]  = useState('');
  const [passwordSet,     setPasswordSet]     = useState(false);
  const [csdPasswordSet,  setCsdPasswordSet]  = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        const w = data.config.windows;
        if (w) {
          setSdkPath(w.sdk_path);
          setEmpresaPath(w.empresa_path);
          setUsuario(w.usuario || 'SUPERVISOR');
          setConcepto(w.concepto || '440');
          setSqlConn(w.sql_connection);
          setPasswordSet(w.password_set);
          setCsdPasswordSet(w.csd_password_set);
          // Auto-abrir avanzada si ya venían valores custom (ni default ni vacíos).
          const sdkIsDefault = !w.sdk_path || w.sdk_path === 'C:\\Program Files (x86)\\Compac\\COMERCIAL';
          if (w.empresa_path || w.sql_connection || !sdkIsDefault) {
            setAdvancedOpen(true);
          }
        }
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
          windows: {
            sdk_path:       sdkPath.trim(),
            empresa_path:   empresaPath.trim(),
            usuario:        usuario.trim() || 'SUPERVISOR',
            concepto:       concepto.trim() || '440',
            sql_connection: sqlConn.trim(),
            // Si passwordSet=true y el input queda vacío → no la tocamos.
            // Si escribió algo → se guarda ese valor.
            // Si passwordSet=false y vacío → queda vacío (default seguro CONTPAQi).
            password:       password.length > 0 ? password : (passwordSet     ? PASSWORD_UNCHANGED : ''),
            csd_password:   csdPassword.length > 0 ? csdPassword : (csdPasswordSet ? PASSWORD_UNCHANGED : ''),
          },
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
          <FormField label="Clave SAT de respaldo">
            <input value={claveSat} onChange={e => setClaveSat(e.target.value.replace(/\D/g, '').slice(0, 10))}
                   inputMode="numeric" placeholder="50161509"
                   className="w-full px-2 py-1.5 rounded font-mono"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
              Se usa solo cuando un producto no trae clave SAT capturada en CONTPAQi. Lo normal es que cada producto traiga la suya. Ejemplo tortillería: 50161509 (tortillas/masa).
            </p>
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

        {/* Sección Windows-locales: capturamos aquí lo que antes preguntaba el wizard
            CLI en la PC de facturación, para que el writer se instale sin fricción. */}
        <div className="mt-6 mb-3">
          <h3 className="text-[11px] uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-4)' }}>
            Datos de tu PC de facturación
          </h3>
          <p className="text-[11px] mt-1" style={{ color: 'var(--c-text-3)' }}>
            Info que vive en la PC donde tienes CONTPAQi Comercial instalado. Con esto el Writer se auto-configura al arrancar y no te pide nada en consola.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
          <FormField label="Usuario CONTPAQi">
            <input value={usuario}
                   onChange={e => setUsuario(e.target.value)}
                   placeholder="SUPERVISOR"
                   className="w-full px-2 py-1.5 rounded font-mono"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
          <FormField label={`Password CONTPAQi ${passwordSet ? '(guardada)' : ''}`.trim()}>
            <input value={password} onChange={e => setPassword(e.target.value)}
                   type="password" autoComplete="new-password"
                   placeholder={passwordSet ? '(deja vacío para conservar)' : 'Vacío si SUPERVISOR no tiene'}
                   className="w-full px-2 py-1.5 rounded"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
          <FormField label="Concepto FACT (código CONTPAQi)">
            <input value={concepto}
                   onChange={e => setConcepto(e.target.value.replace(/\D/g, '').slice(0, 6))}
                   inputMode="numeric" placeholder="440"
                   className="w-full px-2 py-1.5 rounded font-mono"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
            <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
              440 es el default en CONTPAQi Comercial Pro. Solo cambia si tu instalación lo tiene distinto.
            </p>
          </FormField>
          <FormField label={`Password del CSD ${csdPasswordSet ? '(guardada)' : ''}`.trim()}>
            <input value={csdPassword} onChange={e => setCsdPassword(e.target.value)}
                   type="password" autoComplete="new-password"
                   placeholder={csdPasswordSet ? '(deja vacío para conservar)' : 'Vacío si el CSD no la tiene'}
                   className="w-full px-2 py-1.5 rounded"
                   style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
          </FormField>
        </div>

        {/* Colapsable: rutas que el writer auto-detecta. La clienta normal
            no las necesita ver; solo las despliega si tiene una instalación
            no-estándar (múltiples empresas, SQL custom, CONTPAQi en otro drive). */}
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ color: 'var(--c-text-2)' }}
          >
            <span className="inline-block transition-transform" style={{ transform: advancedOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
            Configuración avanzada (rutas auto-detectadas)
          </button>
          <p className="text-[10px] mt-1 ml-4" style={{ color: 'var(--c-text-3)' }}>
            El writer descubre solo la empresa, el SQL Server y el SDK CONTPAQi. Solo despliega esto si tienes un setup no-estándar.
          </p>
        </div>

        {advancedOpen && (
          <div className="grid grid-cols-2 gap-3 text-xs mb-3 rounded-lg p-3"
               style={{ background: 'rgba(108,59,255,0.03)', border: '1px dashed rgba(108,59,255,0.2)' }}>
            <FormField label="Ruta de la empresa CONTPAQi (opcional)" wide>
              <input value={empresaPath}
                     onChange={e => setEmpresaPath(e.target.value)}
                     placeholder="Vacío = auto-detecta desde C:\Compac\Empresas"
                     className="w-full px-2 py-1.5 rounded font-mono"
                     style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
                Solo llénalo si tienes varias empresas en la misma PC y quieres forzar una específica.
              </p>
            </FormField>
            <FormField label="Conexión SQL Server (opcional)" wide>
              <input value={sqlConn}
                     onChange={e => setSqlConn(e.target.value)}
                     placeholder="Vacío = auto-detecta instancia local"
                     className="w-full px-2 py-1.5 rounded font-mono"
                     style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
                Solo llénalo si tu SQL Server está en una instancia con nombre custom o requiere usuario/password.
              </p>
            </FormField>
            <FormField label="Ruta del SDK CONTPAQi (opcional)" wide>
              <input value={sdkPath}
                     onChange={e => setSdkPath(e.target.value)}
                     placeholder="C:\Program Files (x86)\Compac\COMERCIAL"
                     className="w-full px-2 py-1.5 rounded font-mono"
                     style={{ background: '#fff', border: '1px solid var(--c-border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
                Carpeta donde vive <code>MGWServicios.dll</code>. El default de arriba es correcto en 99% de instalaciones.
              </p>
            </FormField>
          </div>
        )}

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
             style={{ background: '#ffffff', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={14} style={{ color: '#6C3BFF' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              Writer para Windows
            </h3>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
            Instálalo en la máquina de la oficina donde vive CONTPAQi. Se conecta a CONTPAQi + Dropbox para mantener catálogo sincronizado y timbrar lo que Nala genere.
          </p>
          <DownloadInstallerButton token={token} />

          {/* Instrucciones — steps con círculos numerados */}
          <div className="mt-6">
            <h4 className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--c-text-4)' }}>
              Cómo instalarlo (5 min)
            </h4>
            <ol className="space-y-3">
              <SetupStep n={1} title="Descarga y descomprime">
                Guarda el ZIP en la PC donde vive CONTPAQi y descomprímelo en una carpeta fácil de encontrar (ej. <code>C:\Centinelia\Writer</code>).
              </SetupStep>
              <SetupStep n={2} title="Doble-click en BillingContpaqiWriter.exe">
                Se abre una ventana negra con unas preguntas: ruta de tu empresa CONTPAQi, usuario/password SUPERVISOR, concepto FACT, password del CSD y la conexión SQL. Los tokens de Dropbox ya vienen preconfigurados. Contesta cada pregunta y dale Enter.
              </SetupStep>
              <SetupStep n={3} title="Deja la ventana abierta">
                Al terminar las preguntas el writer arranca y empieza a sincronizar. Mientras la ventana esté abierta, el writer está trabajando. Los siguientes arranques leen <code>appsettings.local.json</code> y no vuelven a preguntar.
              </SetupStep>
              <SetupStep n={4} title="(Opcional) Registra como servicio Windows">
                Para que arranque solo con la PC sin depender de la ventana: abre PowerShell como administrador y corre <code>sc create &quot;Centinelia.BillingWriter&quot; binPath= &quot;C:\Centinelia\Writer\BillingContpaqiWriter.exe&quot; start= auto</code>, luego <code>sc start &quot;Centinelia.BillingWriter&quot;</code>.
              </SetupStep>
            </ol>
          </div>

          {/* Confirmación de éxito */}
          <div className="mt-5 rounded-lg p-3 flex items-start gap-2 text-xs"
               style={{ background: '#F8F5FF', border: '1px solid #EAE0FF', color: 'var(--c-text-2)' }}>
            <Info size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }} />
            <span>
              El Writer corre en background y sincroniza cada 60 min. Sabrás que está funcionando cuando veas <code>contpaqi_clientes.csv</code> y <code>contpaqi_productos.csv</code> en tu Dropbox dentro de <code>{state.config?.dropbox_base_path ?? '/Facturacion'}/Config/</code>.
            </span>
          </div>

          {/* Config manual como opción de rescate */}
          <details className="mt-4 rounded-lg" style={{ border: '1px solid var(--c-border)' }}>
            <summary className="text-xs cursor-pointer px-3 py-2 select-none"
                     style={{ color: 'var(--c-text-2)' }}>
              ¿No se auto-configuró? Copia la config manualmente
            </summary>
            <div className="p-3 pt-0">
              <p className="text-[11px] mb-2" style={{ color: 'var(--c-text-3)' }}>
                Si el Writer no encuentra el archivo, ábrelo y pega estos valores cuando te los pida:
              </p>
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

function SetupStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold"
        style={{
          width: 24, height: 24,
          background: '#6C3BFF',
          color:      '#fff',
        }}
      >
        {n}
      </span>
      <div className="flex-1 pt-0.5">
        <p className="text-xs font-semibold" style={{ color: 'var(--c-text)' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>{children}</p>
      </div>
    </li>
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
        Zip pre-configurado con tu token y ruta de Dropbox. Doble-click al EXE y contesta las preguntas que aparecen en la ventana. Instrucciones dentro del LEEME.txt.
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
