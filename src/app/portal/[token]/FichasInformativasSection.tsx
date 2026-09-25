'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Upload, Trash2, Edit2, Check, X, Loader2, Link as LinkIcon, Mail, Phone, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import TagSuggestionsChips from './TagSuggestionsChips';

const PAGE_SIZE = 20;

interface Ficha {
  id:                    string;
  codigo:                string;
  titulo:                string;
  dependencia:           string | null;
  unidad_administrativa: string | null;
  contacto_nombre:       string | null;
  contacto_puesto:       string | null;
  contacto_correo:       string | null;
  contacto_telefono:     string | null;
  contacto_extension:    string | null;
  liga_en_linea:         string | null;
  direccion:             string | null;
  horario:               string | null;
  costo_descripcion:     string | null;
  plazo_respuesta:       string | null;
  chunks_count:          number;
  parsed_at:             string;
  updated_at:            string;
  /** Etiquetas de clasificación asignadas por autotag o manualmente */
  tags?:                 string[];
}

interface Props {
  token: string;
}

type Mode = 'stuffed' | 'embeddings';

export default function FichasInformativasSection({ token }: Props) {
  const [fichas,   setFichas]   = useState<Ficha[]>([]);
  const [enabled,  setEnabled]  = useState(false);
  const [mode,     setMode]     = useState<Mode>('stuffed');
  const [loading,  setLoading]  = useState(true);
  const [uploading,setUploading]= useState(false);
  const [msg,        setMsg]        = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  /** Ficha recién subida con etiquetas sugeridas — se muestra temporalmente */
  const [newFichaId, setNewFichaId] = useState<{ id: string; tags: string[] } | null>(null);
  const [query,    setQuery]    = useState('');
  const [page,     setPage]     = useState(0);

  const loadFichas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/fichas`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setFichas(data.fichas ?? []);
      setEnabled(data.enabled === true);
      setMode((data.mode as Mode) ?? 'stuffed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar fichas');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadFichas(); }, [loadFichas]);

  async function handleUpload(file: File) {
    setUploading(true);
    setMsg('Subiendo PDF y extrayendo datos con IA...');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/portal/${token}/fichas`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const autoMsg = data.auto_activated ? ' Las fichas quedaron activas automáticamente.' : '';
      setMsg(`Ficha "${data.titulo}" cargada con ${data.chunks_count} secciones.${autoMsg}`);
      // Si el response incluye etiquetas sugeridas, guardar para mostrar chips
      if (data.id && Array.isArray(data.tags) && data.tags.length > 0) {
        setNewFichaId({ id: data.id as string, tags: data.tags as string[] });
      } else {
        setNewFichaId(null);
      }
      await loadFichas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir la ficha');
      setMsg(null);
    } finally {
      setUploading(false);
    }
  }

  // Filtro por búsqueda: match parcial (case-insensitive) contra título, código,
  // dependencia, unidad, contactos y liga. Suficiente para catálogos hasta ~1000
  // fichas sin necesitar índice remoto.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fichas;
    return fichas.filter((f) => {
      const hay = [
        f.titulo, f.codigo, f.dependencia, f.unidad_administrativa,
        f.contacto_nombre, f.contacto_puesto, f.contacto_correo,
        f.contacto_telefono, f.contacto_extension, f.liga_en_linea,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [fichas, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const visible    = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Reset paginación cuando cambia el filtro (evita quedar en página 3 tras filtrar a 5 resultados).
  useEffect(() => { setPage(0); }, [query, fichas.length]);

  async function handleDelete(ficha: Ficha) {
    if (!confirm(`¿Borrar la ficha "${ficha.titulo}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/portal/${token}/fichas/${ficha.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setMsg(`Ficha "${ficha.titulo}" eliminada.`);
      await loadFichas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2" style={{ color: '#1A0A3B' }}>
          <FileText size={18} />
          <h3 className="font-semibold">Fichas informativas</h3>
          {enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#E8E3F5', color: '#6C3BFF' }}>
              Activo · {mode === 'embeddings' ? 'búsqueda semántica' : 'catálogo completo'}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: '#4A3B6B' }}>
          {fichas.length} {fichas.length === 1 ? 'ficha cargada' : 'fichas cargadas'}
        </span>
      </div>

      <p className="text-sm" style={{ color: '#4A3B6B' }}>
        Sube documentos oficiales de tu negocio (trámites, catálogos de producto, procedimientos, políticas). Tu empleado los consulta automáticamente al responder al cliente por voz, chat o correo, con base en la información oficial y sin inventar. Al subir la primera ficha, el sistema activa la función solo.
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <label
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer transition-opacity"
          style={{ background: '#6C3BFF', opacity: uploading ? 0.5 : 1, cursor: uploading ? 'wait' : 'pointer' }}
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? 'Procesando…' : 'Subir PDF'}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-xs" style={{ color: '#4A3B6B' }}>
          Formato PDF, máximo 20 MB. Procesamiento: 10 a 30 segundos.
        </span>
      </div>

      {msg && (
        <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-2 text-sm">
            <Check size={16} />
            <span>{msg}</span>
          </div>
          {newFichaId && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium" style={{ color: '#166534' }}>Etiquetas:</span>
              <TagSuggestionsChips
                token={token}
                fichaId={newFichaId.id}
                initialTags={newFichaId.tags}
              />
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="text-sm p-3 rounded-lg flex items-center gap-2" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
          <X size={16} />
          <span>{error}</span>
        </div>
      )}

      {fichas.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
          <Search size={14} style={{ color: '#9B8FB5' }} />
          <input
            type="text"
            placeholder="Buscar por título, código, contacto, dependencia…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: '#1A0A3B' }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded hover:opacity-80"
              style={{ color: '#9B8FB5' }}
              aria-label="Limpiar búsqueda"
            >
              <X size={12} />
            </button>
          )}
          <span className="text-xs whitespace-nowrap" style={{ color: '#4A3B6B' }}>
            {filtered.length} de {fichas.length}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {loading && (
          <div className="text-sm py-6 text-center flex items-center justify-center gap-2" style={{ color: '#4A3B6B' }}>
            <Loader2 size={16} className="animate-spin" />
            <span>Cargando fichas…</span>
          </div>
        )}
        {!loading && fichas.length === 0 && (
          <div className="text-sm py-6 text-center rounded-lg" style={{ color: '#4A3B6B', background: '#FFFFFF', border: '1px dashed #E8E3F5' }}>
            Aún no hay fichas cargadas. Sube la primera para arrancar.
          </div>
        )}
        {!loading && fichas.length > 0 && filtered.length === 0 && (
          <div className="text-sm py-6 text-center rounded-lg" style={{ color: '#4A3B6B', background: '#FFFFFF', border: '1px dashed #E8E3F5' }}>
            Ninguna ficha coincide con "{query}". Prueba con otro término.
          </div>
        )}
        {visible.map((f) => (
          <FichaCard
            key={f.id}
            ficha={f}
            token={token}
            onDelete={() => handleDelete(f)}
            onEdited={() => loadFichas()}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 mt-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
            style={{
              background:  '#FFFFFF',
              color:       '#1A0A3B',
              border:      '1px solid #E8E3F5',
              opacity:     safePage === 0 ? 0.4 : 1,
              cursor:      safePage === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={14} />
            Anterior
          </button>
          <span className="text-xs" style={{ color: '#4A3B6B' }}>
            Página {safePage + 1} de {totalPages} · mostrando {visible.length} de {filtered.length}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={safePage >= totalPages - 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
            style={{
              background:  '#FFFFFF',
              color:       '#1A0A3B',
              border:      '1px solid #E8E3F5',
              opacity:     safePage >= totalPages - 1 ? 0.4 : 1,
              cursor:      safePage >= totalPages - 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Siguiente
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function FichaCard({ ficha, token, onDelete, onEdited }: { ficha: Ficha; token: string; onDelete: () => void; onEdited: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({
    contacto_nombre:    ficha.contacto_nombre    ?? '',
    contacto_puesto:    ficha.contacto_puesto    ?? '',
    contacto_correo:    ficha.contacto_correo    ?? '',
    contacto_telefono:  ficha.contacto_telefono  ?? '',
    contacto_extension: ficha.contacto_extension ?? '',
    liga_en_linea:      ficha.liga_en_linea      ?? '',
    horario:            ficha.horario            ?? '',
    costo_descripcion:  ficha.costo_descripcion  ?? '',
    plazo_respuesta:    ficha.plazo_respuesta    ?? '',
  });
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/portal/${token}/fichas/${ficha.id}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      onEdited();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 rounded-lg flex flex-col gap-2" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <div className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>{ficha.titulo}</div>
          <div className="text-xs" style={{ color: '#4A3B6B' }}>
            {ficha.codigo} · {ficha.chunks_count} secciones
            {ficha.dependencia ? ` · ${ficha.dependencia}` : ''}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.2)' }}
            aria-label="Editar"
          >
            <Edit2 size={12} />
            Editar
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{ color: '#DC2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}
            aria-label="Eliminar"
          >
            <Trash2 size={12} />
            Eliminar
          </button>
        </div>
      </div>

      {!editing && (
        <div className="flex flex-col gap-1 text-xs" style={{ color: '#4A3B6B' }}>
          {ficha.contacto_nombre && (
            <div><span className="font-medium" style={{ color: '#1A0A3B' }}>{ficha.contacto_nombre}</span>{ficha.contacto_puesto ? ` — ${ficha.contacto_puesto}` : ''}</div>
          )}
          <div className="flex flex-wrap gap-3">
            {ficha.contacto_correo && (<span className="inline-flex items-center gap-1"><Mail size={12} />{ficha.contacto_correo}</span>)}
            {ficha.contacto_telefono && (<span className="inline-flex items-center gap-1"><Phone size={12} />{ficha.contacto_telefono}{ficha.contacto_extension ? ` ext ${ficha.contacto_extension}` : ''}</span>)}
            {ficha.liga_en_linea && (<a href={ficha.liga_en_linea} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline" style={{ color: '#6C3BFF' }}><LinkIcon size={12} />portal en línea</a>)}
          </div>
          {(ficha.horario || ficha.costo_descripcion || ficha.plazo_respuesta) && (
            <div className="flex flex-wrap gap-3 mt-1">
              {ficha.horario && (<span>Horario: {ficha.horario}</span>)}
              {ficha.costo_descripcion && (<span>Costo: {ficha.costo_descripcion}</span>)}
              {ficha.plazo_respuesta && (<span>Plazo: {ficha.plazo_respuesta}</span>)}
            </div>
          )}
          {/* Etiquetas de clasificación */}
          <div className="mt-1">
            <TagSuggestionsChips
              token={token}
              fichaId={ficha.id}
              initialTags={ficha.tags ?? []}
            />
          </div>
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <EditField label="Nombre del contacto" value={form.contacto_nombre}    onChange={(v) => setForm({ ...form, contacto_nombre: v })} />
            <EditField label="Puesto"              value={form.contacto_puesto}    onChange={(v) => setForm({ ...form, contacto_puesto: v })} />
            <EditField label="Correo"              value={form.contacto_correo}    onChange={(v) => setForm({ ...form, contacto_correo: v })} type="email" />
            <EditField label="Teléfono"            value={form.contacto_telefono}  onChange={(v) => setForm({ ...form, contacto_telefono: v })} type="tel" />
            <EditField label="Extensión"           value={form.contacto_extension} onChange={(v) => setForm({ ...form, contacto_extension: v })} />
            <EditField label="Liga en línea"       value={form.liga_en_linea}      onChange={(v) => setForm({ ...form, liga_en_linea: v })} type="url" />
            <EditField label="Horario"             value={form.horario}            onChange={(v) => setForm({ ...form, horario: v })} />
            <EditField label="Costo"               value={form.costo_descripcion}  onChange={(v) => setForm({ ...form, costo_descripcion: v })} />
            <EditField label="Plazo de respuesta"  value={form.plazo_respuesta}    onChange={(v) => setForm({ ...form, plazo_respuesta: v })} />
          </div>
          {err && <div className="text-xs" style={{ color: '#DC2626' }}>{err}</div>}
          <div className="flex gap-2">
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
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1"
              style={{ background: '#FFFFFF', color: '#1A0A3B', border: '1px solid #E8E3F5' }}
            >
              <X size={12} />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs" style={{ color: '#4A3B6B' }}>
      <span className="font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded border text-xs"
        style={{ borderColor: '#E8E3F5', color: '#1A0A3B' }}
      />
    </label>
  );
}
