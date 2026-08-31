'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, RotateCcw, Loader2, CheckCircle2, User, Lightbulb, AlertTriangle, Info, CalendarDays } from 'lucide-react';
import Meerkat from '@/components/icons/Meerkat';

interface TemplateSuggestion {
  type:      'rename_header' | 'add_header' | 'remove_col' | 'widen_col' | 'simplify_grid' | 'other';
  col?:      string;
  current?:  string | null;
  proposed?: string | null;
  rationale: string;
  severity:  'info' | 'warning' | 'important';
}

interface CurrentTemplate {
  filename?:    string;
  uploaded_at?: string;
  mapping?: {
    sheet_name?:         string;
    insertion_row?:      number;
    columns?:            Record<string, string>;
    human_only_columns?: string[];
    verification_grid?:  Record<string, string>;
    notes?:              string;
  };
  suggestions?: TemplateSuggestion[];
}

interface AllColumn { col: string; header: string | null; }

const GRID_DAY_LABELS: Record<string, string> = {
  L: 'Lunes', M: 'Martes', MI: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado', D: 'Domingo',
};

interface Props {
  token:         string;
  agentId:       string;
  current:       CurrentTemplate | null;
  uploadCost:    number;
}

const FIELD_LABELS: Record<string, string> = {
  fecha:              'Fecha',
  business_name:      'Negocio',
  sucursal:           'Sucursal',
  contact_name:       'Cliente',
  contact_phone:      'Teléfono',
  address:            'Dirección',
  motivo:             'Motivo',
  tipo:               'Tipo (queja/alta)',
  verification_date:  'Fecha verificación',
  verification_result:'Resultado',
  vendedor:           'Vendedor',
};

export function TemplateUploader({ token, agentId, current, uploadCost }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state,   setState]   = useState<CurrentTemplate | null>(current);
  const [loading, setLoading] = useState(false);
  const [savingTogglesId, setSavingTogglesId] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [allColumns, setAllColumns] = useState<AllColumn[]>([]);

  // Carga la lista completa de columnas del template (letra + header real)
  // desde el bucket. Se usa para mostrar cols sin mapear y grid semanal,
  // no solo las que Claude asignó a un campo canónico.
  useEffect(() => {
    if (!state?.mapping) { setAllColumns([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-columns?agent_id=${agentId}`);
        if (!res.ok) return;
        const body = await res.json() as { columns?: AllColumn[] };
        if (!cancelled) setAllColumns(body.columns ?? []);
      } catch { /* silent — fallback muestra solo mapeadas */ }
    })();
    return () => { cancelled = true; };
  }, [token, agentId, state?.filename, state?.uploaded_at, state?.mapping]);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-upload?agent_id=${agentId}`, {
        method: 'POST',
        body:   form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al analizar');
      setState({
        filename:    file.name,
        uploaded_at: new Date().toISOString(),
        mapping:     body.mapping,
        suggestions: body.suggestions ?? [],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function restoreDefault() {
    if (!confirm('¿Restaurar la plantilla por defecto de Centinelia? Se eliminará tu plantilla personalizada.')) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-upload?agent_id=${agentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? 'Error al eliminar');
      }
      setState(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleHumanOnly(col: string, currentIsHumanOnly: boolean) {
    if (!state?.mapping) return;
    const currentList = state.mapping.human_only_columns ?? [];
    const nextList = currentIsHumanOnly
      ? currentList.filter(c => c.toUpperCase() !== col.toUpperCase())
      : [...currentList, col.toUpperCase()];

    setSavingTogglesId(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-config?agent_id=${agentId}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ human_only_columns: nextList }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al guardar');
      setState({
        ...state,
        mapping: {
          ...state.mapping,
          human_only_columns: body.human_only_columns,
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTogglesId(false);
    }
  }

  async function changeMapping(col: string, newField: string | null) {
    if (!state?.mapping) return;
    setSavingTogglesId(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-config?agent_id=${agentId}`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ columns: { [col.toUpperCase()]: newField } }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al cambiar mapping');
      setState({
        ...state,
        mapping: {
          ...state.mapping,
          columns:            body.columns,
          human_only_columns: body.human_only_columns,
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTogglesId(false);
    }
  }

  const hasCustom = !!state?.mapping;
  const humanOnlySet = new Set((state?.mapping?.human_only_columns ?? []).map(c => c.toUpperCase()));

  return (
    <div
      className="rounded-xl p-4 md:p-5"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet size={16} style={{ color: '#6C3BFF' }} />
        <h2 className="text-sm font-bold" style={{ color: '#1A0A3B' }}>
          Plantilla de bitácora
        </h2>
      </div>
      <p className="text-xs mb-4" style={{ color: '#6B6480' }}>
        Si tienes tu propio formato de bitácora en Excel, súbelo aquí y tu empleado lo llenará usando ese diseño (con tus colores, columnas y logo). Si no subes nada, se usa el formato por defecto de Centinelia.
      </p>

      {hasCustom && (
        <div
          className="rounded-lg p-3 mb-3"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <div className="flex items-start gap-2 mb-2">
            <CheckCircle2 size={14} style={{ color: '#16a34a', marginTop: 2 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: '#166534' }}>
                Plantilla personalizada activa
              </p>
              <p className="text-[11px] truncate" style={{ color: '#4B5563' }}>
                {state?.filename ?? 'archivo.xlsx'}
              </p>
            </div>
          </div>
          {state?.mapping && (() => {
            const mappedCols   = state.mapping.columns ?? {};
            const gridEntries  = Object.entries(state.mapping.verification_grid ?? {});
            const gridColSet   = new Set(gridEntries.map(([, letter]) => letter.toUpperCase()));
            const mappedSet    = new Set(Object.keys(mappedCols).map(c => c.toUpperCase()));
            // Fallback: si no cargó all_columns, sintetiza rango desde mapeadas+grid
            // para al menos mostrar Mapeadas y Grid. Sin mapear queda vacío hasta
            // que el fetch responda.
            const effectiveAll = allColumns.length > 0
              ? allColumns
              : Object.keys(mappedCols).map(c => ({ col: c.toUpperCase(), header: null as string | null }));
            const unmapped = effectiveAll.filter(
              c => !mappedSet.has(c.col.toUpperCase()) && !gridColSet.has(c.col.toUpperCase())
            );

            function renderMappingRow(col: string, field: string, header: string | null) {
              const isHumanOnly = humanOnlySet.has(col.toUpperCase());
              return (
                <div
                  key={col}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
                  style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
                >
                  <strong className="whitespace-nowrap" style={{ color: '#1A0A3B' }}>Col {col}</strong>
                  {header && (
                    <span className="text-[10px] truncate max-w-[110px]" style={{ color: '#9B8FB5' }} title={header}>
                      {header}
                    </span>
                  )}
                  <select
                    value={field}
                    disabled={savingTogglesId}
                    onChange={e => { const val = e.target.value; void changeMapping(col, val === '' ? null : val); }}
                    className="flex-1 text-xs rounded outline-none disabled:opacity-50"
                    style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B', padding: '2px 4px', cursor: savingTogglesId ? 'wait' : 'pointer' }}
                  >
                    <option value="">— sin mapear —</option>
                    {Object.entries(FIELD_LABELS).map(([f, label]) => (
                      <option key={f} value={f}>{label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => toggleHumanOnly(col, isHumanOnly)}
                    disabled={savingTogglesId}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap disabled:opacity-50"
                    style={{
                      background: isHumanOnly ? 'rgba(217,119,6,0.1)' : 'rgba(108,59,255,0.1)',
                      color:      isHumanOnly ? '#B45309'             : '#6C3BFF',
                      border:     'none',
                      cursor:     savingTogglesId ? 'wait' : 'pointer',
                    }}
                  >
                    {isHumanOnly ? <><User size={9} /> Solo yo</> : <><Meerkat size={11} /> Empleado</>}
                  </button>
                </div>
              );
            }

            return (
              <div className="mt-3 pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid rgba(34,197,94,0.2)' }}>
                <p className="text-[11px]" style={{ color: '#6B6480' }}>
                  Marca las columnas donde <strong>solo tú escribes manualmente</strong>. Tu empleado nunca las tocará, aunque las mostrará en el reporte.
                </p>

                {/* Mapeadas — abierta por default */}
                <details open className="rounded-lg group" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                  <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none" style={{ userSelect: 'none' }}>
                    <span className="text-[11px] font-semibold flex-1" style={{ color: '#1A0A3B' }}>
                      Mapeadas ({Object.keys(mappedCols).length})
                    </span>
                    <span className="text-[10px] transition-transform group-open:rotate-180" style={{ color: '#6B6480' }}>▾</span>
                  </summary>
                  <div className="px-2 pb-2 flex flex-col gap-1.5">
                    {Object.entries(mappedCols).map(([col, field]) => {
                      const header = effectiveAll.find(c => c.col.toUpperCase() === col.toUpperCase())?.header ?? null;
                      return renderMappingRow(col, field, header);
                    })}
                  </div>
                </details>

                {/* Sin mapear — colapsada */}
                {unmapped.length > 0 && (
                  <details className="rounded-lg group" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none" style={{ userSelect: 'none' }}>
                      <span className="text-[11px] font-semibold flex-1" style={{ color: '#1A0A3B' }}>
                        Sin mapear ({unmapped.length})
                      </span>
                      <span className="text-[10px] transition-transform group-open:rotate-180" style={{ color: '#6B6480' }}>▾</span>
                    </summary>
                    <div className="px-2 pb-2 flex flex-col gap-1.5">
                      <p className="text-[10px] px-1 pt-1" style={{ color: '#6B6480' }}>
                        Columnas que tu empleado no llena por default. Asígnale un campo o déjalas para llenado manual.
                      </p>
                      {unmapped.map(c => renderMappingRow(c.col, '', c.header))}
                    </div>
                  </details>
                )}

                {/* Grid semanal — colapsada, read-only */}
                {gridEntries.length > 0 && (
                  <details className="rounded-lg group" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                    <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none" style={{ userSelect: 'none' }}>
                      <CalendarDays size={12} style={{ color: '#6B6480' }} />
                      <span className="text-[11px] font-semibold flex-1" style={{ color: '#1A0A3B' }}>
                        Grid semanal L–D ({gridEntries.length})
                      </span>
                      <span className="text-[10px] transition-transform group-open:rotate-180" style={{ color: '#6B6480' }}>▾</span>
                    </summary>
                    <div className="px-3 pb-3 pt-1">
                      <p className="text-[10px] mb-2" style={{ color: '#6B6480' }}>
                        Días donde el empleado marca &ldquo;OK&rdquo; cuando confirma el seguimiento. Se detecta automático de tu plantilla.
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {gridEntries.map(([day, letter]) => (
                          <span key={day} className="text-[10px] px-2 py-1 rounded" style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}>
                            <strong>{GRID_DAY_LABELS[day] ?? day}</strong>: col {letter.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {hasCustom && (state?.suggestions?.length ?? 0) > 0 && (
        <details
          className="rounded-lg mb-3 group"
          style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)' }}
        >
          <summary
            className="flex items-center gap-2 p-3 cursor-pointer list-none"
            style={{ userSelect: 'none' }}
          >
            <Lightbulb size={14} style={{ color: '#B45309', flexShrink: 0 }} />
            <span className="text-xs font-semibold flex-1" style={{ color: '#78350F' }}>
              {state!.suggestions!.length} {state!.suggestions!.length === 1 ? 'sugerencia' : 'sugerencias'} para tu plantilla
            </span>
            <span className="text-[10px] transition-transform group-open:rotate-180" style={{ color: '#B45309' }}>▾</span>
          </summary>
          <div className="px-3 pb-3">
            <p className="text-[11px] mb-2" style={{ color: '#6B6480' }}>
              Recomendaciones para mejorar cómo se ve el reporte. Son opcionales — edita tu archivo en Excel y súbelo de nuevo si quieres aplicarlas.
            </p>
            <div className="flex flex-col gap-2">
            {state!.suggestions!.map((s, idx) => {
              const sevColor = s.severity === 'important' ? '#DC2626'
                            : s.severity === 'warning'   ? '#B45309'
                            : '#6B6480';
              const SevIcon = s.severity === 'important' ? AlertTriangle
                           : s.severity === 'warning'   ? AlertTriangle
                           : Info;
              return (
                <div
                  key={idx}
                  className="rounded p-2"
                  style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
                >
                  <div className="flex items-start gap-2">
                    <SevIcon size={12} style={{ color: sevColor, marginTop: 2, flexShrink: 0 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px]" style={{ color: '#1A0A3B' }}>
                        {s.col && (
                          <>
                            <strong>Col {s.col}</strong>
                            <span className="mx-1.5" style={{ color: '#9B8FB5' }}>·</span>
                          </>
                        )}
                        {s.rationale}
                      </p>
                      {(s.current !== undefined || s.proposed !== undefined) && (s.current !== null || s.proposed !== null) && (
                        <p className="text-[10px] mt-1" style={{ color: '#6B6480' }}>
                          {s.current !== null && s.current !== undefined && (
                            <>Actual: <span style={{ color: '#DC2626' }}>&ldquo;{s.current}&rdquo;</span></>
                          )}
                          {s.current !== null && s.current !== undefined && s.proposed !== null && s.proposed !== undefined && (
                            <span className="mx-1.5">→</span>
                          )}
                          {s.proposed !== null && s.proposed !== undefined && (
                            <>Propuesto: <span style={{ color: '#16a34a' }}>&ldquo;{s.proposed}&rdquo;</span></>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </details>
      )}

      {error && (
        <div
          className="text-[11px] px-2 py-1 rounded mb-2"
          style={{ background: 'rgba(220,38,38,0.08)', color: '#DC2626' }}
        >
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#ffffff', border: 'none', cursor: 'pointer' }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {loading ? 'Analizando plantilla...' : (hasCustom ? 'Reemplazar plantilla' : 'Subir mi plantilla')}
        </button>

        {hasCustom && (
          <button
            type="button"
            onClick={restoreDefault}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'transparent', color: '#6B6480', border: '1px solid #E8E3F5', cursor: 'pointer' }}
          >
            <RotateCcw size={12} />
            Restaurar default
          </button>
        )}

        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded"
          style={{
            background: 'rgba(234,179,8,0.12)',
            border:     '1px solid rgba(234,179,8,0.35)',
            color:      '#78350F',
          }}
        >
          <AlertTriangle size={12} />
          Analizar la plantilla cuesta {uploadCost} tarea{uploadCost === 1 ? '' : 's'} del pool.
        </span>
      </div>
    </div>
  );
}
