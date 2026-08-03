'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, ShoppingCart, Upload, Trash2, Save, CheckCircle,
  FileCheck, ChevronDown, ChevronRight, MessageSquare, Wand2,
  Plus, Check, Edit2, GripVertical, ToggleLeft, ToggleRight, X,
  Copy, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { TEMPLATE_SPECS, type PlaceholderSpec } from '@/lib/documents/template-spec';

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
  if (d < 7)  return `hace ${d} dias`;
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
  const s = { background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' } as React.CSSProperties;
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--c-text-2)' }}>{label}</label>
      {hint && <p className="text-xs mb-1.5" style={{ color: 'var(--c-text-4)' }}>{hint}</p>}
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
      <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--c-text-2)' }}>Condiciones de pago</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {CONDICIONES_PRESET.map(opt => (
          <button key={opt} type="button" onClick={() => selectPreset(opt)}
            className="text-xs px-2.5 py-1 rounded-full transition-all"
            style={value === opt && !showOtro
              ? { background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.3)', fontWeight: 600 }
              : { background: 'transparent', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }
            }
          >{opt}</button>
        ))}
        <button type="button" onClick={activateOtro}
          className="text-xs px-2.5 py-1 rounded-full transition-all"
          style={showOtro
            ? { background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.3)', fontWeight: 600 }
            : { background: 'transparent', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }
          }
        >Otro</button>
      </div>
      {showOtro && (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder="Ej. Anticipo 50%, saldo a 30 días"
          autoFocus
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
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
        style={{ background: checked ? '#6C3BFF' : 'var(--c-border)' }}>
        <span className="inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform"
          style={{ margin: 3, transform: checked ? 'translateX(16px)' : 'translateX(0)' }} />
      </button>
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{label}</p>
        {hint && <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{hint}</p>}
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
      style={{ background: copied ? `${color}22` : 'var(--c-surface-2)', color: copied ? color : 'var(--c-text-2)', border: `1px solid ${copied ? color + '55' : 'var(--c-border)'}` }}>
      {text}
      {copied ? <Check size={10} /> : <Copy size={10} style={{ opacity: 0.6 }} />}
    </button>
  );
}

function PlaceholderGuide({ docType, color }: { docType: 'factura' | 'orden'; color: string }) {
  const [open, setOpen] = useState(false);
  const spec = TEMPLATE_SPECS[docType];
  if (!spec) return null;

  const simple = spec.placeholders.filter(p => !p.isLoop);
  const loops  = spec.placeholders.filter(p => p.isLoop);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
          <FileText size={12} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Marcadores soportados</p>
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Copia y pega estos en tu documento Word donde quieras que aparezcan los datos.</p>
        </div>
        <ChevronDown size={14} style={{ color: 'var(--c-text-4)', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>Campos simples</p>
            <div className="flex flex-wrap gap-1.5">
              {simple.map(p => (
                <PlaceholderChip key={p.key} text={`{{${p.key}}}`} color={color} />
              ))}
            </div>
          </div>
          {loops.map(loop => (
            <div key={loop.key}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
                Tabla de partidas (bloque repetible)
              </p>
              <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
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
        <p className="mt-1.5" style={{ color: 'var(--c-text-3)' }}>Agrégalos en Word y vuelve a subir para que los documentos generen bien.</p>
      </div>
    </div>
  );
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

function UploadZone({ token, docType, templateName, templatePath, validation, onUploaded, onDeleted, onExtracted, color }: {
  token: string; docType: 'factura' | 'orden' | 'contrato'; templateName?: string;
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

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('doc_type', docType);
      const res  = await fetch(`/api/portal/${token}/template-upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.ok) {
        onUploaded({ name: data.name, path: data.path, validation: data.validation ?? null });
        if (data.extracted && Object.keys(data.extracted as object).length > 0) {
          onExtracted?.(data.extracted as Record<string, unknown>);
        }
      } else {
        setUploadError(data.error ?? 'No se pudo subir el archivo');
      }
    } catch {
      setUploadError('Error de conexion. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
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
    if (!confirm('Eliminar la plantilla de referencia?')) return;
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
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{templateName}</p>
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Plantilla Word cargada</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {templatePath && (
              <button onClick={openTemplate}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
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
        {validation && (docType === 'factura' || docType === 'orden') && (
          <TemplateValidationBadge validation={validation} color={color} />
        )}
      </div>
    );
  }

  return (
    <>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
        className="flex flex-col items-center justify-center gap-2 rounded-xl py-7 cursor-pointer transition-all"
        style={{ border: `2px dashed ${drag ? color : 'var(--c-border)'}`, background: drag ? `${color}06` : 'transparent' }}
      >
        <input ref={inputRef} type="file" accept=".docx" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        <Upload size={18} style={{ color: drag ? color : 'var(--c-text-4)', opacity: drag ? 1 : 0.5 }} />
        <p className="text-sm font-medium" style={{ color: 'var(--c-text-3)' }}>
          {uploading ? 'Subiendo...' : 'Arrastra tu plantilla Word aqui o haz clic para seleccionarla'}
        </p>
        <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Solo .docx · Máx 10 MB</p>
      </div>
      {uploadError && (
        <p className="text-xs px-1 mt-1" style={{ color: '#f87171' }}>{uploadError}</p>
      )}
    </>
  );
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  id, icon: Icon, title, subtitle, color, stats, configured, children, token,
}: {
  id: string; icon: React.ElementType; title: string; subtitle: string;
  color: string; stats: TemplateStats; configured: boolean;
  children: React.ReactNode; token: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      {/* Header — always visible */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--c-surface-2)]">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}12` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{title}</p>
            {configured
              ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>Lista</span>
              : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)' }}>Sin configurar</span>
            }
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>{subtitle}</p>
            {stats.count > 0 && (
              <>
                <span style={{ color: 'var(--c-border)' }}>·</span>
                <span className="text-xs font-medium" style={{ color: 'var(--c-text-3)' }}>
                  {stats.count} documento{stats.count !== 1 ? 's' : ''} generado{stats.count !== 1 ? 's' : ''}
                </span>
                {stats.lastUsed && (
                  <>
                    <span style={{ color: 'var(--c-border)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>Ultimo uso {timeAgo(stats.lastUsed)}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {configured && (
            <Link
              href={`/portal/${token}?tab=chat`}
              onClick={e => e.stopPropagation()}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: `${color}12`, color, textDecoration: 'none' }}
            >
              <MessageSquare size={11} />
              Usar
            </Link>
          )}
          {open ? <ChevronDown size={14} style={{ color: 'var(--c-text-4)' }} /> : <ChevronRight size={14} style={{ color: 'var(--c-text-4)' }} />}
        </div>
      </button>

      {/* Config panel */}
      {open && (
        <div className="px-5 pb-6 pt-2 flex flex-col gap-5" style={{ borderTop: '1px solid var(--c-border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Factura config ───────────────────────────────────────────────────────────

function FacturaConfig({ token, onStatsLoad }: { token: string; onStatsLoad?: (cfg: FacturaConfig) => void }) {
  const [cfg, setCfg]         = useState<FacturaConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/${token}/factura-config`).then(r => r.json()).then(d => {
      setCfg(d.config ?? {});
      onStatsLoad?.(d.config ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token, onStatsLoad]);

  const upd = (key: keyof FacturaConfig) => (v: string | boolean) =>
    setCfg(prev => ({ ...prev, [key]: v }));

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/factura-config`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
      });
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-4)' }}>Cargando...</p>;

  return (
    <>
      <PlaceholderGuide docType="factura" color="#f59e0b" />
      <UploadZone
        token={token} docType="factura"
        templateName={cfg.template_name}
        templatePath={cfg.template_path}
        validation={cfg.template_validation}
        color="#f59e0b"
        onUploaded={data => setCfg(prev => ({ ...prev, template_name: data.name, template_path: data.path, template_validation: data.validation }))}
        onDeleted={() => setCfg(prev => { const { template_name: _, template_path: __, template_validation: ___, ...r } = prev; return r; })}
        onExtracted={fields => { setCfg(prev => ({ ...prev, ...fields })); setAutoFilled(true); setTimeout(() => setAutoFilled(false), 5000); }}
      />
      {autoFilled && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.15)' }}>
          <Wand2 size={11} /> Campos detectados automaticamente del documento
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="RFC del emisor" hint="Aparece en cada factura que genera el empleado."
          value={cfg.rfc ?? ''} onChange={upd('rfc') as (v: string) => void} placeholder="XAXX010101000" />
        <Field label="Prefijo de folio" hint="FAC genera folios FAC-20260721-5892."
          value={cfg.folio_prefix ?? ''} onChange={upd('folio_prefix') as (v: string) => void} placeholder="FAC" />
        <Field label="Direccion fiscal" value={cfg.direccion ?? ''} as="textarea"
          onChange={upd('direccion') as (v: string) => void} placeholder="Av. Ejemplo 123, Col. Centro, Monterrey, NL" />
      </div>
      <CondicionesPagoField value={cfg.condiciones_pago ?? ''} onChange={upd('condiciones_pago') as (v: string) => void} />
      <Toggle checked={cfg.incluir_iva !== false} onChange={v => setCfg(p => ({ ...p, incluir_iva: v }))}
        label="Incluir IVA 16%" hint="Se calcula automaticamente sobre el subtotal" />
      <SaveRow saving={saving} saved={saved} onClick={save} />
    </>
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

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-4)' }}>Cargando...</p>;

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
          <Wand2 size={11} /> Campos detectados automaticamente del documento
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Prefijo de folio" hint="OC genera folios OC-20260721-3841."
          value={cfg.folio_prefix ?? ''} onChange={upd('folio_prefix') as (v: string) => void} placeholder="OC" />
        <Field label="Terminos de entrega" value={cfg.terminos_entrega ?? ''}
          onChange={upd('terminos_entrega') as (v: string) => void} placeholder="Entrega en 5 dias habiles" />
      </div>
      <CondicionesPagoField value={cfg.condiciones_pago ?? ''} onChange={upd('condiciones_pago') as (v: string) => void} />
      <Toggle checked={cfg.incluir_iva === true} onChange={v => setCfg(p => ({ ...p, incluir_iva: v }))}
        label="Incluir IVA 16%" hint="Activa solo si tus ordenes deben mostrar IVA" />
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
    setClauses(prev => [...prev, { id, title: 'NUEVA CLAUSULA', body: '', required: false, enabled: true }]);
    setEditingId(id);
  }

  if (loading) return <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-4)' }}>Cargando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <UploadZone
        token={token} docType="contrato" templateName={templateName} color="#8b5cf6"
        onUploaded={data => setTemplateName(data.name)}
        onDeleted={() => setTemplateName(undefined)}
      />

      {clauses.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-4 rounded-xl" style={{ background: 'var(--c-surface-2)', border: '1px dashed var(--c-border)' }}>
          <FileText size={28} style={{ color: 'var(--c-text-3)', opacity: 0.35 }} />
          <div className="text-center max-w-xs px-4">
            <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--c-text-2)' }}>Plantilla vacia</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
              Esta es la base que tu empleado usa para generar contratos. Carga las clausulas estandar y ajusta el texto segun tus necesidades.
            </p>
          </div>
          <button
            onClick={() => setClauses(defaults)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#8b5cf6', color: '#fff' }}
          >
            <Plus size={14} /> Cargar clausulas estandar
          </button>
          <button onClick={addClause} className="text-xs transition-opacity hover:opacity-70" style={{ color: 'var(--c-text-3)' }}>
            o agregar clausula en blanco
          </button>
        </div>
      ) : (<>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Tu empleado usara esta plantilla para generar borradores. Edita las clausulas con el icono de lapiz. Las marcadas como <strong>Requerida</strong> siempre se incluyen.
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
        <p className="text-xs mt-2" style={{ color: 'var(--c-text-4)' }}>Tu empleado sustituira estas variables con los datos del cliente al generar un borrador.</p>
      </div>

      {/* Clauses */}
      <div className="flex flex-col gap-3">
        {clauses.map((clause, idx) => {
          const isEditing = editingId === clause.id;
          return (
            <div key={clause.id} className="rounded-xl overflow-hidden"
              style={{ background: 'var(--c-surface)', border: `1px solid ${clause.enabled ? 'var(--c-border)' : 'rgba(255,255,255,0.04)'}`, opacity: clause.enabled ? 1 : 0.5 }}>
              <div className="flex items-center gap-2 px-4 py-2.5">
                <GripVertical size={14} style={{ color: 'var(--c-text-4)', flexShrink: 0 }} />
                <span className="text-xs text-center px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-4)', minWidth: 20 }}>{idx + 1}</span>
                {isEditing ? (
                  <input
                    value={clause.title}
                    onChange={e => updateClause(clause.id, { title: e.target.value.toUpperCase() })}
                    className="flex-1 px-2 py-0.5 rounded text-xs font-bold uppercase"
                    style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }}
                  />
                ) : (
                  <span className="flex-1 text-xs font-bold uppercase" style={{ color: 'var(--c-text)' }}>{clause.title}</span>
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  {clause.required ? (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Requerida</span>
                  ) : (
                    <button onClick={() => updateClause(clause.id, { enabled: !clause.enabled })}
                      title={clause.enabled ? 'Desactivar clausula' : 'Activar clausula'}>
                      {clause.enabled
                        ? <ToggleRight size={18} style={{ color: '#22c55e' }} />
                        : <ToggleLeft  size={18} style={{ color: 'var(--c-text-4)' }} />}
                    </button>
                  )}
                  <button onClick={() => setEditingId(isEditing ? null : clause.id)}
                    className="p-1 rounded" style={{ color: isEditing ? '#8b5cf6' : 'var(--c-text-3)' }}>
                    <Edit2 size={13} />
                  </button>
                  {!clause.required && (
                    <button onClick={() => removeClause(clause.id)} className="p-1 rounded" style={{ color: '#f87171' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-4 pb-3" style={{ borderTop: '1px solid var(--c-divider)' }}>
                {isEditing ? (
                  <>
                    <textarea
                      value={clause.body}
                      onChange={e => updateClause(clause.id, { body: e.target.value })}
                      rows={5}
                      className="w-full mt-2.5 px-3 py-2 rounded-lg text-xs resize-none"
                      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.7, outline: 'none' }}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--c-text-3)' }}>
                        <input type="checkbox" checked={clause.required} onChange={e => updateClause(clause.id, { required: e.target.checked })} className="rounded" />
                        Clausula requerida (tu empleado no puede desactivarla)
                      </label>
                    </div>
                  </>
                ) : (
                  <p className="text-xs mt-2.5 leading-relaxed whitespace-pre-wrap" style={{ color: clause.enabled ? 'var(--c-text-2)' : 'var(--c-text-4)' }}>
                    {clause.body || <span style={{ color: 'var(--c-text-4)', fontStyle: 'italic' }}>Sin contenido. Haz clic en editar para escribir.</span>}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={addClause}
        className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: 'var(--c-surface)', border: '1px dashed var(--c-border)', color: 'var(--c-text-3)' }}>
        <Plus size={13} /> Agregar clausula
      </button>
    </>)}
  </div>
);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlantillasPage() {
  const { token } = useParams<{ token: string }>();

  const [facturaStats,    setFacturaStats]    = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [ordenStats,      setOrdenStats]      = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [contratoStats,   setContratoStats]   = useState<TemplateStats>({ count: 0, lastUsed: null });
  const [facturaCfg,      setFacturaCfg]      = useState<FacturaConfig>({});
  const [ordenCfg,        setOrdenCfg]        = useState<OrdenConfig>({});
  const [contratoConfigured, setContratoConfigured] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/portal/${token}/ops-documents`).then(r => r.json()),
      fetch(`/api/portal/${token}/contract-drafts`).then(r => r.json()),
      fetch(`/api/portal/${token}/factura-config`).then(r => r.json()),
      fetch(`/api/portal/${token}/orden-config`).then(r => r.json()),
      fetch(`/api/portal/${token}/contract-template`).then(r => r.json()),
    ]).then(([{ documents = [] }, { drafts = [] }, { config: fCfg }, { config: oCfg }, { isConfigured: contrIsConfigured }]) => {
      const byType = (type: string) => (documents as Array<{ template_type: string; created_at: string }>)
        .filter(d => d.template_type === type)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      const factDocs = byType('factura');
      const ordDocs  = byType('orden_compra');
      setFacturaStats({ count: factDocs.length, lastUsed: factDocs[0]?.created_at ?? null });
      setOrdenStats({ count: ordDocs.length,    lastUsed: ordDocs[0]?.created_at  ?? null });

      const sorted = (drafts as Array<{ created_at: string }>)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      setContratoStats({ count: sorted.length, lastUsed: sorted[0]?.created_at ?? null });

      if (fCfg) setFacturaCfg(fCfg);
      if (oCfg) setOrdenCfg(oCfg);
      setContratoConfigured(contrIsConfigured === true);
    }).catch(() => {});
  }, [token]);

  return (
    <div id="of-plantillas" className="flex flex-col gap-6 p-5 sm:p-7 w-full">

      {/* Hero */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>
          Plantillas
        </p>
        <h1 className="text-xl font-bold mt-1.5 leading-snug" style={{ color: 'var(--c-text)' }}>
          Ensenale a tu equipo como se hacen los documentos de tu negocio.
        </h1>
        <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
          Sube tu formato de factura, orden de compra o cualquier documento membretado.
          Tus empleados respetaran el formato y lo usaran cada vez que se los pidas, sin importar cuantos documentos generen.
        </p>
      </div>

      {/* How it works */}
      <div className="flex flex-col sm:flex-row gap-3">
        {[
          { n: '1', t: 'Prepara tu plantilla Word', d: 'Toma tu documento actual, agrega marcadores como {{cliente_nombre}} donde deben aparecer los datos.' },
          { n: '2', t: 'Sube el .docx', d: 'Solo Word. Detectamos qué marcadores usaste y avisamos si falta alguno.' },
          { n: '3', t: 'El empleado produce', d: 'Pídele "genera una factura para..." y sale con tu diseño exacto en PDF.' },
        ].map(s => (
          <div key={s.n} className="flex gap-3 rounded-xl p-4 flex-1" style={{ background: 'rgba(108,59,255,0.04)', border: '1px solid rgba(108,59,255,0.1)' }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
              style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF' }}>{s.n}</span>
            <div>
              <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>{s.t}</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--c-text-4)' }}>{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Factura */}
      <TemplateCard
        id="factura" icon={FileText} title="Factura"
        subtitle="Documento de cobro con conceptos, subtotal e IVA"
        color="#f59e0b" stats={facturaStats} configured={isConfigured(facturaCfg)} token={token}
      >
        <FacturaConfig token={token} onStatsLoad={setFacturaCfg} />
      </TemplateCard>

      {/* Orden de compra */}
      <TemplateCard
        id="orden" icon={ShoppingCart} title="Orden de compra"
        subtitle="Solicitud formal de productos o servicios a proveedores"
        color="#3b82f6" stats={ordenStats} configured={isConfigured(ordenCfg)} token={token}
      >
        <OrdenConfig token={token} onStatsLoad={setOrdenCfg} />
      </TemplateCard>

      {/* Contrato */}
      <TemplateCard
        id="contrato" icon={FileText} title="Contrato"
        subtitle="Contrato de prestacion de servicios con clausulas editables"
        color="#8b5cf6" stats={contratoStats} configured={contratoConfigured} token={token}
      >
        <ContratoConfig token={token} onConfiguredLoad={setContratoConfigured} />
      </TemplateCard>

    </div>
  );
}
