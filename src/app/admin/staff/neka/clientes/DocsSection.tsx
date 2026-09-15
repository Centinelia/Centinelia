'use client';

import { useState, useRef } from 'react';
import { FileText, Upload, Download, Trash2, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import type { ClienteDoc, DocTipo } from '@/lib/billing/centinelia-clientes';
import type { CsfExtractedFields } from '@/lib/billing/csf-parser';

const TIPO_LABEL: Record<DocTipo, string> = {
  csf:              'CSF',
  contrato:         'Contrato',
  comprobante_pago: 'Comprobante pago',
  poder_notarial:   'Poder notarial',
  otro:             'Otro',
};

const TIPO_OPTIONS: Array<{ value: DocTipo; label: string }> = [
  { value: 'csf',              label: 'Constancia de Situación Fiscal' },
  { value: 'contrato',         label: 'Contrato firmado' },
  { value: 'comprobante_pago', label: 'Comprobante de pago (SPEI, etc.)' },
  { value: 'poder_notarial',   label: 'Poder notarial' },
  { value: 'otro',             label: 'Otro' },
];

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export interface DocsSectionProps {
  clienteId:            string;
  initialDocs:          ClienteDoc[];
  onChange?:            (docs: ClienteDoc[]) => void;
  onClienteUpdated?:    () => void;
}

export function DocsSection({ clienteId, initialDocs, onChange, onClienteUpdated }: DocsSectionProps) {
  const [docs, setDocs]       = useState<ClienteDoc[]>(initialDocs);
  const [tipo, setTipo]       = useState<DocTipo>('csf');
  const [label, setLabel]     = useState('');
  const [uploading, setUp]    = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [parsing, setParsing] = useState<string | null>(null); // doc.id en proceso
  const [extracted, setExtracted] = useState<{ doc: ClienteDoc; fields: CsfExtractedFields } | null>(null);
  const fileInputRef          = useRef<HTMLInputElement>(null);

  const setAll = (next: ClienteDoc[]) => { setDocs(next); onChange?.(next); };

  const upload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { setError('Selecciona un archivo'); return; }
    if (!label.trim()) { setError('Ponle un nombre al documento'); return; }

    setError(null); setUp(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('tipo', tipo);
      form.append('label', label.trim());

      const res = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/docs`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return; }

      setAll([...docs, data.doc]);
      setLabel('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUp(false);
    }
  };

  const download = async (doc: ClienteDoc) => {
    try {
      const res = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/docs/${doc.id}/url`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo generar enlace'); return; }
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const parseCsf = async (doc: ClienteDoc) => {
    setError(null); setParsing(doc.id);
    try {
      const res = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/docs/${doc.id}/parse-csf`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo extraer'); return; }
      setExtracted({ doc, fields: data.extracted });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(null);
    }
  };

  const remove = async (doc: ClienteDoc) => {
    if (!confirm(`¿Borrar "${doc.label}"? El archivo se elimina del servidor.`)) return;
    try {
      const res = await fetch(`/api/admin/staff/neka/clientes/${clienteId}/docs/${doc.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo borrar'); return; }
      setAll(docs.filter(d => d.id !== doc.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="mt-6">
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
        Documentos del cliente
      </label>
      <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
        Sube la CSF y otros documentos. Neka toma los datos fiscales de los campos de arriba, no del PDF; estos archivos son respaldo y auditoría.
      </p>

      {/* Lista de docs existentes */}
      <div className="space-y-2 mb-4">
        {docs.length === 0 && (
          <div className="rounded-lg p-4 text-center text-xs" style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}>
            Aún no hay documentos.
          </div>
        )}
        {docs.map(d => (
          <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <FileText size={16} style={{ color: '#6C3BFF' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>{d.label}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
                  {TIPO_LABEL[d.tipo]}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--c-text-3)' }}>
                {humanBytes(d.size_bytes)} · subido {new Date(d.uploaded_at).toLocaleDateString('es-MX')}
                {d.uploaded_by && ` · ${d.uploaded_by}`}
              </p>
            </div>
            {d.tipo === 'csf' && d.mime_type === 'application/pdf' && (
              <button
                onClick={() => parseCsf(d)}
                disabled={parsing === d.id}
                className="p-2 rounded-lg hover:opacity-70 disabled:opacity-50"
                style={{ background: 'rgba(161,98,7,0.08)', color: '#a16207' }}
                title="Extraer datos fiscales"
              >
                {parsing === d.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              </button>
            )}
            <button
              onClick={() => download(d)}
              className="p-2 rounded-lg hover:opacity-70"
              style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }}
              title="Descargar"
            >
              <Download size={13} />
            </button>
            <button
              onClick={() => remove(d)}
              className="p-2 rounded-lg hover:opacity-70"
              style={{ background: 'rgba(239,68,68,0.05)', color: '#b91c1c' }}
              title="Borrar"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Uploader */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="grid grid-cols-3 gap-2">
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value as DocTipo)}
            className="px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          >
            {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder='Ej. "CSF 2026"'
            maxLength={120}
            className="col-span-2 px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="flex-1 text-xs"
            style={{ color: 'var(--c-text-2)' }}
          />
          <button
            onClick={upload}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#6C3BFF' }}
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Subir
          </button>
        </div>
        <p className="text-[10px]" style={{ color: 'var(--c-text-4)' }}>
          PDF, JPG, PNG o WEBP. Máximo 10 MB.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-2 text-xs flex items-start gap-2 mt-2"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {extracted && (
        <ExtractedFieldsModal
          fields={extracted.fields}
          clienteId={clienteId}
          onClose={() => setExtracted(null)}
          onApplied={() => { setExtracted(null); onClienteUpdated?.(); }}
        />
      )}
    </div>
  );
}

interface ExtractedModalProps {
  fields:     CsfExtractedFields;
  clienteId:  string;
  onClose:    () => void;
  onApplied:  () => void;
}

function ExtractedFieldsModal({ fields, clienteId, onClose, onApplied }: ExtractedModalProps) {
  const [rfc,          setRfc]        = useState(fields.rfc          ?? '');
  const [razonSocial,  setRazon]      = useState(fields.razon_social ?? '');
  const [regimen,      setRegimen]    = useState(fields.regimen_fiscal ?? '');
  const [cp,           setCp]         = useState(fields.cp           ?? '');
  const [applyRfc,     setApplyRfc]     = useState(!!fields.rfc);
  const [applyRazon,   setApplyRazon]   = useState(!!fields.razon_social);
  const [applyRegimen, setApplyRegimen] = useState(!!fields.regimen_fiscal);
  const [applyCp,      setApplyCp]      = useState(!!fields.cp);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apply = async () => {
    setErr(null); setSaving(true);
    try {
      const patch: Record<string, string> = {};
      if (applyRfc          && rfc)          patch.rfc              = rfc.trim().toUpperCase();
      if (applyRazon        && razonSocial)  patch.razon_social     = razonSocial.trim();
      if (applyRegimen      && regimen)      patch.regimen_fiscal   = regimen.trim();
      if (applyCp           && cp)           patch.cp               = cp.trim();

      if (Object.keys(patch).length === 0) { setErr('Nada que aplicar'); setSaving(false); return; }

      const res = await fetch(`/api/admin/staff/neka/clientes/${clienteId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      onApplied();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="rounded-2xl p-5 max-w-md w-full max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--c-text)' }}>
          <Sparkles size={16} style={{ color: '#a16207' }} />
          Datos detectados en la CSF
        </h3>
        <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
          Revisa antes de aplicar. Los campos que dejes desmarcados no se tocan.
        </p>

        <div className="space-y-3">
          <ExtractedRow apply={applyRfc} setApply={setApplyRfc} label="RFC" detected={fields.rfc}>
            <input value={rfc} onChange={e => setRfc(e.target.value)} className="w-full px-2 py-1 rounded text-sm outline-none uppercase"
                   style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </ExtractedRow>
          <ExtractedRow apply={applyRazon} setApply={setApplyRazon} label="Razón social" detected={fields.razon_social}>
            <input value={razonSocial} onChange={e => setRazon(e.target.value)} className="w-full px-2 py-1 rounded text-sm outline-none"
                   style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </ExtractedRow>
          <ExtractedRow apply={applyRegimen} setApply={setApplyRegimen}
            label={`Régimen fiscal${fields.regimen_label ? ` (${fields.regimen_label})` : ''}`}
            detected={fields.regimen_fiscal}
          >
            <input value={regimen} onChange={e => setRegimen(e.target.value)} className="w-full px-2 py-1 rounded text-sm outline-none"
                   placeholder="601, 612, 626..."
                   style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </ExtractedRow>
          <ExtractedRow apply={applyCp} setApply={setApplyCp} label="Código postal" detected={fields.cp}>
            <input value={cp} onChange={e => setCp(e.target.value)} className="w-full px-2 py-1 rounded text-sm outline-none"
                   style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }} />
          </ExtractedRow>
        </div>

        {err && (
          <div className="rounded-lg p-2 text-xs flex items-start gap-2 mt-3"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--c-text-2)' }}>Cancelar</button>
          <button onClick={apply} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#a16207' }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Aplicar al cliente
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtractedRow({
  apply, setApply, label, detected, children,
}: {
  apply:    boolean;
  setApply: (b: boolean) => void;
  label:    string;
  detected: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-2 mb-1 cursor-pointer">
        <input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} disabled={!detected} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: detected ? 'var(--c-text-2)' : 'var(--c-text-4)' }}>
          {label} {!detected && '(no detectado)'}
        </span>
      </label>
      <div style={{ opacity: apply ? 1 : 0.5 }}>{children}</div>
    </div>
  );
}
