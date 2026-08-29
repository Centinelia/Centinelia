'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, RotateCcw, Loader2, CheckCircle2, User, Bot, Lightbulb, AlertTriangle, Info } from 'lucide-react';

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
    columns?:            Record<string, string>;
    human_only_columns?: string[];
    notes?:              string;
  };
  suggestions?: TemplateSuggestion[];
}

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
          {state?.mapping?.columns && Object.keys(state.mapping.columns).length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B6480' }}>
                Reglas de escritura por columna
              </p>
              <p className="text-[11px] mb-3" style={{ color: '#6B6480' }}>
                Marca las columnas donde <strong>solo tú escribes manualmente</strong> (vendedor asignado, notas internas, etc). Tu empleado nunca las tocará, aunque las mostrará en el reporte.
              </p>
              <div className="flex flex-col gap-1.5">
                {Object.entries(state.mapping.columns).map(([col, field]) => {
                  const isHumanOnly = humanOnlySet.has(col.toUpperCase());
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => toggleHumanOnly(col, isHumanOnly)}
                      disabled={savingTogglesId}
                      className="flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors disabled:opacity-50"
                      style={{
                        background: '#ffffff',
                        border:     '1px solid #E8E3F5',
                        cursor:     savingTogglesId ? 'wait' : 'pointer',
                      }}
                    >
                      <span style={{ color: '#1A0A3B' }}>
                        <strong>Col {col}</strong>
                        <span className="mx-1.5" style={{ color: '#9B8FB5' }}>·</span>
                        {FIELD_LABELS[field] ?? field}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                        style={
                          isHumanOnly
                            ? { background: 'rgba(217,119,6,0.1)', color: '#B45309' }
                            : { background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }
                        }
                      >
                        {isHumanOnly ? <><User size={9} /> Solo yo escribo</> : <><Bot size={9} /> Empleado escribe</>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {state?.mapping?.notes && (
            <p className="text-[11px] mt-3 italic" style={{ color: '#6B6480' }}>
              Nota: {state.mapping.notes}
            </p>
          )}
        </div>
      )}

      {hasCustom && (state?.suggestions?.length ?? 0) > 0 && (
        <div
          className="rounded-lg p-3 mb-3"
          style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)' }}
        >
          <div className="flex items-start gap-2 mb-2">
            <Lightbulb size={14} style={{ color: '#B45309', marginTop: 2 }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: '#78350F' }}>
                Sugerencias para tu plantilla
              </p>
              <p className="text-[11px]" style={{ color: '#6B6480' }}>
                Recomendaciones para mejorar cómo se ve el reporte. Son opcionales — edita tu archivo en Excel y súbelo de nuevo si quieres aplicarlas.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-2">
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

        <span className="text-[11px]" style={{ color: '#6B6480' }}>
          Analizar la plantilla cuesta {uploadCost} tarea{uploadCost === 1 ? '' : 's'} del pool.
        </span>
      </div>
    </div>
  );
}
