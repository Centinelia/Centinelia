'use client';

import { useState, useEffect, useMemo } from 'react';
import { Users, Upload, Trash2, Edit2, Check, X, Loader2, Search, ChevronLeft, ChevronRight, Eye, ArrowRight, Filter } from 'lucide-react';
import { useApi } from '@/lib/hooks/useApi';

const PAGE_SIZE = 20;

interface Contacto {
  id:                       string;
  external_id:              string | null;
  nombre:                   string;
  telefono:                 string | null;
  correo:                   string | null;
  estado_actual:            string;
  datos_operacionales:      Record<string, unknown>;
  ultima_interaccion_at:    string | null;
  ultima_interaccion_tipo:  string | null;
  proxima_accion_at:        string | null;
  proxima_accion_tipo:      string | null;
  total_interacciones:      number;
  promesas_hechas:          number;
  promesas_cumplidas:       number;
  sentimiento_ultimo:       string | null;
  capacidad_pago_detectada: string | null;
  notas:                    string | null;
  updated_at:               string;
}

interface Interaccion {
  id:              string;
  fecha:           string;
  tipo:            string;
  canal_ref_id:    string | null;
  duracion_seg:    number | null;
  resumen:         string | null;
  sentimiento:     string | null;
  temas:           string[] | null;
  promesa_monto:   number | null;
  promesa_fecha:   string | null;
  proxima_accion:  string | null;
  escalado_a:      string | null;
}

interface PreviewData {
  filename:          string;
  total_rows_leidas: number;
  headers:           string[];
  sample_rows:       Record<string, unknown>[];
}

interface ColumnMapping {
  external_id?:   string;
  nombre:         string;
  telefono?:      string;
  correo?:        string;
  notas?:         string;
  estado_inicial?: string;
  datos_operacionales?: Record<string, string>;
}

const ESTADOS = ['activo', 'promesa_pendiente', 'promesa_rota', 'legal', 'pagado', 'inactivo'];

interface ContactosResponse {
  enabled:   boolean;
  contactos: Contacto[];
  total:     number;
}

export default function PerfilesVivosSection({ token }: { token: string }) {
  const [page,       setPage]       = useState(0);
  const [query,      setQuery]      = useState('');
  const [estado,     setEstado]     = useState<string | null>(null);
  const [msg,        setMsg]        = useState<string | null>(null);
  const [uiError,    setUiError]    = useState<string | null>(null);
  const [detailId,   setDetailId]   = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Debounced query para no golpear el API en cada tecla
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset a página 0 cuando cambia filtro/búsqueda
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset de paginación cuando cambia filtro es sincronización derivada legítima.
    setPage(0);
  }, [debouncedQuery, estado]);

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (estado) params.set('estado', estado);
    if (debouncedQuery) params.set('q', debouncedQuery);
    return `/api/portal/${token}/contactos?${params.toString()}`;
  }, [token, page, estado, debouncedQuery]);

  const { data, error: fetchError, isLoading: loading, mutate } = useApi<ContactosResponse>(url);

  const enabled     = data?.enabled === true;
  const contactos   = data?.contactos ?? [];
  const total       = data?.total ?? 0;
  const displayError = uiError ?? fetchError?.message ?? null;
  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleDelete(c: Contacto) {
    if (!confirm(`¿Eliminar el contacto "${c.nombre}" y todo su historial? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/portal/${token}/contactos/${c.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setMsg(`Contacto "${c.nombre}" eliminado.`);
      await mutate();
    } catch (err) {
      setUiError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2" style={{ color: '#1A0A3B' }}>
          <Users size={18} />
          <h3 className="font-semibold">Perfiles vivos</h3>
          {enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8E3F5', color: '#6C3BFF' }}>
              Activo
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: '#4A3B6B' }}>
          {total} {total === 1 ? 'contacto' : 'contactos'} en cartera
        </span>
      </div>

      <p className="text-sm" style={{ color: '#4A3B6B' }}>
        Cada contacto de tu negocio (deudor, prospecto, paciente, cuenta activa) tiene una memoria persistente que tus empleados consultan al inicio de cada llamada, chat o correo. Después de cada interacción se actualiza automáticamente con lo que pasó, para que la próxima vez tengan continuidad histórica.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#6C3BFF' }}
        >
          <Upload size={16} />
          Subir cartera
        </button>
        <span className="text-xs" style={{ color: '#4A3B6B' }}>
          Formato CSV o Excel. Al subir la primera cartera se activa el pack solo.
        </span>
      </div>

      {msg && (
        <div className="text-sm p-3 rounded-lg flex items-center gap-2" style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
          <Check size={16} /> <span>{msg}</span>
        </div>
      )}
      {displayError && (
        <div className="text-sm p-3 rounded-lg flex items-center gap-2" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <X size={16} /> <span>{displayError}</span>
        </div>
      )}

      {enabled && contactos.length === 0 && !loading && total === 0 && (
        <div className="text-sm py-6 text-center rounded-lg" style={{ color: '#4A3B6B', background: '#FFFFFF', border: '1px dashed #E8E3F5' }}>
          Aún no hay contactos en tu cartera. Sube tu primer archivo para empezar.
        </div>
      )}

      {(total > 0 || query || estado) && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-[200px]" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
              <Search size={14} style={{ color: '#9B8FB5' }} />
              <input
                type="text"
                placeholder="Buscar por nombre, teléfono, correo o ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none"
                style={{ color: '#1A0A3B' }}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} style={{ color: '#9B8FB5' }} aria-label="Limpiar">
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
              <Filter size={14} style={{ color: '#9B8FB5' }} />
              <select
                value={estado ?? ''}
                onChange={(e) => setEstado(e.target.value || null)}
                className="text-sm bg-transparent outline-none"
                style={{ color: '#1A0A3B' }}
              >
                <option value="">Todos los estados</option>
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {loading && (
              <div className="text-sm py-6 text-center flex items-center justify-center gap-2" style={{ color: '#4A3B6B' }}>
                <Loader2 size={16} className="animate-spin" />
                <span>Cargando contactos…</span>
              </div>
            )}
            {!loading && contactos.length === 0 && (
              <div className="text-sm py-6 text-center rounded-lg" style={{ color: '#4A3B6B', background: '#FFFFFF', border: '1px dashed #E8E3F5' }}>
                Ningún contacto coincide con el filtro.
              </div>
            )}
            {contactos.map((c) => (
              <ContactoRow key={c.id} contacto={c} onOpen={() => setDetailId(c.id)} onDelete={() => handleDelete(c)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 mt-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#FFFFFF', color: '#1A0A3B', border: '1px solid #E8E3F5', opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'not-allowed' : 'pointer' }}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <span className="text-xs" style={{ color: '#4A3B6B' }}>
                Página {page + 1} de {totalPages} · {total} contactos
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#FFFFFF', color: '#1A0A3B', border: '1px solid #E8E3F5', opacity: page >= totalPages - 1 ? 0.4 : 1, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {showImport && (
        <ImportWizard
          token={token}
          onClose={() => setShowImport(false)}
          onDone={(msgTxt) => {
            setShowImport(false);
            setMsg(msgTxt);
            mutate();
          }}
          onError={(e) => setUiError(e)}
        />
      )}

      {detailId && (
        <ContactoDetail
          token={token}
          contactoId={detailId}
          onClose={() => setDetailId(null)}
          onEdited={() => mutate()}
        />
      )}
    </div>
  );
}

// ─── Fila de contacto ───────────────────────────────────────────────────────
function ContactoRow({ contacto: c, onOpen, onDelete }: { contacto: Contacto; onOpen: () => void; onDelete: () => void }) {
  const sentimientoColor: Record<string, string> = {
    cooperativo: '#16a34a',
    positivo:    '#16a34a',
    evasivo:     '#f59e0b',
    frustrado:   '#f59e0b',
    agresivo:    '#DC2626',
    neutro:      '#4A3B6B',
  };
  return (
    <div className="p-3 rounded-lg flex items-center justify-between gap-3" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate" style={{ color: '#1A0A3B' }}>{c.nombre}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#F0EDF9', color: '#6B6480' }}>
            {c.estado_actual.replace('_', ' ')}
          </span>
          {c.sentimiento_ultimo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'transparent', color: sentimientoColor[c.sentimiento_ultimo] ?? '#4A3B6B', border: `1px solid ${sentimientoColor[c.sentimiento_ultimo] ?? '#4A3B6B'}55` }}>
              {c.sentimiento_ultimo}
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: '#4A3B6B' }}>
          {c.telefono && <span>{c.telefono}</span>}
          {c.correo && <span>{c.correo}</span>}
          {c.external_id && <span>ID: {c.external_id}</span>}
        </div>
        <div className="text-xs mt-0.5 flex flex-wrap gap-x-3" style={{ color: '#6B6480' }}>
          <span>{c.total_interacciones} interacciones</span>
          {c.promesas_hechas > 0 && <span>{c.promesas_cumplidas}/{c.promesas_hechas} promesas cumplidas</span>}
          {c.ultima_interaccion_at && <span>Última: {new Date(c.ultima_interaccion_at).toLocaleDateString('es-MX')}</span>}
          {c.proxima_accion_at && <span>Próxima: {new Date(c.proxima_accion_at).toLocaleDateString('es-MX')}</span>}
        </div>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
          style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          <Eye size={12} /> Ver
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
          style={{ color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}
        >
          <Trash2 size={12} /> Eliminar
        </button>
      </div>
    </div>
  );
}

// ─── Import Wizard: file → preview → column mapping → import ────────────────
function ImportWizard({ token, onClose, onDone, onError }: { token: string; onClose: () => void; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const [file,     setFile]     = useState<File | null>(null);
  const [preview,  setPreview]  = useState<PreviewData | null>(null);
  const [mapping,  setMapping]  = useState<ColumnMapping>({ nombre: '' });
  const [extraCols,setExtraCols]= useState<Array<{ key: string; column: string }>>([]);
  const [busy,     setBusy]     = useState(false);

  async function handleFile(f: File) {
    setBusy(true);
    setFile(f);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`/api/portal/${token}/cartera/preview`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPreview(data);
      // Auto-detect mappings comunes
      const auto: ColumnMapping = { nombre: '' };
      for (const h of data.headers as string[]) {
        const hl = h.toLowerCase();
        if (!auto.nombre    && /nombre|name/.test(hl))                     auto.nombre    = h;
        if (!auto.telefono  && /tel[eé]fono|phone|celular|movil|cel/.test(hl)) auto.telefono  = h;
        if (!auto.correo    && /correo|email|mail/.test(hl))               auto.correo    = h;
        if (!auto.external_id && /id|expediente|folio|cuenta/.test(hl) && hl.length < 20) auto.external_id = h;
      }
      setMapping(auto);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file || !preview) return;
    if (!mapping.nombre) { onError('Debes mapear al menos la columna "Nombre".'); return; }
    setBusy(true);
    try {
      const finalMapping: ColumnMapping = { ...mapping };
      if (extraCols.length > 0) {
        finalMapping.datos_operacionales = {};
        for (const { key, column } of extraCols) {
          if (key.trim() && column) finalMapping.datos_operacionales[key.trim()] = column;
        }
      }
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(finalMapping));
      const res = await fetch(`/api/portal/${token}/cartera`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const parts: string[] = [];
      if (data.contactos_creados > 0)      parts.push(`${data.contactos_creados} nuevos`);
      if (data.contactos_actualizados > 0) parts.push(`${data.contactos_actualizados} actualizados`);
      if (data.rows_saltadas > 0)          parts.push(`${data.rows_saltadas} saltadas`);
      const autoMsg = data.auto_activated ? ' El pack quedó activo automáticamente.' : '';
      onDone(`Cartera procesada: ${parts.join(', ') || 'sin cambios'}.${autoMsg}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(26,10,59,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 flex flex-col gap-4" style={{ background: '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: '#1A0A3B' }}>Subir cartera de contactos</h3>
          <button type="button" onClick={onClose} style={{ color: '#9B8FB5' }}><X size={18} /></button>
        </div>

        {!preview && (
          <>
            <p className="text-sm" style={{ color: '#4A3B6B' }}>
              Sube un archivo CSV o Excel. Después vas a elegir qué columna corresponde a nombre, teléfono, correo, etc.
            </p>
            <label className="inline-flex items-center justify-center gap-2 px-4 py-6 rounded-lg cursor-pointer" style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5', color: '#6C3BFF' }}>
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              {busy ? 'Leyendo…' : 'Elegir archivo (CSV, XLSX, XLS)'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </>
        )}

        {preview && (
          <>
            <div className="text-xs" style={{ color: '#4A3B6B' }}>
              Archivo: <span className="font-medium" style={{ color: '#1A0A3B' }}>{preview.filename}</span> · {preview.total_rows_leidas} filas · {preview.headers.length} columnas
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium" style={{ color: '#1A0A3B' }}>Mapea las columnas de tu archivo</div>
              <MapField label="Nombre (obligatorio)" required value={mapping.nombre} headers={preview.headers} onChange={(v) => setMapping({ ...mapping, nombre: v })} />
              <MapField label="Teléfono"    value={mapping.telefono    ?? ''} headers={preview.headers} onChange={(v) => setMapping({ ...mapping, telefono:    v || undefined })} />
              <MapField label="Correo"      value={mapping.correo      ?? ''} headers={preview.headers} onChange={(v) => setMapping({ ...mapping, correo:      v || undefined })} />
              <MapField label="ID externo"  value={mapping.external_id ?? ''} headers={preview.headers} onChange={(v) => setMapping({ ...mapping, external_id: v || undefined })} />
              <MapField label="Notas"       value={mapping.notas       ?? ''} headers={preview.headers} onChange={(v) => setMapping({ ...mapping, notas:       v || undefined })} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium" style={{ color: '#1A0A3B' }}>Datos adicionales (opcional)</div>
                <button
                  type="button"
                  onClick={() => setExtraCols([...extraCols, { key: '', column: '' }])}
                  className="text-xs font-medium" style={{ color: '#6C3BFF' }}
                >
                  + Agregar
                </button>
              </div>
              <p className="text-xs" style={{ color: '#4A3B6B' }}>
                Guarda columnas específicas de tu vertical (ej. monto_adeudado, dias_mora, tipo_credito). El empleado las verá al consultar el contacto.
              </p>
              {extraCols.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="clave (ej. monto_adeudado)"
                    value={row.key}
                    onChange={(e) => {
                      const next = [...extraCols];
                      next[i] = { ...next[i], key: e.target.value };
                      setExtraCols(next);
                    }}
                    className="flex-1 px-2 py-1.5 rounded border text-xs"
                    style={{ borderColor: '#E8E3F5', color: '#1A0A3B' }}
                  />
                  <ArrowRight size={12} style={{ color: '#9B8FB5' }} />
                  <select
                    value={row.column}
                    onChange={(e) => {
                      const next = [...extraCols];
                      next[i] = { ...next[i], column: e.target.value };
                      setExtraCols(next);
                    }}
                    className="flex-1 px-2 py-1.5 rounded border text-xs"
                    style={{ borderColor: '#E8E3F5', color: '#1A0A3B' }}
                  >
                    <option value="">— columna del archivo —</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setExtraCols(extraCols.filter((_, j) => j !== i))}
                    style={{ color: '#DC2626' }}
                    aria-label="Quitar"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-2" style={{ borderTop: '1px solid #F0EDF9' }}>
              <button
                type="button"
                onClick={() => { setPreview(null); setFile(null); setMapping({ nombre: '' }); setExtraCols([]); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: '#FFFFFF', color: '#1A0A3B', border: '1px solid #E8E3F5' }}
              >
                Elegir otro archivo
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || !mapping.nombre}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: '#6C3BFF', opacity: busy || !mapping.nombre ? 0.5 : 1 }}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Importar {preview.total_rows_leidas} filas
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MapField({ label, value, headers, onChange, required = false }: { label: string; value: string; headers: string[]; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs w-40" style={{ color: '#4A3B6B' }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-1.5 rounded border text-xs"
        style={{ borderColor: required && !value ? '#DC2626' : '#E8E3F5', color: '#1A0A3B' }}
      >
        <option value="">{required ? '— obligatorio —' : '— (ninguna) —'}</option>
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </div>
  );
}

// ─── Modal de detalle ───────────────────────────────────────────────────────
interface ContactoDetailResponse {
  contacto:      Contacto;
  interacciones: Interaccion[];
}

function ContactoDetail({ token, contactoId, onClose, onEdited }: { token: string; contactoId: string; onClose: () => void; onEdited: () => void }) {
  const { data, error: fetchErr, isLoading: loading, mutate } = useApi<ContactoDetailResponse>(
    `/api/portal/${token}/contactos/${contactoId}`,
  );
  const contacto      = data?.contacto ?? null;
  const interacciones = data?.interacciones ?? [];

  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState<Partial<Contacto>>({});
  const [saving,  setSaving]  = useState(false);
  const [uiErr,   setUiErr]   = useState<string | null>(null);
  const err = uiErr ?? fetchErr?.message ?? null;

  // Rehidratar form cuando llegue contacto del server. Sync de estado externo
  // (SWR data) → estado local editable. Es el patrón estándar props→state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizacion legitima de SWR cache a form editable local.
    if (contacto) setForm(contacto);
  }, [contacto]);

  async function save() {
    if (!contacto) return;
    setSaving(true);
    setUiErr(null);
    try {
      const patch: Record<string, unknown> = {};
      for (const k of ['nombre', 'telefono', 'correo', 'external_id', 'estado_actual', 'notas', 'capacidad_pago_detectada', 'proxima_accion_at', 'proxima_accion_tipo', 'datos_operacionales'] as const) {
        if (form[k] !== undefined) patch[k] = form[k];
      }
      const res = await fetch(`/api/portal/${token}/contactos/${contactoId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      await mutate();
      onEdited();
    } catch (e) {
      setUiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const datosOpEntries = useMemo(() => contacto ? Object.entries(contacto.datos_operacionales ?? {}) : [], [contacto]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(26,10,59,0.5)' }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 flex flex-col gap-4" style={{ background: '#FFFFFF' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: '#1A0A3B' }}>
            {loading ? 'Cargando…' : contacto?.nombre ?? 'Contacto'}
          </h3>
          <div className="flex gap-2">
            {contacto && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium"
                style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)' }}
              >
                <Edit2 size={12} /> Editar
              </button>
            )}
            <button type="button" onClick={onClose} style={{ color: '#9B8FB5' }}><X size={18} /></button>
          </div>
        </div>

        {err && <div className="text-xs p-2 rounded" style={{ background: '#FEF2F2', color: '#DC2626' }}>{err}</div>}

        {loading && (
          <div className="text-sm py-6 text-center flex items-center justify-center gap-2" style={{ color: '#4A3B6B' }}>
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        )}

        {contacto && (
          <>
            {!editing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" style={{ color: '#4A3B6B' }}>
                <Info label="ID externo"   value={contacto.external_id} />
                <Info label="Teléfono"     value={contacto.telefono} />
                <Info label="Correo"       value={contacto.correo} />
                <Info label="Estado"       value={contacto.estado_actual.replace('_', ' ')} />
                <Info label="Interacciones" value={String(contacto.total_interacciones)} />
                <Info label="Promesas"     value={`${contacto.promesas_cumplidas} de ${contacto.promesas_hechas} cumplidas`} />
                <Info label="Sentimiento último" value={contacto.sentimiento_ultimo} />
                <Info label="Capacidad pago detectada" value={contacto.capacidad_pago_detectada} />
                <Info label="Última interacción" value={contacto.ultima_interaccion_at ? new Date(contacto.ultima_interaccion_at).toLocaleString('es-MX') : null} />
                <Info label="Próxima acción" value={contacto.proxima_accion_at ? `${new Date(contacto.proxima_accion_at).toLocaleString('es-MX')} · ${contacto.proxima_accion_tipo ?? ''}` : null} />
              </div>
            )}

            {editing && contacto && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <EditText label="Nombre"       value={form.nombre       ?? ''} onChange={(v) => setForm({ ...form, nombre:       v })} />
                <EditText label="Teléfono"     value={form.telefono     ?? ''} onChange={(v) => setForm({ ...form, telefono:     v })} />
                <EditText label="Correo"       value={form.correo       ?? ''} onChange={(v) => setForm({ ...form, correo:       v })} />
                <EditText label="ID externo"   value={form.external_id  ?? ''} onChange={(v) => setForm({ ...form, external_id:  v })} />
                <EditSelect label="Estado" value={form.estado_actual ?? 'activo'} options={ESTADOS} onChange={(v) => setForm({ ...form, estado_actual: v })} />
                <EditSelect label="Capacidad pago" value={form.capacidad_pago_detectada ?? ''} options={['', 'alta', 'media', 'baja', 'desconocida']} onChange={(v) => setForm({ ...form, capacidad_pago_detectada: v || null })} />
                <EditText label="Próxima acción tipo" value={form.proxima_accion_tipo ?? ''} onChange={(v) => setForm({ ...form, proxima_accion_tipo: v })} />
                <EditText label="Próxima acción cuándo" value={form.proxima_accion_at ?? ''} onChange={(v) => setForm({ ...form, proxima_accion_at: v })} placeholder="ISO timestamp o vacío" />
                <div className="sm:col-span-2">
                  <label className="text-xs" style={{ color: '#4A3B6B' }}>Notas</label>
                  <textarea
                    value={form.notas ?? ''}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    className="w-full px-2 py-1.5 rounded border text-xs mt-1"
                    style={{ borderColor: '#E8E3F5', color: '#1A0A3B' }}
                    rows={3}
                  />
                </div>
                <div className="flex gap-2 sm:col-span-2 pt-2">
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white inline-flex items-center gap-1"
                    style={{ background: '#6C3BFF', opacity: saving ? 0.5 : 1 }}
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setForm(contacto); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1"
                    style={{ background: '#FFFFFF', color: '#1A0A3B', border: '1px solid #E8E3F5' }}
                  >
                    <X size={12} /> Cancelar
                  </button>
                </div>
              </div>
            )}

            {!editing && datosOpEntries.length > 0 && (
              <div className="flex flex-col gap-1 pt-2" style={{ borderTop: '1px solid #F0EDF9' }}>
                <div className="text-sm font-medium" style={{ color: '#1A0A3B' }}>Datos operacionales</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs" style={{ color: '#4A3B6B' }}>
                  {datosOpEntries.map(([k, v]) => (
                    <div key={k}><span className="font-medium">{k}:</span> {String(v)}</div>
                  ))}
                </div>
              </div>
            )}

            {contacto.notas && !editing && (
              <div className="pt-2 text-xs" style={{ borderTop: '1px solid #F0EDF9', color: '#4A3B6B' }}>
                <div className="font-medium mb-1" style={{ color: '#1A0A3B' }}>Notas</div>
                <div className="whitespace-pre-wrap">{contacto.notas}</div>
              </div>
            )}

            <div className="pt-2" style={{ borderTop: '1px solid #F0EDF9' }}>
              <div className="text-sm font-medium mb-2" style={{ color: '#1A0A3B' }}>
                Timeline de interacciones ({interacciones.length})
              </div>
              <div className="flex flex-col gap-2">
                {interacciones.length === 0 && (
                  <div className="text-xs" style={{ color: '#6B6480' }}>Aún no hay interacciones registradas.</div>
                )}
                {interacciones.map((i) => (
                  <InteraccionRow key={i.id} interaccion={i} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InteraccionRow({ interaccion: i }: { interaccion: Interaccion }) {
  return (
    <div className="p-2.5 rounded-lg text-xs" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#4A3B6B' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium" style={{ color: '#1A0A3B' }}>{i.tipo.replace('_', ' ')}</span>
        <span>{new Date(i.fecha).toLocaleString('es-MX')}</span>
      </div>
      {i.resumen && <div className="mt-1">{i.resumen}</div>}
      <div className="mt-1 flex flex-wrap gap-x-3">
        {i.sentimiento && <span>Sentimiento: {i.sentimiento}</span>}
        {i.duracion_seg != null && <span>Duración: {Math.round(i.duracion_seg / 60)} min</span>}
        {i.promesa_monto && i.promesa_fecha && <span>Promesa: ${i.promesa_monto} para {i.promesa_fecha}</span>}
        {i.proxima_accion && <span>Próxima: {i.proxima_accion}</span>}
        {i.escalado_a && <span>Escalado a: {i.escalado_a}</span>}
      </div>
      {i.temas && i.temas.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {i.temas.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#F0EDF9', color: '#6B6480' }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div><span className="font-medium" style={{ color: '#1A0A3B' }}>{label}:</span> {value}</div>
  );
}

function EditText({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: '#4A3B6B' }}>
      <span className="font-medium">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded border text-xs"
        style={{ borderColor: '#E8E3F5', color: '#1A0A3B' }}
      />
    </label>
  );
}

function EditSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: '#4A3B6B' }}>
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded border text-xs"
        style={{ borderColor: '#E8E3F5', color: '#1A0A3B' }}
      >
        {options.map((o) => <option key={o} value={o}>{o === '' ? '— (ninguno) —' : o.replace('_', ' ')}</option>)}
      </select>
    </label>
  );
}
