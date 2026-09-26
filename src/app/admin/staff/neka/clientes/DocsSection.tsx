'use client';

import { useState, useRef } from 'react';
import { FileText, Upload, Download, Trash2, Loader2, Sparkles } from 'lucide-react';
import type { ClienteDoc, DocTipo } from '@/lib/billing/centinelia-clientes';
import type { CsfExtractedFields } from '@/lib/billing/csf-parser';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';

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
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
        Documentos del cliente
      </label>
      <p className="text-xs mb-3" style={{ color: '#6B6480' }}>
        Sube la CSF y otros documentos. Neka toma los datos fiscales de los campos de arriba, no del PDF; estos archivos son respaldo y auditoría.
      </p>

      {/* Lista de docs existentes */}
      <div className="space-y-2 mb-4">
        {docs.length === 0 && (
          <div className="rounded-lg p-4 text-center text-xs" style={{ background: '#FFFFFF', border: '1px dashed #E8E3F5', color: '#6B6480' }}>
            Aún no hay documentos.
          </div>
        )}
        {docs.map(d => (
          <div key={d.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
            <FileText size={16} style={{ color: '#6C3BFF' }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate" style={{ color: '#1A0A3B' }}>{d.label}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>
                  {TIPO_LABEL[d.tipo]}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: '#6B6480' }}>
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
      <div className="rounded-2xl flex flex-col gap-3" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '16px 18px' }}>
        <div className="grid grid-cols-3 gap-3">
          <OficinaModal.Field label="Tipo">
            <OficinaModal.Select value={tipo} onChange={e => setTipo(e.target.value as DocTipo)}>
              {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </OficinaModal.Select>
          </OficinaModal.Field>
          <div className="col-span-2">
            <OficinaModal.Field label="Nombre del documento">
              <OficinaModal.Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder='Ej. "CSF 2026"'
                maxLength={120}
              />
            </OficinaModal.Field>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <OficinaModal.Field label="Archivo" hint="PDF, JPG, PNG o WEBP · máx. 10 MB">
              <OficinaModal.FileInput
                inputRef={fileInputRef}
                accept="application/pdf,image/jpeg,image/png,image/webp"
                placeholder="Selecciona un archivo…"
              />
            </OficinaModal.Field>
          </div>
          <button
            onClick={upload}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all shrink-0"
            style={{
              padding:    '9px 18px',
              height:     40,
              background: uploading ? '#B9A8E8' : '#6C3BFF',
              color:      '#ffffff',
              boxShadow:  uploading ? 'none' : '0 2px 8px rgba(108,59,255,0.32)',
              cursor:     uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Subir documento
          </button>
        </div>
      </div>

      {error && <div className="mt-3"><OficinaModal.Alert tone="danger">{error}</OficinaModal.Alert></div>}

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
    <OficinaModal
      open
      onClose={onClose}
      size="md"
      eyebrow="Auto-extracción"
      title="Datos detectados en la CSF"
      description="Revisa cada campo antes de aplicar. Los que dejes desmarcados no se tocan."
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={saving}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={apply} loading={saving}>
            <Sparkles size={13} />
            Aplicar al cliente
          </OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <ExtractedRow apply={applyRfc} setApply={setApplyRfc} label="RFC" detected={fields.rfc}>
          <OficinaModal.Input value={rfc} onChange={e => setRfc(e.target.value)} style={{ textTransform: 'uppercase' }} />
        </ExtractedRow>
        <ExtractedRow apply={applyRazon} setApply={setApplyRazon} label="Razón social" detected={fields.razon_social}>
          <OficinaModal.Input value={razonSocial} onChange={e => setRazon(e.target.value)} />
        </ExtractedRow>
        <ExtractedRow apply={applyRegimen} setApply={setApplyRegimen}
          label={`Régimen fiscal${fields.regimen_label ? ` (${fields.regimen_label})` : ''}`}
          detected={fields.regimen_fiscal}
        >
          <OficinaModal.Input value={regimen} onChange={e => setRegimen(e.target.value)} placeholder="601, 612, 626…" />
        </ExtractedRow>
        <ExtractedRow apply={applyCp} setApply={setApplyCp} label="Código postal" detected={fields.cp}>
          <OficinaModal.Input value={cp} onChange={e => setCp(e.target.value)} />
        </ExtractedRow>

        {err && <OficinaModal.Alert tone="danger">{err}</OficinaModal.Alert>}
      </div>
    </OficinaModal>
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
    <div className="rounded-xl" style={{ background: apply ? '#F5F0FF' : '#FAFAFB', border: `1px solid ${apply ? '#E8E3F5' : '#F0EBFA'}`, padding: '12px 14px', transition: 'background 0.15s, border-color 0.15s' }}>
      <label className="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="checkbox" checked={apply} onChange={e => setApply(e.target.checked)} disabled={!detected} style={{ accentColor: '#6C3BFF' }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: detected ? '#6B6480' : '#B9B0CF' }}>
          {label}
          {!detected && <span className="ml-1.5 font-normal normal-case tracking-normal" style={{ color: '#9B8FB5' }}>(no detectado)</span>}
        </span>
      </label>
      <div style={{ opacity: apply ? 1 : 0.5, pointerEvents: apply ? 'auto' : 'none' }}>{children}</div>
    </div>
  );
}
