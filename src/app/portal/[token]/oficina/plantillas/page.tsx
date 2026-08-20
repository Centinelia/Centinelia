'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, ShoppingCart, Upload, Trash2, Save, CheckCircle,
  FileCheck, ChevronDown, ChevronRight, MessageSquare, Wand2,
  Plus, Check, Edit2, GripVertical, ToggleLeft, ToggleRight, X,
  Copy, AlertTriangle, ExternalLink, LayoutTemplate,
} from 'lucide-react';
import { TEMPLATE_SPECS } from '@/lib/documents/template-spec';
import OficinaPageHero from '../OficinaPageHero';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateValidation {
  all_placeholders:      string[];
  required_placeholders: string[];
  found_placeholders:    string[];
  missing_required:      string[];
  missing_loop_fields:   string[];
}

interface FacturaConfig {
  rfc?:                 string;
  direccion?:           string;
  condiciones_pago?:    string;
  folio_prefix?:        string;
  incluir_iva?:         boolean;
  template_path?:       string;
  template_name?:       string;
  template_validation?: TemplateValidation | null;
}

interface OrdenConfig {
  condiciones_pago?:    string;
  terminos_entrega?:    string;
  folio_prefix?:        string;
  incluir_iva?:         boolean;
  template_path?:       string;
  template_name?:       string;
  template_validation?: TemplateValidation | null;
}

interface CotizacionConfig {
  folio_prefix?:        string;
  vigencia_dias?:       string;
  condiciones_pago?:    string;
  incluir_iva?:         boolean;
  template_path?:       string;
  template_name?:       string;
  template_validation?: TemplateValidation | null;
}

interface NotaVentaConfig {
  folio_prefix?:        string;
  forma_pago?:          string;
  incluir_iva?:         boolean;
  legal_notice?:        string;
  template_path?:       string;
  template_name?:       string;
  template_validation?: TemplateValidation | null;
}

interface TemplateStats {
  count: number;
  lastUsed: string | null;
}

interface Clause {
  id: string; title: string; body: string; required: boolean; enabled: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 7)  return `hace ${d} días`;
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

const VARIABLES_HINT = [
  '{nombre_cliente}', '{rfc_cliente}', '{descripcion_servicios}',
  '{vigencia}', '{monto}', '{forma_de_pago}', '{ciudad}', '{fecha}',
  '{nombre_prestador}',
];

function isConfigured(cfg: FacturaConfig | OrdenConfig): boolean {
  return !!((cfg as FacturaConfig).rfc || (cfg as FacturaConfig).direccion || cfg.condiciones_pago || cfg.folio_prefix);
}

// ─── Field ────────────────────────────────────────────────────────────────────

function Field({ label, hint, value, onChange, as: As = 'input', placeholder }: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void; as?: 'input' | 'textarea'; placeholder?: string;
}) {
  const s = { background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' } as React.CSSProperties;
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: '#1A0A3B' }}>{label}</label>
      {hint && <p className="text-xs mb-1.5" style={{ color: '#9B8FB5' }}>{hint}</p>}
      {As === 'textarea'
        ? <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg px-3 py-2 text-sm resize-none" style={s} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-lg px-3 py-2 text-sm" style={s} />
      }
    </div>
  );
}

const CONDICIONES_PRESET = [
  'Pago en una sola exhibición',
  'Crédito 15 días',
  'Crédito 30 días',
  'Crédito 60 días',
  'Pago en parcialidades',
];

function CondicionesPagoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = CONDICIONES_PRESET.includes(value);
  const [showOtro, setShowOtro] = useState(!isPreset && value !== '');

  function selectPreset(opt: string) { onChange(opt); setShowOtro(false); }
  function activateOtro() { if (!showOtro) { if (isPreset) onChange(''); setShowOtro(true); } }

  return (
    <div>
      <label className="block text-xs font-semibold mb-2" style={{ color: '#1A0A3B' }}>Condiciones de pago</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CONDICIONES_PRESET.map(opt => (
          <button key={opt} type="button" onClick={() => selectPreset(opt)}
            className="text-xs px-2.5 py-1 rounded-full transition-all"
            style={value === opt && !showOtro
              ? { background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.3)', fontWeight: 600 }
              : { background: 'transparent', color: '#6B6480', border: '1px solid #E8E3F5' }
            }
          >{opt}</button>
        ))}
        <button type="button" onClick={activateOtro}
          className="text-xs px-2.5 py-1 rounded-full transition-all"
          style={showOtro
            ? { background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.3)', fontWeight: 600 }
            : { background: 'transparent', color: '#6B6480', border: '1px solid #E8E3F5' }
          }
        >Otro</button>
      </div>
      {showOtro && (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder="Ej. Anticipo 50%, saldo a 30 días"
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
        />
      )}
    </div>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className="relative inline-flex w-9 h-5 rounded-full transition-colors shrink-0"
        style={{ background: checked ? '#6C3BFF' : '#E8E3F5' }}>
        <span className="inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform"
          style={{ margin: 3, transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </button>
      <div>
        <p className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{label}</p>
        {hint && <p className="text-xs" style={{ color: '#9B8FB5' }}>{hint}</p>}
      </div>
    </div>
  );
}

// ─── Placeholder guide ────────────────────────────────────────────────────────

function PlaceholderChip({ text, color }: { text: string; color: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }
  return (
    <button onClick={copy} title="Copiar"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono transition-colors"
      style={{ background: copied ? `${color}22` : '#FAFAFB', color: copied ? color : '#1A0A3B', border: `1px solid ${copied ? color + '55' : '#E8E3F5'}` }}>
      {text}
      {copied ? <Check size={10} /> : <Copy size={10} style={{ opacity: 0.6 }} />}
    </button>
  );
}

function PlaceholderGuide({ docType, color }: { docType: 'factura' | 'orden' | 'cotizacion' | 'nota_venta'; color: string }) {
  const [open, setOpen] = useState(false);
  const spec = TEMPLATE_SPECS[docType];
  if (!spec) return null;

  const simple = spec.placeholders.filter(p => !p.isLoop);
  const loops  = spec.placeholders.filter(p => p.isLoop);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
          <FileText size={12} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Marcadores soportados</p>
          <p className="text-xs" style={{ color: '#9B8FB5' }}>Copia y pega estos en tu documento Word donde quieras que aparezcan los datos.</p>
        </div>
        <ChevronDown size={14} style={{ color: '#9B8FB5', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-4" style={{ borderTop: '1px solid #E8E3F5' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>Campos simples</p>
            <div className="flex flex-wrap gap-1.5">
              {simple.map(p => (
                <PlaceholderChip key={p.key} text={`{{${p.key}}}`} color={color} />
              ))}
            </div>
          </div>
          {loops.map(loop => (
            <div key={loop.key}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                Tabla de partidas (bloque repetible)
              </p>
              <p className="text-xs mb-2 leading-relaxed" style={{ color: '#6B6480' }}>
                Envuelve la fila de tu tabla con <span className="font-mono" style={{ color }}>{'{{#'+loop.key+'}}'}</span> al inicio y <span className="font-mono" style={{ color }}>{'{{/'+loop.key+'}}'}</span> al final. Dentro puedes usar:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(loop.loopFields ?? []).map(sub => (
                  <PlaceholderChip key={sub.key} text={`{{${sub.key}}}`} color={color} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateValidationBadge({ validation, color }: { validation: TemplateValidation; color: string }) {
  const ok = validation.missing_required.length === 0 && validation.missing_loop_fields.length === 0;
  if (ok) {
    return (
      <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
        style={{ background: `${color}08`, color, border: `1px solid ${color}25` }}>
        <CheckCircle size={12} />
        Detecté todos los marcadores requeridos ({validation.found_placeholders.length}).
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg"
      style={{ background: 'rgba(245,158,11,0.06)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}>
      <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1">
        <p className="font-semibold">Faltan marcadores en tu plantilla:</p>
        <p className="mt-1 font-mono">
          {validation.missing_required.map(k => `{{${k}}}`).join(', ')}
          {validation.missing_loop_fields.length > 0 && (
            <>
              {validation.missing_required.length > 0 ? ', ' : ''}
              {validation.missing_loop_fields.map(k => `{{${k.split('.')[1]}}} (dentro del loop)`).join(', ')}
            </>
          )}
        </p>
        <p className="mt-1.5" style={{ color: '#6B6480' }}>Agrégalos en Word y vuelve a subir para que los documentos generen bien.</p>
      </div>
    </div>
  );
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

interface IdentifiedField { key: string; value: string; method: string; applied: boolean }
interface AutoTemplatizeResponse {
  ok:              boolean;
  name:            string;
  path?:           string;
  validation?:     TemplateValidation | null;
  extracted?:      Record<string, unknown>;
  auto_templatized?: boolean;
  preview_pdf_url?: string | null;
  identified_fields?: IdentifiedField[] | null;
  auto_templatize_error?: string | null;
}

function UploadZone({ token, docType, templateName, templatePath, validation, onUploaded, onDeleted, onExtracted, color }: {
  token: string; docType: 'factura' | 'orden' | 'contrato' | 'cotizacion' | 'nota_venta'; templateName?: string;
  templatePath?: string;
  validation?: TemplateValidation | null;
  onUploaded: (data: { name: string; path?: string; validation?: TemplateValidation | null }) => void;
  onDeleted: () => void;
  onExtracted?: (data: Record<string, unknown>) => void;
  color: string;
}) {
  const inputRef                  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [drag, setDrag]           = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<AutoTemplatizeResponse | null>(null);

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('doc_type', docType);
      const res  = await fetch(`/api/portal/${token}/template-upload`, { method: 'POST', body: fd });
      const data: AutoTemplatizeResponse & { error?: string } = await res.json();
      if (!data.ok) {
        setUploadError(data.error ?? 'No se pudo subir el archivo');
        return;
      }
      // Si hubo auto-templatize exitoso con preview, mostrar modal para confirmación.
      // Si no (contrato, o auto-templatize falló), aplicar directo (comportamiento viejo).
      if (data.auto_templatized && data.preview_pdf_url) {
        setPreviewData(data);
      } else {
        onUploaded({ name: data.name, path: data.path, validation: data.validation ?? null });
        if (data.extracted && Object.keys(data.extracted).length > 0) {
          onExtracted?.(data.extracted);
        }
      }
    } catch {
      setUploadError('Error de conexión. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  }

  function confirmPreview() {
    if (!previewData) return;
    onUploaded({ name: previewData.name, path: previewData.path, validation: previewData.validation ?? null });
    if (previewData.extracted && Object.keys(previewData.extracted).length > 0) {
      onExtracted?.(previewData.extracted);
    }
    setPreviewData(null);
  }

  async function rejectPreview() {
    if (!previewData) return;
    // Delete the templatized version so user can start over
    await fetch(`/api/portal/${token}/template-upload`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_type: docType }),
    });
    setPreviewData(null);
    setUploadError('Descartada. Sube otro archivo o edita el mismo en Word y súbelo de nuevo.');
    setTimeout(() => setUploadError(null), 6000);
  }

  async function openTemplate() {
    if (!templatePath) return;
    try {
      const res  = await fetch(`/api/portal/${token}/template-download?path=${encodeURIComponent(templatePath)}`);
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch { /* ignore */ }
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar la plantilla de referencia?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/portal/${token}/template-upload`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType }),
      });
      onDeleted();
    } finally { setDeleting(false); }
  }

  if (templateName) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: `${color}08`, border: `1px solid ${color}25` }}>
          <FileCheck size={15} style={{ color, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#1A0A3B' }}>{templateName}</p>
            <p className="text-xs" style={{ color: '#9B8FB5' }}>Plantilla Word cargada</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {templatePath && (
              <button onClick={openTemplate}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}
                title="Descargar y ver tu plantilla">
                <ExternalLink size={11} /> Ver
              </button>
            )}
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
              <Trash2 size={11} /> {deleting ? 'Eliminando...' : 'Quitar'}
            </button>
          </div>
        </div>
        {validation && (docType === 'factura' || docType === 'orden' || docType === 'cotizacion' || docType === 'nota_venta') && (
          <TemplateValidationBadge validation={validation} color={color} />
        )}
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => { if (uploading) return; e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { if (uploading) return; e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl py-7 transition-all ${uploading ? 'cursor-wait' : 'cursor-pointer'}`}
        style={{ border: `2px dashed ${drag ? color : '#E8E3F5'}`, background: drag ? `${color}06` : uploading ? `${color}04` : 'transparent' }}
      >
        <input ref={inputRef} type="file" accept=".docx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        {uploading ? (
          <>
            <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${color}44`, borderTopColor: color }} />
            <p className="text-sm font-semibold" style={{ color }}>Analizando tu plantilla...</p>
            <p className="text-xs text-center max-w-sm" style={{ color: '#6B6480' }}>
              Identificando qué partes deben llenarse automáticamente (proveedor, monto, folio, fecha…). Tarda ~30 segundos.
            </p>
          </>
        ) : (
          <>
            <Upload size={18} style={{ color: drag ? color : '#9B8FB5', opacity: drag ? 1 : 0.5 }} />
            <p className="text-sm font-medium" style={{ color: '#6B6480' }}>
              Arrastra tu plantilla Word aquí o haz clic para seleccionarla
            </p>
            <p className="text-xs" style={{ color: '#9B8FB5' }}>
              Solo .docx · Máx 10 MB · Detectamos automáticamente los marcadores
            </p>
          </>
        )}
      </div>
      {uploadError && (
        <p className="text-xs px-1 mt-1" style={{ color: '#f87171' }}>{uploadError}</p>
      )}

      {previewData && (
        <AutoTemplatizePreviewModal
          data={previewData}
          color={color}
          docType={docType}
          onConfirm={confirmPreview}
          onReject={rejectPreview}
        />
      )}
    </>
  );
}

// ─── Auto-templatize preview modal ────────────────────────────────────────────

function AutoTemplatizePreviewModal({ data, color, docType, onConfirm, onReject }: {
  data: AutoTemplatizeResponse;
  color: string;
  docType: string;
  onConfirm: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onReject(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onReject]);

  const appliedFields   = (data.identified_fields ?? []).filter(f => f.applied);
  const notAppliedFields = (data.identified_fields ?? []).filter(f => !f.applied);
  const docTypeLabel = docType === 'factura' ? 'Factura' :
                       docType === 'orden'   ? 'Orden de compra' :
                       docType === 'cotizacion' ? 'Cotización' :
                       docType === 'nota_venta' ? 'Nota de venta' : docType;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onReject}>
      <div className="flex items-center justify-between px-4 py-3 sm:px-6" style={{ background: '#ffffff', borderBottom: '1px solid #E8E3F5' }}>
        <div className="flex-1 min-w-0 mr-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color }}>Previa · {docTypeLabel}</p>
          <p className="text-sm font-semibold truncate" style={{ color: '#1A0A3B' }}>
            Detectamos {appliedFields.length} campo{appliedFields.length !== 1 ? 's' : ''} en tu plantilla
          </p>
          <p className="text-xs" style={{ color: '#9B8FB5' }}>
            ¿Se ve como esperabas? Confirma para guardar. Si algo salió mal, descarta y vuelve a subirla.
          </p>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onReject(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
          <X size={12} /> Descartar
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 min-h-0" style={{ background: '#525659' }}>
          {data.preview_pdf_url ? (
            <iframe src={data.preview_pdf_url} title="Preview" className="w-full h-full" style={{ border: 'none', minHeight: '60vh' }} />
          ) : (
            <div className="flex items-center justify-center h-full text-white text-sm">Sin preview disponible</div>
          )}
        </div>

        <div className="w-full lg:w-72 flex-shrink-0 overflow-y-auto p-4 flex flex-col gap-3" style={{ background: '#ffffff', borderLeft: '1px solid #E8E3F5' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
              Campos detectados ({appliedFields.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {appliedFields.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-mono"
                  style={{ background: `${color}12`, color, border: `1px solid ${color}30` }} title={`Valor original: ${f.value}`}>
                  <Check size={9} /> {f.key}
                </span>
              ))}
            </div>
          </div>

          {notAppliedFields.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>
                No pudimos reemplazar ({notAppliedFields.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {notAppliedFields.map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(245,158,11,0.08)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}
                    title={`Valor: ${f.value}`}>
                    {f.key}
                  </span>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: '#9B8FB5' }}>
                Estos campos los identificamos pero no pudimos reemplazarlos. Comúnmente son valores muy fragmentados en el docx.
              </p>
            </div>
          )}

          <div className="mt-auto pt-3 flex flex-col gap-2" style={{ borderTop: '1px solid #E8E3F5' }}>
            <button onClick={onConfirm}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: color, color: '#fff' }}>
              <Check size={13} /> Confirmar y guardar
            </button>
            <button onClick={onReject}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5' }}>
              <X size={11} /> Descartar y volver a subir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateRow({
  icon: Icon, title, subtitle, color, stats, configured, children, token, isLast,
}: {
  id: string; icon: React.ElementType; title: string; subtitle: string;
  color: string; stats: TemplateStats; configured: boolean;
  children: React.ReactNode; token: string; isLast: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid #F0EDF9' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[#FAFAFB]">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{title}</p>
            {configured
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>Lista</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F0EDF9', color: '#9B8FB5' }}>Sin configurar</span>
            }
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-[11px]" style={{ color: '#9B8FB5' }}>{subtitle}</p>
            {stats.count > 0 && (
              <>
                <span style={{ color: '#E8E3F5' }}>·</span>
                <span className="text-[11px] font-medium" style={{ color: '#6B6480' }}>
                  {stats.count} documento{stats.count !== 1 ? 's' : ''} generado{stats.count !== 1 ? 's' : ''}
                </span>
                {stats.lastUsed && (
                  <>
                    <span style={{ color: '#E8E3F5' }}>·</span>
                    <span className="text-[11px]" style={{ color: '#9B8FB5' }}>Último uso {timeAgo(stats.lastUsed)}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {configured && (
            <Link
              href={`/portal/${token}?tab=chat`}
              onClick={e => e.stopPropagation()}
              className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-medium transition-opacity hover:opacity-70"
              style={{ background: '#FAFAFB', color: '#6B6480', border: '1px solid #E8E3F5', textDecoration: 'none' }}
            >
              <MessageSquare size={11} />
              Usar
            </Link>
          )}
          {open ? <ChevronDown size={14} style={{ color: '#9B8FB5' }} /> : <ChevronRight size={14} style={{ color: '#9B8FB5' }} />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-6 pt-4 flex flex-col gap-5" style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Orden config ─────────────────────────────────────────────────────────────


function OrdenConfig({ token, onStatsLoad }: { token: string; onStatsLoad?: (cfg: OrdenConfig) => void }) {
  const [cfg, setCfg]         = useState<OrdenConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/orden-config`).then(r => r.json()).then(d => {
      setCfg(d.config ?? {});
      onStatsLoad?.(d.config ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token, onStatsLoad]);

  const upd = (key: keyof OrdenConfig) => (v: string | boolean) =>
    setCfg(prev => ({ ...prev, [key]: v }));

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/orden-config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: '#9B8FB5' }}>Cargando...</p>;

  return (
    <>
      <PlaceholderGuide docType="orden" color="#3b82f6" />
      <UploadZone
        token={token} docType="orden"
        templateName={cfg.template_name}
        templatePath={cfg.template_path}
        validation={cfg.template_validation}
        color="#3b82f6"
        onUploaded={data => setCfg(prev => ({ ...prev, template_name: data.name, template_path: data.path, template_validation: data.validation }))}
        onDeleted={() => setCfg(prev => { const { template_name: _, template_path: __, template_validation: ___, ...r } = prev; return r; })}
        onExtracted={fields => { setCfg(prev => ({ ...prev, ...fields })); setAutoFilled(true); setTimeout(() => setAutoFilled(false), 5000); }}
      />
      {autoFilled && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(59,130,246,0.08)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.15)' }}>
          <Wand2 size={11} /> Campos detectados automáticamente del documento
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Prefijo de folio" hint="OC genera folios OC-20260721-3841."
          value={cfg.folio_prefix ?? ''} onChange={upd('folio_prefix') as (v: string) => void} placeholder="OC" />
        <Field label="Términos de entrega" value={cfg.terminos_entrega ?? ''}
          onChange={upd('terminos_entrega') as (v: string) => void} placeholder="Entrega en 5 días hábiles" />
      </div>
      <CondicionesPagoField value={cfg.condiciones_pago ?? ''} onChange={upd('condiciones_pago') as (v: string) => void} />
      <Toggle checked={cfg.incluir_iva === true} onChange={v => setCfg(p => ({ ...p, incluir_iva: v }))}
        label="Incluir IVA 16%" hint="Activa solo si tus órdenes deben mostrar IVA" />
      <SaveRow saving={saving} saved={saved} onClick={save} />
    </>
  );
}

// ─── Cotización config ────────────────────────────────────────────────────────

function CotizacionConfigSection({ token, onStatsLoad }: { token: string; onStatsLoad?: (cfg: CotizacionConfig) => void }) {
  const [cfg, setCfg]         = useState<CotizacionConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/cotizacion-config`).then(r => r.json()).then(d => {
      setCfg(d.config ?? {});
      onStatsLoad?.(d.config ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token, onStatsLoad]);

  const upd = (key: keyof CotizacionConfig) => (v: string | boolean) =>
    setCfg(prev => ({ ...prev, [key]: v }));

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/cotizacion-config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: '#9B8FB5' }}>Cargando...</p>;

  return (
    <>
      <PlaceholderGuide docType="cotizacion" color="#10b981" />
      <UploadZone
        token={token} docType="cotizacion"
        templateName={cfg.template_name}
        templatePath={cfg.template_path}
        validation={cfg.template_validation}
        color="#10b981"
        onUploaded={data => setCfg(prev => ({ ...prev, template_name: data.name, template_path: data.path, template_validation: data.validation }))}
        onDeleted={() => setCfg(prev => { const { template_name: _, template_path: __, template_validation: ___, ...r } = prev; return r; })}
        onExtracted={fields => { setCfg(prev => ({ ...prev, ...fields })); setAutoFilled(true); setTimeout(() => setAutoFilled(false), 5000); }}
      />
      {autoFilled && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(16,185,129,0.08)', color: '#10b981', border: '1px solid rgba(16,185,129,0.15)' }}>
          <Wand2 size={11} /> Campos detectados automáticamente del documento
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Prefijo de folio" hint="COT genera folios COT-20260803-5892."
          value={cfg.folio_prefix ?? ''} onChange={upd('folio_prefix') as (v: string) => void} placeholder="COT" />
        <Field label="Vigencia (días) por defecto" hint="El cliente tiene N días para aceptar la cotización."
          value={cfg.vigencia_dias ?? ''} onChange={upd('vigencia_dias') as (v: string) => void} placeholder="15" />
      </div>
      <CondicionesPagoField value={cfg.condiciones_pago ?? ''} onChange={upd('condiciones_pago') as (v: string) => void} />
      <Toggle checked={cfg.incluir_iva !== false} onChange={v => setCfg(p => ({ ...p, incluir_iva: v }))}
        label="Incluir IVA 16%" hint="Se calcula automáticamente sobre el subtotal" />
      <SaveRow saving={saving} saved={saved} onClick={save} />
    </>
  );
}

// ─── Nota de venta config ─────────────────────────────────────────────────────

function NotaVentaConfigSection({ token, onStatsLoad }: { token: string; onStatsLoad?: (cfg: NotaVentaConfig) => void }) {
  const [cfg, setCfg]         = useState<NotaVentaConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/nota-venta-config`).then(r => r.json()).then(d => {
      setCfg(d.config ?? {});
      onStatsLoad?.(d.config ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token, onStatsLoad]);

  const upd = (key: keyof NotaVentaConfig) => (v: string | boolean) =>
    setCfg(prev => ({ ...prev, [key]: v }));

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/nota-venta-config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: '#9B8FB5' }}>Cargando...</p>;

  return (
    <>
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(245,158,11,0.06)', color: '#92400e', border: '1px solid rgba(245,158,11,0.2)' }}>
        <span>La nota de venta <strong>no sustituye una factura fiscal (CFDI)</strong>. Si tu cliente necesita comprobante fiscal, deberá pedir su factura por los canales normales de tu negocio.</span>
      </div>
      <PlaceholderGuide docType="nota_venta" color="#ec4899" />
      <UploadZone
        token={token} docType="nota_venta"
        templateName={cfg.template_name}
        templatePath={cfg.template_path}
        validation={cfg.template_validation}
        color="#ec4899"
        onUploaded={data => setCfg(prev => ({ ...prev, template_name: data.name, template_path: data.path, template_validation: data.validation }))}
        onDeleted={() => setCfg(prev => { const { template_name: _, template_path: __, template_validation: ___, ...r } = prev; return r; })}
        onExtracted={fields => { setCfg(prev => ({ ...prev, ...fields })); setAutoFilled(true); setTimeout(() => setAutoFilled(false), 5000); }}
      />
      {autoFilled && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(236,72,153,0.08)', color: '#ec4899', border: '1px solid rgba(236,72,153,0.15)' }}>
          <Wand2 size={11} /> Campos detectados automáticamente del documento
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Prefijo de folio" hint="NV genera folios NV-20260803-1234."
          value={cfg.folio_prefix ?? ''} onChange={upd('folio_prefix') as (v: string) => void} placeholder="NV" />
        <Field label="Forma de pago sugerida" hint="Se mostrará por default en cada nota."
          value={cfg.forma_pago ?? ''} onChange={upd('forma_pago') as (v: string) => void} placeholder="Efectivo" />
        <Field label="Aviso legal (opcional)" as="textarea"
          value={cfg.legal_notice ?? ''} onChange={upd('legal_notice') as (v: string) => void}
          placeholder="Este documento no es una factura fiscal. Solicite su CFDI a facturación@..." />
      </div>
      <Toggle checked={cfg.incluir_iva === true} onChange={v => setCfg(p => ({ ...p, incluir_iva: v }))}
        label="Mostrar desglose de IVA" hint="Activa solo si tu negocio maneja IVA en las ventas al público." />
      <SaveRow saving={saving} saved={saved} onClick={save} />
    </>
  );
}

function SaveRow({ saving, saved, onClick }: { saving: boolean; saved: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onClick} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ background: '#6C3BFF', color: '#fff' }}>
        <Save size={13} />
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
      {saved && (
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#22c55e' }}>
          <CheckCircle size={13} /> Guardado
        </div>
      )}
    </div>
  );
}

// ─── Contrato config ──────────────────────────────────────────────────────────

function ContratoConfig({ token, onConfiguredLoad }: { token: string; onConfiguredLoad?: (configured: boolean) => void }) {
  const [clauses, setClauses]           = useState<Clause[]>([]);
  const [defaults, setDefaults]         = useState<Clause[]>([]);
  const [templateName, setTemplateName] = useState<string | undefined>();
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${token}/contract-template`)
      .then(r => r.json())
      .then(d => {
        const loaded: Clause[] = d.template?.clauses ?? [];
        setClauses(loaded);
        setDefaults(d.defaults ?? []);
        setTemplateName(d.templateName ?? undefined);
        onConfiguredLoad?.(d.isConfigured === true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, onConfiguredLoad]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/contract-template`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clauses }),
      });
      setSaved(true);
      onConfiguredLoad?.(clauses.length > 0);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  function updateClause(id: string, patch: Partial<Clause>) {
    setClauses(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  function removeClause(id: string) {
    setClauses(prev => prev.filter(c => c.id !== id));
  }

  function addClause() {
    const id = `clause_${Date.now()}`;
    setClauses(prev => [...prev, { id, title: 'NUEVA CLÁUSULA', body: '', required: false, enabled: true }]);
    setEditingId(id);
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: '#9B8FB5' }}>Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <UploadZone
        token={token} docType="contrato" templateName={templateName} color="#8b5cf6"
        onUploaded={data => setTemplateName(data.name)}
        onDeleted={() => setTemplateName(undefined)}
      />

      {clauses.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-4 rounded-xl" style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}>
          <FileText size={28} style={{ color: '#6B6480', opacity: 0.35 }} />
          <div className="text-center max-w-xs px-4">
            <p className="text-sm font-semibold mb-1.5" style={{ color: '#1A0A3B' }}>Plantilla vacía</p>
            <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
              Esta es la base que tu empleado usa para generar contratos. Carga las cláusulas estándar y ajusta el texto según tus necesidades.
            </p>
          </div>
          <button
            onClick={() => setClauses(defaults)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#8b5cf6', color: '#fff' }}
          >
            <Plus size={14} /> Cargar cláusulas estándar
          </button>
          <button onClick={addClause} className="text-xs transition-opacity hover:opacity-70" style={{ color: '#6B6480' }}>
            o agregar cláusula en blanco
          </button>
        </div>
      ) : (<>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
          Tu empleado usará esta plantilla para generar borradores. Edita las cláusulas con el ícono de lápiz. Las marcadas como <strong>Requerida</strong> siempre se incluyen.
        </p>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all"
          style={{ background: saved ? 'rgba(34,197,94,0.15)' : '#8b5cf6', color: saved ? '#22c55e' : '#fff', border: saved ? '1px solid rgba(34,197,94,0.3)' : 'none' }}>
          {saved ? <><Check size={12} /> Guardada</> : saving ? 'Guardando...' : 'Guardar plantilla'}
        </button>
      </div>

      {/* Variables hint */}
      <div className="rounded-xl p-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#8b5cf6' }}>Variables disponibles</p>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLES_HINT.map(v => (
            <code key={v} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', fontFamily: 'monospace' }}>{v}</code>
          ))}
        </div>
        <p className="text-xs mt-2" style={{ color: '#9B8FB5' }}>Tu empleado sustituirá estas variables con los datos del cliente al generar un borrador.</p>
      </div>

      {/* Clauses */}
      <div className="flex flex-col gap-3">
        {clauses.map((clause, idx) => {
          const isEditing = editingId === clause.id;
          return (
            <div key={clause.id} className="rounded-xl overflow-hidden"
              style={{ background: '#ffffff', border: `1px solid ${clause.enabled ? '#E8E3F5' : 'rgba(255,255,255,0.04)'}`, opacity: clause.enabled ? 1 : 0.5 }}>
              <div className="flex items-center gap-2 px-4 py-2.5">
                <GripVertical size={14} style={{ color: '#9B8FB5', flexShrink: 0 }} />
                <span className="text-xs text-center px-1.5 py-0.5 rounded font-mono" style={{ background: '#FAFAFB', color: '#9B8FB5', minWidth: 20 }}>{idx + 1}</span>
                {isEditing ? (
                  <input
                    value={clause.title}
                    onChange={e => updateClause(clause.id, { title: e.target.value.toUpperCase() })}
                    className="flex-1 px-2 py-0.5 rounded text-xs font-bold uppercase"
                    style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', outline: 'none' }}
                  />
                ) : (
                  <span className="flex-1 text-xs font-bold uppercase" style={{ color: '#1A0A3B' }}>{clause.title}</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  {clause.required ? (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Requerida</span>
                  ) : (
                    <button onClick={() => updateClause(clause.id, { enabled: !clause.enabled })}
                      title={clause.enabled ? 'Desactivar cláusula' : 'Activar cláusula'}>
                      {clause.enabled
                        ? <ToggleRight size={18} style={{ color: '#22c55e' }} />
                        : <ToggleLeft  size={18} style={{ color: '#9B8FB5' }} />}
                    </button>
                  )}
                  <button onClick={() => setEditingId(isEditing ? null : clause.id)}
                    className="p-1 rounded" style={{ color: isEditing ? '#8b5cf6' : '#6B6480' }}>
                    <Edit2 size={13} />
                  </button>
                  {!clause.required && (
                    <button onClick={() => removeClause(clause.id)} className="p-1 rounded" style={{ color: '#f87171' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-4 pb-3" style={{ borderTop: '1px solid #F0EDF9' }}>
                {isEditing ? (
                  <>
                    <textarea
                      value={clause.body}
                      onChange={e => updateClause(clause.id, { body: e.target.value })}
                      rows={5}
                      className="w-full mt-2.5 px-3 py-2 rounded-lg text-xs resize-none"
                      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', color: '#1A0A3B', fontFamily: 'inherit', lineHeight: 1.7, outline: 'none' }}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: '#6B6480' }}>
                        <input type="checkbox" checked={clause.required} onChange={e => updateClause(clause.id, { required: e.target.checked })} className="rounded" />
                        Cláusula requerida (tu empleado no puede desactivarla)
                      </label>
                    </div>
                  </>
                ) : (
                  <p className="text-xs mt-2.5 leading-relaxed whitespace-pre-wrap" style={{ color: clause.enabled ? '#1A0A3B' : '#9B8FB5' }}>
                    {clause.body || <span style={{ color: '#9B8FB5', fontStyle: 'italic' }}>Sin contenido. Haz clic en editar para escribir.</span>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addClause}
        className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: '#ffffff', border: '1px dashed #E8E3F5', color: '#6B6480' }}>
        <Plus size={13} /> Agregar cláusula
      </button>
    </>)}
  </div>
);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlantillasPage() {
  const { token } = useParams<{ token: string }>();

  const [ordenStats,      setOrdenStats]      = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [cotizacionStats, setCotizacionStats] = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [notaVentaStats,  setNotaVentaStats]  = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [contratoStats,   setContratoStats]   = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [ordenCfg,        setOrdenCfg]        = useState<OrdenConfig>({});
  const [cotizacionCfg,   setCotizacionCfg]   = useState<CotizacionConfig>({});
  const [notaVentaCfg,    setNotaVentaCfg]    = useState<NotaVentaConfig>({});
  const [contratoConfigured, setContratoConfigured] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/${token}/ops-documents`).then(r => r.json()),
      fetch(`/api/portal/${token}/contract-drafts`).then(r => r.json()),
      fetch(`/api/portal/${token}/orden-config`).then(r => r.json()),
      fetch(`/api/portal/${token}/cotizacion-config`).then(r => r.json()).catch(() => ({ config: {} })),
      fetch(`/api/portal/${token}/nota-venta-config`).then(r => r.json()).catch(() => ({ config: {} })),
      fetch(`/api/portal/${token}/contract-template`).then(r => r.json()),
    ]).then(([{ documents = [] }, { drafts = [] }, { config: oCfg }, { config: cCfg }, { config: nCfg }, { isConfigured: contrIsConfigured }]) => {
      const byType = (type: string) => (documents as Array<{ template_type: string; created_at: string }>)
        .filter(d => d.template_type === type)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      const ordDocs  = byType('orden_compra');
      const cotDocs  = byType('cotizacion');
      const nvDocs   = byType('nota_venta');
      setOrdenStats({ count: ordDocs.length,    lastUsed: ordDocs[0]?.created_at  ?? null });
      setCotizacionStats({ count: cotDocs.length, lastUsed: cotDocs[0]?.created_at ?? null });
      setNotaVentaStats({ count: nvDocs.length,  lastUsed: nvDocs[0]?.created_at  ?? null });

      const sorted = (drafts as Array<{ created_at: string }>)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      setContratoStats({ count: sorted.length, lastUsed: sorted[0]?.created_at ?? null });

      if (oCfg) setOrdenCfg(oCfg);
      if (cCfg) setCotizacionCfg(cCfg);
      if (nCfg) setNotaVentaCfg(nCfg);
      setContratoConfigured(contrIsConfigured === true);
    }).catch(() => {});
  }, [token]);

  const totalTemplates =
    (isConfigured(ordenCfg)                                  ? 1 : 0) +
    (isConfigured(cotizacionCfg as unknown as FacturaConfig) ? 1 : 0) +
    (isConfigured(notaVentaCfg  as unknown as FacturaConfig) ? 1 : 0) +
    (contratoConfigured                                       ? 1 : 0);

  return (
    <div id="of-plantillas" className="flex flex-col gap-5 max-w-6xl mx-auto w-full p-4 md:p-6">

      <OficinaPageHero
        icon={LayoutTemplate}
        eyebrow="Plantillas"
        title="Plantillas de documentos"
        description={totalTemplates > 0
          ? <><strong style={{ color: '#1A0A3B' }}>{totalTemplates}</strong> de 4 plantillas configuradas. Tus empleados usan tu formato Word cada vez que generan un documento.</>
          : 'Sube tu formato Word y tus empleados lo usarán igual cada vez que generen un documento.'}
      />

      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: '#ffffff',
          border:     '1px solid #E8E3F5',
          boxShadow:  '0 1px 2px rgba(26,10,59,0.04)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap px-5 pt-5 pb-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Tipos de documento
            </h2>
            <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
              Configura cada tipo por separado: campos, cálculos y diseño Word.
            </p>
          </div>
        </div>

        <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
          <TemplateRow
            id="orden" icon={ShoppingCart} title="Orden de compra"
            subtitle="Solicitud formal de productos o servicios a proveedores"
            color="#3b82f6" stats={ordenStats} configured={isConfigured(ordenCfg)} token={token}
            isLast={false}
          >
            <OrdenConfig token={token} onStatsLoad={setOrdenCfg} />
          </TemplateRow>

          <TemplateRow
            id="cotizacion" icon={FileText} title="Cotización"
            subtitle="Propuesta de precio al cliente antes de vender (no es factura fiscal)"
            color="#10b981" stats={cotizacionStats} configured={isConfigured(cotizacionCfg as unknown as FacturaConfig)} token={token}
            isLast={false}
          >
            <CotizacionConfigSection token={token} onStatsLoad={setCotizacionCfg} />
          </TemplateRow>

          <TemplateRow
            id="nota-venta" icon={FileText} title="Nota de venta"
            subtitle="Comprobante simple post-venta (NO sustituye una factura fiscal)"
            color="#ec4899" stats={notaVentaStats} configured={isConfigured(notaVentaCfg as unknown as FacturaConfig)} token={token}
            isLast={false}
          >
            <NotaVentaConfigSection token={token} onStatsLoad={setNotaVentaCfg} />
          </TemplateRow>

          <TemplateRow
            id="contrato" icon={FileText} title="Contrato"
            subtitle="Contrato de prestación de servicios con cláusulas editables"
            color="#8b5cf6" stats={contratoStats} configured={contratoConfigured} token={token}
            isLast={true}
          >
            <ContratoConfig token={token} onConfiguredLoad={setContratoConfigured} />
          </TemplateRow>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {[
          {
            n: '1',
            t: 'Sube tu formato Word',
            d: 'Toma tu documento actual tal cual. No necesitas agregar marcadores; el sistema detecta y reemplaza los campos por ti.',
            gradient: 'linear-gradient(90deg, rgba(108,59,255,0.14) 0%, rgba(108,59,255,0.02) 100%)',
          },
          {
            n: '2',
            t: 'Confirma la detección',
            d: 'Verás un preview con los campos que detectamos. Confirma para guardar o descarta y sube otra versión.',
            gradient: 'radial-gradient(ellipse at center, rgba(108,59,255,0.14) 0%, rgba(108,59,255,0.02) 70%)',
          },
          {
            n: '3',
            t: 'El empleado lo produce',
            d: 'Pídele "genera una cotización para..." y sale con tu diseño exacto en PDF, listo para enviar.',
            gradient: 'linear-gradient(270deg, rgba(108,59,255,0.14) 0%, rgba(108,59,255,0.02) 100%)',
          },
        ].map(s => (
          <div key={s.n} className="flex gap-3 rounded-xl p-4 flex-1"
            style={{ background: s.gradient, border: '1px solid #E8E3F5' }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
              style={{ background: 'rgba(108,59,255,0.18)', color: '#6C3BFF' }}>{s.n}</span>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: '#1A0A3B' }}>{s.t}</p>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#6B6480' }}>{s.d}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
