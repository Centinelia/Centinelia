'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Upload, Trash2, FileText } from 'lucide-react';

type TipoDocumento = 'propuesta' | 'cotizacion' | 'one_pager' | 'correo';

// Templates son org-level desde 2026-08-19: se comparten entre todos los
// empleados del negocio. Se filtran por availableTipos según el rol del
// meerkat que abre la página (noah = propuesta/cotización/one_pager, nelia =
// one_pager), pero al subir/borrar afecta a toda la org.
interface Props {
  availableTipos: TipoDocumento[];
}

interface TemplateRow {
  tipo:        string;
  filename:    string;
  uploaded_at: string;
}

const TIPO_LABEL: Record<TipoDocumento, string> = {
  propuesta:  'Propuesta comercial',
  cotizacion: 'Cotización',
  one_pager:  'One-pager',
  correo:     'Correo estructurado',
};

export function BrandTemplateSection({ availableTipos }: Props) {
  const { token }                     = useParams<{ token: string }>();
  const [templates, setTemplates]     = useState<TemplateRow[]>([]);
  const [busy, setBusy]               = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  async function fetchAll() {
    const res = await fetch(`/api/portal/${token}/document-templates`);
    if (res.ok) {
      const j = await res.json() as { templates: TemplateRow[] };
      setTemplates(j.templates ?? []);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function upload(tipo: string, file: File) {
    setBusy(tipo);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `/api/portal/${token}/document-templates?tipo=${tipo}`,
      { method: 'POST', body: form }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      setError(j.error ?? 'No se pudo subir el archivo.');
    } else {
      await fetchAll();
    }
    setBusy(null);
  }

  async function remove(tipo: string) {
    setBusy(tipo);
    setError(null);
    await fetch(
      `/api/portal/${token}/document-templates?tipo=${tipo}`,
      { method: 'DELETE' }
    );
    await fetchAll();
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12px] leading-relaxed" style={{ color: '#6B6480' }}>
        Sube una plantilla .docx para cada tipo de documento. Estas plantillas son de tu negocio: se comparten entre todos los empleados que las necesiten. Cuando alguno genere un documento, usará tu formato en lugar del diseño por defecto. Tamaño máximo: 5 MB. Usa marcadores como {'{title}'}, {'{sections}'} y {'{closing}'} dentro del documento.
      </p>

      <div className="flex flex-col rounded-xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
        {availableTipos.map((tipo, idx) => {
          const existing = templates.find(t => t.tipo === tipo);
          const isLoading = busy === tipo;
          const hasFile = !!existing;
          return (
            <div
              key={tipo}
              className="flex items-center justify-between gap-4 px-4 py-3"
              style={{ borderTop: idx === 0 ? 'none' : '1px solid #F0EDF9' }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: hasFile ? 'rgba(108,59,255,0.08)' : '#FAFAFB',
                    border: `1px solid ${hasFile ? 'rgba(108,59,255,0.18)' : '#E8E3F5'}`,
                  }}
                >
                  <FileText className="w-4 h-4" style={{ color: hasFile ? '#6C3BFF' : '#9B8FB5' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                    {TIPO_LABEL[tipo]}
                  </p>
                  {existing ? (
                    <p className="text-[11px] truncate" style={{ color: '#6B6480' }}>
                      {existing.filename}
                    </p>
                  ) : (
                    <p className="text-[11px]" style={{ color: '#9B8FB5' }}>
                      Usando formato por defecto
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {existing && (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void remove(tipo)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-50"
                    title="Quitar plantilla"
                  >
                    <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                  </button>
                )}

                <label
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold cursor-pointer transition-opacity hover:opacity-90"
                  style={{
                    background: existing ? '#FAFAFB' : '#6C3BFF',
                    color:      existing ? '#6B6480' : '#fff',
                    border:     existing ? '1px solid #E8E3F5' : 'none',
                    boxShadow:  existing ? 'none' : '0 1px 2px rgba(108,59,255,0.24)',
                    opacity:    isLoading ? 0.5 : 1,
                    pointerEvents: isLoading ? 'none' : undefined,
                  }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isLoading ? 'Subiendo' : existing ? 'Reemplazar' : 'Subir .docx'}
                  <input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    disabled={isLoading}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) void upload(tipo, f);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-[12px] rounded-lg px-3 py-2"
          style={{ color: '#dc2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
