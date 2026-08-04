'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Upload, Trash2, FileText } from 'lucide-react';

type TipoDocumento = 'propuesta' | 'cotizacion' | 'one_pager' | 'correo';

interface Props {
  agentId:        string;
  availableTipos: TipoDocumento[];
}

interface TemplateRow {
  tipo:        string;
  filename:    string;
  uploaded_at: string;
}

const TIPO_LABEL: Record<TipoDocumento, string> = {
  propuesta:  'Propuesta comercial',
  cotizacion: 'Cotizacion',
  one_pager:  'One-pager',
  correo:     'Correo estructurado',
};

export function BrandTemplateSection({ agentId, availableTipos }: Props) {
  const { token }                     = useParams<{ token: string }>();
  const [templates, setTemplates]     = useState<TemplateRow[]>([]);
  const [busy, setBusy]               = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  async function fetchAll() {
    const res = await fetch(`/api/portal/${token}/document-templates?agent_id=${agentId}`);
    if (res.ok) {
      const j = await res.json() as { templates: TemplateRow[] };
      setTemplates(j.templates ?? []);
    }
  }

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, agentId]);

  async function upload(tipo: string, file: File) {
    setBusy(tipo);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(
      `/api/portal/${token}/document-templates?agent_id=${agentId}&tipo=${tipo}`,
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
      `/api/portal/${token}/document-templates?agent_id=${agentId}&tipo=${tipo}`,
      { method: 'DELETE' }
    );
    await fetchAll();
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
        Sube una plantilla .docx para cada tipo de documento. Cuando tu empleado genere uno, usara tu formato en lugar del diseno por defecto. Tamano maximo: 5 MB. Usa marcadores como {'{title}'}, {'{sections}'} y {'{closing}'} dentro del documento.
      </p>

      {availableTipos.map(tipo => {
        const existing = templates.find(t => t.tipo === tipo);
        const isLoading = busy === tipo;
        return (
          <div
            key={tipo}
            className="flex items-center justify-between gap-4 p-3 rounded-lg"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border-2)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--c-text-3)' }} />
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                  {TIPO_LABEL[tipo]}
                </p>
                {existing ? (
                  <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>
                    {existing.filename}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
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
                  className="p-1.5 rounded transition-opacity hover:opacity-70 disabled:opacity-50"
                  title="Quitar plantilla"
                >
                  <Trash2 className="w-4 h-4" style={{ color: '#ef4444' }} />
                </button>
              )}

              <label
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  background: '#6C3BFF',
                  color:      '#fff',
                  opacity:    isLoading ? 0.5 : 1,
                  pointerEvents: isLoading ? 'none' : undefined,
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                {isLoading ? 'Subiendo...' : existing ? 'Reemplazar' : 'Subir .docx'}
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

      {error && (
        <p className="text-xs mt-1" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}
    </div>
  );
}
