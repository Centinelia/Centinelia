'use client';

import { useCallback, useEffect, useState } from 'react';
import { Boxes, CheckCircle, AlertTriangle, Loader2, Save, PlugZap } from 'lucide-react';
import OficinaPageHero from '../../oficina/OficinaPageHero';

type ScopeType = 'me' | 'user' | 'site';

interface FormState {
  scopeType:            ScopeType;
  siteId:               string;
  driveId:              string;
  userId:               string;
  itemId:               string;
  historicoName:        string;
  historicoTable:       string;
  stockName:            string;
  stockHeaderRow:       string;
  stockIdealCol:        string;
  stockActualCol:       string;
  stockModeloCol:       string;
  stockPropuestaCol:    string;
  backlogName:          string;
  backlogStartRow:      string;
  columnsHistoricoJson: string;
  estatusValidos:       string;
  bodegasCanonicas:     string;
  bodegasAliasesJson:   string;
  encargadosReposicion: string;
}

const DEFAULTS: FormState = {
  scopeType:         'site',
  siteId:            '',
  driveId:           '',
  userId:            '',
  itemId:            '',
  historicoName:     'INVENTARIO',
  historicoTable:    'Tabla6',
  stockName:         'STOCK',
  stockHeaderRow:    '1',
  stockIdealCol:     'T',
  stockActualCol:    'J',
  stockModeloCol:    'H',
  stockPropuestaCol: 'W',
  backlogName:       'BACKLOG',
  backlogStartRow:   '5',
  columnsHistoricoJson: JSON.stringify({
    oc:              'OC',
    modelo:          'MODELO',
    serie:           'SERIE',
    estatus:         'ESTATUS',
    bodega:          'BODEGA',
    vendedor:        'VEND',
    cliente:         'CLIENTE',
    folio_venta:     'FOLIO',
    fecha_venta:     'FECHA DE VENTA',
    factura_venta:   'FACTURA',
    costo_venta_mx:  'COSTO VTA (MX)',
  }, null, 2),
  estatusValidos:       'ALMACEN, SEPARADO, ENTREGADO, PENDIENTE, PEDIDO, DEVUELTO, DESHABILITADO',
  bodegasCanonicas:     'FLETEROS, CENIZO, PORTEO, TRANE',
  bodegasAliasesJson:   JSON.stringify({ FLETERO: 'FLETEROS' }, null, 2),
  encargadosReposicion: '',
};

function splitCsv(s: string): string[] {
  return s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
}

function splitLines(s: string): string[] {
  return s.split(/\n/).map(x => x.trim()).filter(Boolean);
}

function buildPayload(f: FormState): { ok: boolean; error?: string; payload?: unknown } {
  let columns_historico: Record<string, string>;
  try {
    columns_historico = JSON.parse(f.columnsHistoricoJson);
    if (!columns_historico || typeof columns_historico !== 'object') throw new Error('formato');
  } catch {
    return { ok: false, error: 'El mapa de columnas del histórico no es un JSON válido.' };
  }

  let bodegas_aliases: Record<string, string> | undefined;
  if (f.bodegasAliasesJson.trim()) {
    try {
      const parsed = JSON.parse(f.bodegasAliasesJson);
      if (parsed && typeof parsed === 'object') bodegas_aliases = parsed as Record<string, string>;
    } catch {
      return { ok: false, error: 'Los alias de bodegas no son un JSON válido.' };
    }
  }

  const scope =
    f.scopeType === 'me'   ? { type: 'me' } :
    f.scopeType === 'user' ? { type: 'user', userId: f.userId.trim() } :
                             { type: 'site', siteId: f.siteId.trim(), driveId: f.driveId.trim() || undefined };

  if (f.scopeType === 'user' && !f.userId.trim())   return { ok: false, error: 'Cuando el ámbito es "usuario", el ID del usuario es obligatorio.' };
  if (f.scopeType === 'site' && !f.siteId.trim())   return { ok: false, error: 'Cuando el ámbito es "sitio de SharePoint", el ID del sitio es obligatorio.' };
  if (!f.itemId.trim())                              return { ok: false, error: 'El ID del archivo Excel es obligatorio.' };

  const payload = {
    location: { scope, itemId: f.itemId.trim() },
    sheets: {
      historico: { name: f.historicoName.trim(), table: f.historicoTable.trim() },
      stock: {
        name:              f.stockName.trim(),
        header_row:        Number(f.stockHeaderRow),
        ideal_column:      f.stockIdealCol.trim(),
        stock_column:      f.stockActualCol.trim(),
        modelo_column:     f.stockModeloCol.trim(),
        propuesta_column:  f.stockPropuestaCol.trim(),
      },
      ...(f.backlogName.trim()
        ? { backlog: { name: f.backlogName.trim(), start_row: Number(f.backlogStartRow) } }
        : {}),
    },
    columns_historico,
    estatus_validos:   splitCsv(f.estatusValidos),
    bodegas_canonicas: splitCsv(f.bodegasCanonicas),
    ...(bodegas_aliases     ? { bodegas_aliases } : {}),
    ...(splitLines(f.encargadosReposicion).length > 0
      ? { encargados_reposicion: splitLines(f.encargadosReposicion) }
      : {}),
  };

  return { ok: true, payload };
}

// Convierte una config previa (desde GET) a estado del formulario.
function configToForm(cfg: Record<string, any> | null): FormState {
  if (!cfg) return DEFAULTS;
  const scope = cfg?.location?.scope ?? { type: 'site' };
  return {
    scopeType:         (scope.type as ScopeType) ?? 'site',
    siteId:            scope.siteId  ?? '',
    driveId:           scope.driveId ?? '',
    userId:            scope.userId  ?? '',
    itemId:            cfg?.location?.itemId ?? '',
    historicoName:     cfg?.sheets?.historico?.name  ?? DEFAULTS.historicoName,
    historicoTable:    cfg?.sheets?.historico?.table ?? DEFAULTS.historicoTable,
    stockName:         cfg?.sheets?.stock?.name              ?? DEFAULTS.stockName,
    stockHeaderRow:    String(cfg?.sheets?.stock?.header_row ?? DEFAULTS.stockHeaderRow),
    stockIdealCol:     cfg?.sheets?.stock?.ideal_column     ?? DEFAULTS.stockIdealCol,
    stockActualCol:    cfg?.sheets?.stock?.stock_column     ?? DEFAULTS.stockActualCol,
    stockModeloCol:    cfg?.sheets?.stock?.modelo_column    ?? DEFAULTS.stockModeloCol,
    stockPropuestaCol: cfg?.sheets?.stock?.propuesta_column ?? DEFAULTS.stockPropuestaCol,
    backlogName:       cfg?.sheets?.backlog?.name       ?? '',
    backlogStartRow:   String(cfg?.sheets?.backlog?.start_row ?? DEFAULTS.backlogStartRow),
    columnsHistoricoJson: cfg?.columns_historico
      ? JSON.stringify(cfg.columns_historico, null, 2)
      : DEFAULTS.columnsHistoricoJson,
    estatusValidos:     Array.isArray(cfg?.estatus_validos)     ? cfg.estatus_validos.join(', ')     : DEFAULTS.estatusValidos,
    bodegasCanonicas:   Array.isArray(cfg?.bodegas_canonicas)   ? cfg.bodegas_canonicas.join(', ')   : DEFAULTS.bodegasCanonicas,
    bodegasAliasesJson: cfg?.bodegas_aliases ? JSON.stringify(cfg.bodegas_aliases, null, 2) : '',
    encargadosReposicion: Array.isArray(cfg?.encargados_reposicion) ? cfg.encargados_reposicion.join('\n') : '',
  };
}

export default function InventarioConfigForm({ token }: { token: string }) {
  const [form,   setForm]   = useState<FormState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/inventario/config`);
      if (res.ok) {
        const d = await res.json();
        setForm(configToForm(d.config));
        setConfigured(!!d.configured);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(prev => ({ ...prev, [k]: v }));
  };

  async function onSave() {
    setMsg(null);
    const built = buildPayload(form);
    if (!built.ok) { setMsg({ ok: false, text: built.error ?? 'Datos inválidos.' }); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/portal/${token}/inventario/config`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(built.payload),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfigured(true);
        setMsg({ ok: true, text: 'Configuración guardada.' });
      } else {
        setMsg({ ok: false, text: d.error ?? 'No se pudo guardar la configuración.' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setMsg(null);
    setTesting(true);
    try {
      const res = await fetch(`/api/portal/${token}/inventario/test`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        setMsg({
          ok:   true,
          text: `Conexión correcta. Se leyeron ${d.total_headers} columnas de la tabla ${d.tabla} en la hoja ${d.hoja}.`,
        });
      } else {
        setMsg({ ok: false, text: d.message ?? d.error ?? 'La prueba de conexión falló.' });
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <OficinaPageHero
        icon={Boxes}
        eyebrow="Integraciones"
        title="Archivo de inventario"
        description="Nami opera este archivo Excel en SharePoint para consultar, actualizar y reportar el inventario. Configura la ubicación del archivo y el mapeo de columnas para que coincida con tu formato."
      />

      {msg && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
          style={{
            background: msg.ok ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.08)',
            border:     msg.ok ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.25)',
            color:      msg.ok ? '#22c55e' : '#ef4444',
          }}>
          {msg.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-10 justify-center" style={{ color: '#6B6480' }}>
          <Loader2 size={14} className="animate-spin" /> Cargando configuración...
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}>

          {/* Ubicación del archivo */}
          <Section title="Ubicación del archivo" hint={configured ? 'Ya configurado. Puedes ajustar y volver a guardar.' : 'Toma estos IDs del portal de administración de Microsoft Graph o pídeselos al área de sistemas.'}>
            <Field label="Ámbito">
              <select
                value={form.scopeType}
                onChange={e => update('scopeType', e.target.value as ScopeType)}
                className="w-full sm:w-72 rounded-lg px-3 py-2 text-sm"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              >
                <option value="site">Sitio de SharePoint</option>
                <option value="user">OneDrive de un usuario</option>
                <option value="me">OneDrive propio (cuenta conectada)</option>
              </select>
            </Field>

            {form.scopeType === 'site' && (
              <>
                <Field label="ID del sitio (siteId)" hint="Ejemplo: contoso.sharepoint.com,{siteId GUID},{web GUID}">
                  <Input value={form.siteId} onChange={v => update('siteId', v)} placeholder="contoso.sharepoint.com,00000000-...,00000000-..." />
                </Field>
                <Field label="ID de la biblioteca (driveId)" hint="Opcional. Si se omite, se usa la biblioteca por defecto del sitio.">
                  <Input value={form.driveId} onChange={v => update('driveId', v)} placeholder="b!xxxxxxxxxxxxxxxxxxxxxxxx" />
                </Field>
              </>
            )}

            {form.scopeType === 'user' && (
              <Field label="ID del usuario (userId)">
                <Input value={form.userId} onChange={v => update('userId', v)} placeholder="usuario@empresa.com o 00000000-0000-0000-0000-000000000000" />
              </Field>
            )}

            <Field label="ID del archivo Excel (itemId)" hint="Obligatorio. Es el driveItem.id del archivo .xlsx dentro del sitio o unidad seleccionada.">
              <Input value={form.itemId} onChange={v => update('itemId', v)} placeholder="01ABCDEFGHIJKLMN..." required />
            </Field>
          </Section>

          <Divider />

          {/* Hojas */}
          <Section title="Hojas del archivo" hint="Nombres de las hojas dentro del libro. Los valores por defecto coinciden con la plantilla estándar.">
            <Row>
              <Field label="Hoja del histórico">
                <Input value={form.historicoName} onChange={v => update('historicoName', v)} />
              </Field>
              <Field label="Nombre de la tabla" hint="Nombre exacto de la Tabla oficial de Excel que contiene el histórico.">
                <Input value={form.historicoTable} onChange={v => update('historicoTable', v)} />
              </Field>
            </Row>

            <Row>
              <Field label="Hoja de stock">
                <Input value={form.stockName} onChange={v => update('stockName', v)} />
              </Field>
              <Field label="Fila de encabezados de stock">
                <Input value={form.stockHeaderRow} onChange={v => update('stockHeaderRow', v)} inputMode="numeric" />
              </Field>
            </Row>

            <Row>
              <Field label="Columna MODELO"><Input value={form.stockModeloCol}    onChange={v => update('stockModeloCol', v.toUpperCase())} /></Field>
              <Field label="Columna STOCK actual"><Input value={form.stockActualCol}    onChange={v => update('stockActualCol', v.toUpperCase())} /></Field>
              <Field label="Columna IDEAL"><Input value={form.stockIdealCol}     onChange={v => update('stockIdealCol', v.toUpperCase())} /></Field>
              <Field label="Columna PROPUESTA"><Input value={form.stockPropuestaCol} onChange={v => update('stockPropuestaCol', v.toUpperCase())} /></Field>
            </Row>

            <Row>
              <Field label="Hoja de backlog (opcional)">
                <Input value={form.backlogName} onChange={v => update('backlogName', v)} placeholder="BACKLOG" />
              </Field>
              <Field label="Fila donde inicia el backlog">
                <Input value={form.backlogStartRow} onChange={v => update('backlogStartRow', v)} inputMode="numeric" />
              </Field>
            </Row>
          </Section>

          <Divider />

          {/* Columnas del histórico */}
          <Section title="Mapeo de columnas del histórico" hint="Nombre lógico → nombre exacto del encabezado en la tabla. Cada llave es cómo lo llama Nami, cada valor es cómo se llama en tu archivo.">
            <Field label="Mapeo (JSON)">
              <textarea
                value={form.columnsHistoricoJson}
                onChange={e => update('columnsHistoricoJson', e.target.value)}
                className="w-full min-h-[220px] font-mono rounded-lg px-3 py-2 text-xs"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                spellCheck={false}
              />
            </Field>
          </Section>

          <Divider />

          {/* Listas */}
          <Section title="Catálogos" hint="Valores permitidos y aliases que Nami reconoce al normalizar entradas.">
            <Field label="Estatus válidos" hint="Separados por comas. Nami rechaza cualquier estatus que no esté en esta lista.">
              <Input value={form.estatusValidos} onChange={v => update('estatusValidos', v)} />
            </Field>

            <Field label="Bodegas canónicas" hint="Separadas por comas. Cualquier bodega mencionada se normaliza a una de estas.">
              <Input value={form.bodegasCanonicas} onChange={v => update('bodegasCanonicas', v)} />
            </Field>

            <Field label="Alias de bodegas (JSON opcional)" hint='Cada llave es una variante escrita, cada valor la bodega canónica. Ejemplo: { "FLETERO": "FLETEROS" }'>
              <textarea
                value={form.bodegasAliasesJson}
                onChange={e => update('bodegasAliasesJson', e.target.value)}
                className="w-full min-h-[100px] font-mono rounded-lg px-3 py-2 text-xs"
                style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                spellCheck={false}
                placeholder='{ "FLETERO": "FLETEROS" }'
              />
            </Field>
          </Section>

          <Divider />

          {/* Encargados */}
          <Section title="Encargados de reposición" hint="Correos a los que Nami envía las propuestas de reposición cuando el stock queda por debajo del ideal. Uno por línea.">
            <textarea
              value={form.encargadosReposicion}
              onChange={e => update('encargadosReposicion', e.target.value)}
              className="w-full min-h-[100px] rounded-lg px-3 py-2 text-sm"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
              placeholder={'compras@empresa.com\nsupervisor@empresa.com'}
              spellCheck={false}
            />
          </Section>

          {/* Acciones */}
          <div className="px-5 py-4 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
            <button
              onClick={onSave}
              disabled={busy || testing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity"
              style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar configuración
            </button>
            <button
              onClick={onTest}
              disabled={busy || testing || !configured}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity"
              style={{ background: '#fff', color: '#6C3BFF', border: '1px solid #6C3BFF' }}
              title={!configured ? 'Guarda la configuración primero.' : 'Lee la primera fila de la tabla para validar la conexión.'}
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
              Probar conexión
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-componentes visuales ────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-5 flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>{title}</h2>
        {hint && <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: '#F0EDF9' }} />;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
      <label className="text-sm text-neutral-600" style={{ color: '#6B6480' }}>{label}</label>
      {children}
      {hint && <p className="text-[11px]" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function Input({
  value, onChange, placeholder, inputMode, required,
}: {
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  inputMode?:   'text' | 'numeric' | 'decimal';
  required?:    boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      required={required}
      className="w-full rounded-lg px-3 py-2 text-sm"
      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
    />
  );
}
