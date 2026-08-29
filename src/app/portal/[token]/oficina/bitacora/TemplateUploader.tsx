'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';

interface CurrentTemplate {
  filename?:    string;
  uploaded_at?: string;
  mapping?: {
    sheet_name?: string;
    columns?:    Record<string, string>;
    notes?:      string;
  };
}

interface Props {
  token:         string;
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

export function TemplateUploader({ token, current, uploadCost }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state,   setState]   = useState<CurrentTemplate | null>(current);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-upload`, {
        method: 'POST',
        body:   form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al analizar');
      setState({
        filename:    file.name,
        uploaded_at: new Date().toISOString(),
        mapping:     body.mapping,
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
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/template-upload`, {
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

  const hasCustom = !!state?.mapping;

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
        Si tienes tu propio formato de bitácora en Excel, súbelo aquí y Nelia lo llenará usando ese diseño (con tus colores, columnas y logo). Si no subes nada, se usa el formato por defecto de Centinelia.
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
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6480' }}>
                Columnas detectadas
              </p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(state.mapping.columns).map(([col, field]) => (
                  <span
                    key={col}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
                  >
                    <strong>{col}</strong> → {FIELD_LABELS[field] ?? field}
                  </span>
                ))}
              </div>
            </div>
          )}
          {state?.mapping?.notes && (
            <p className="text-[11px] mt-2 italic" style={{ color: '#6B6480' }}>
              Nota: {state.mapping.notes}
            </p>
          )}
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
