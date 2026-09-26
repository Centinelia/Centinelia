'use client';

/**
 * OficinaModal — modal compartido con paleta workspace de Oficina.
 *
 * Uso:
 *   <OficinaModal
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     eyebrow="Nueva tarea"
 *     title="Programa una ejecución automática"
 *     description="El agente la ejecutará en el horario que definas."
 *     footer={
 *       <>
 *         <OficinaModal.SecondaryAction onClick={onClose}>Cancelar</OficinaModal.SecondaryAction>
 *         <OficinaModal.PrimaryAction onClick={onSave} loading={saving}>Guardar</OficinaModal.PrimaryAction>
 *       </>
 *     }
 *   >
 *     …campos del formulario…
 *   </OficinaModal>
 *
 * Design:
 * - Overlay dark (rgba(15,5,34,0.7)) + backdrop blur
 * - Card blanca, borderRadius 20, sombra premium
 * - Header con eyebrow lila + title 20px + description gris + close top-right
 * - Body con padding 24 y scroll interno si supera 90vh
 * - Footer con actions alineadas a la derecha
 * - Escape para cerrar
 * - Click en overlay cierra si `dismissOnOverlay` (default true)
 * - Focus trap básico (return focus al trigger cuando cierra)
 */

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { formatMoney, parseMoney } from '@/lib/format/money';

// ─── Public props ─────────────────────────────────────────────────────────────

export interface OficinaModalProps {
  open:               boolean;
  onClose:            () => void;
  title:              string;
  eyebrow?:           string;
  description?:       string;
  footer?:            React.ReactNode;
  children:           React.ReactNode;
  /** 'md' 520px, 'lg' 640px, 'xl' 800px */
  size?:              'md' | 'lg' | 'xl';
  dismissOnOverlay?:  boolean;
}

const SIZE_PX: Record<NonNullable<OficinaModalProps['size']>, number> = {
  md: 520,
  lg: 640,
  xl: 800,
};

// ─── Component ────────────────────────────────────────────────────────────────

function OficinaModal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  footer,
  children,
  size = 'md',
  dismissOnOverlay = true,
}: OficinaModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    // lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={dismissOnOverlay ? (e => { if (e.target === overlayRef.current) onClose(); }) : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background:     'rgba(15,5,34,0.62)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex flex-col overflow-hidden"
        style={{
          width:        '100%',
          maxWidth:     SIZE_PX[size],
          maxHeight:    '90vh',
          background:   '#ffffff',
          borderRadius: 20,
          border:       '1px solid #E8E3F5',
          boxShadow:    '0 24px 64px rgba(15,5,34,0.32), 0 8px 24px rgba(15,5,34,0.18)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4"
          style={{
            padding:      '20px 24px 16px',
            borderBottom: '1px solid #F0EBFA',
          }}
        >
          <div className="flex flex-col gap-1 min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#9B6DFF' }}>
                {eyebrow}
              </p>
            )}
            <h2 className="text-[20px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
              {title}
            </h2>
            {description && (
              <p className="text-[13px] mt-1" style={{ color: '#6B6480' }}>
                {description}
              </p>
            )}
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex items-center justify-center rounded-lg transition-colors shrink-0"
            style={{
              width:  32,
              height: 32,
              color:  '#6B6480',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F5F0FF'; (e.currentTarget as HTMLElement).style.color = '#1A0A3B'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#6B6480'; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: '20px 24px' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="flex items-center justify-end gap-2 shrink-0"
            style={{
              padding:   '14px 24px',
              borderTop: '1px solid #F0EBFA',
              background: '#FAFAFB',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Action components (compound) ─────────────────────────────────────────────

interface ActionProps {
  onClick?:  () => void;
  disabled?: boolean;
  loading?:  boolean;
  children:  React.ReactNode;
  type?:     'button' | 'submit';
}

OficinaModal.PrimaryAction = function PrimaryAction({ onClick, disabled, loading, children, type = 'button' }: ActionProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 rounded-xl transition-all"
      style={{
        padding:      '9px 18px',
        background:   disabled || loading ? '#B9A8E8' : '#6C3BFF',
        color:        '#ffffff',
        fontSize:     13,
        fontWeight:   600,
        border:       'none',
        cursor:       disabled || loading ? 'not-allowed' : 'pointer',
        boxShadow:    disabled || loading ? 'none' : '0 2px 8px rgba(108,59,255,0.32)',
      }}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
};

OficinaModal.SecondaryAction = function SecondaryAction({ onClick, disabled, loading, children, type = 'button' }: ActionProps) {
  const isBusy = disabled || loading;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isBusy}
      className="inline-flex items-center gap-2 rounded-xl transition-colors"
      style={{
        padding:      '9px 16px',
        background:   '#ffffff',
        color:        '#6B6480',
        fontSize:     13,
        fontWeight:   600,
        border:       '1px solid #E8E3F5',
        cursor:       isBusy ? 'not-allowed' : 'pointer',
        opacity:      isBusy && !loading ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!isBusy) { (e.currentTarget as HTMLElement).style.background = '#F5F0FF'; (e.currentTarget as HTMLElement).style.color = '#1A0A3B'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff'; (e.currentTarget as HTMLElement).style.color = '#6B6480'; }}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
};

OficinaModal.Field = function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>
        {label}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal" style={{ color: '#9B8FB5' }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
};

// ─── Focus ring helper para inputs/textarea/select ────────────────────────────

const INPUT_BASE_STYLE: React.CSSProperties = {
  background:  '#ffffff',
  border:      '1px solid #E8E3F5',
  color:       '#1A0A3B',
  fontFamily:  'inherit',
  transition:  'border-color 0.15s, box-shadow 0.15s',
};

function applyFocusRing(el: HTMLElement) {
  el.style.borderColor = '#6C3BFF';
  el.style.boxShadow   = '0 0 0 3px rgba(108,59,255,0.08)';
}
function clearFocusRing(el: HTMLElement) {
  el.style.borderColor = '#E8E3F5';
  el.style.boxShadow   = 'none';
}

// ─── Input compound ───────────────────────────────────────────────────────────

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'style'> & { style?: React.CSSProperties };

OficinaModal.Input = function Input(props: InputProps) {
  const { className, style, onFocus, onBlur, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full px-3.5 rounded-xl text-[14px] outline-none ${className ?? ''}`}
      style={{ ...INPUT_BASE_STYLE, height: 40, ...style }}
      onFocus={e => { applyFocusRing(e.currentTarget); onFocus?.(e); }}
      onBlur={e  => { clearFocusRing(e.currentTarget); onBlur?.(e); }}
    />
  );
};

// ─── Textarea compound ────────────────────────────────────────────────────────

type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> & { style?: React.CSSProperties };

OficinaModal.Textarea = function Textarea(props: TextareaProps) {
  const { className, style, onFocus, onBlur, rows = 3, ...rest } = props;
  return (
    <textarea
      {...rest}
      rows={rows}
      className={`w-full px-3.5 py-2.5 rounded-xl text-[14px] leading-relaxed outline-none resize-y ${className ?? ''}`}
      style={{ ...INPUT_BASE_STYLE, ...style }}
      onFocus={e => { applyFocusRing(e.currentTarget); onFocus?.(e); }}
      onBlur={e  => { clearFocusRing(e.currentTarget); onBlur?.(e); }}
    />
  );
};

// ─── Select compound ──────────────────────────────────────────────────────────

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'style'> & { style?: React.CSSProperties };

OficinaModal.Select = function Select(props: SelectProps) {
  const { className, style, onFocus, onBlur, children, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full px-3.5 rounded-xl text-[14px] outline-none appearance-none cursor-pointer ${className ?? ''}`}
      style={{
        ...INPUT_BASE_STYLE,
        height:             40,
        backgroundImage:    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6480' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
        backgroundRepeat:   'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight:       36,
        ...style,
      }}
      onFocus={e => { applyFocusRing(e.currentTarget); onFocus?.(e); }}
      onBlur={e  => { clearFocusRing(e.currentTarget); onBlur?.(e); }}
    >
      {children}
    </select>
  );
};

// ─── MoneyInput compound ──────────────────────────────────────────────────────
//
// Input de dinero premium: muestra "$1,234.56" cuando NO tiene focus, edita
// como número plano cuando SÍ. onChange devuelve string plano (sin formato)
// para que el consumer lo maneje con Number()/parseMoney().

type MoneyInputProps = {
  value:         string;
  onChange:      (v: string) => void;
  placeholder?:  string;
  disabled?:     boolean;
};

OficinaModal.MoneyInput = function MoneyInput({ value, onChange, placeholder = '0.00', disabled }: MoneyInputProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = value !== '' && !Number.isNaN(Number(value));

  // Idle: mostrar formateado. Focus: valor plano editable.
  const display = focused ? value : (hasValue ? formatMoney(value, { symbol: false }) : '');

  return (
    <div className="relative">
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold pointer-events-none select-none"
        style={{ color: hasValue || focused ? '#6C3BFF' : '#9B8FB5' }}
      >
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={e => {
          // Aceptar solo dígitos, punto y coma. Al parsear final quitamos la coma.
          const raw = e.target.value.replace(/[^\d.,]/g, '').replace(/,/g, '');
          onChange(raw);
        }}
        onFocus={e => { setFocused(true); applyFocusRing(e.currentTarget); }}
        onBlur={e  => {
          setFocused(false);
          clearFocusRing(e.currentTarget);
          // Normalize on blur: si es parseable, guardar el número limpio como string
          if (value) {
            const parsed = parseMoney(value);
            if (Number.isFinite(parsed)) onChange(String(parsed));
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full pr-3.5 rounded-xl text-[14px] outline-none"
        style={{ ...INPUT_BASE_STYLE, height: 40, paddingLeft: 28 }}
      />
    </div>
  );
};

// ─── FileInput compound ───────────────────────────────────────────────────────

type FileInputProps = {
  inputRef?:  React.RefObject<HTMLInputElement | null>;
  accept?:    string;
  onChange?:  (file: File | null) => void;
  disabled?:  boolean;
  placeholder?: string;
};

OficinaModal.FileInput = function FileInput({ inputRef, accept, onChange, disabled, placeholder = 'Selecciona un archivo…' }: FileInputProps) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const ref = inputRef ?? localRef;
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        className="rounded-xl text-[13px] font-semibold transition-colors shrink-0"
        style={{
          padding:    '9px 14px',
          background: '#F5F0FF',
          color:      '#6C3BFF',
          border:     '1px solid #E8E3F5',
          cursor:     disabled ? 'not-allowed' : 'pointer',
          opacity:    disabled ? 0.5 : 1,
        }}
      >
        Elegir archivo
      </button>
      <span className="text-[13px] truncate flex-1" style={{ color: fileName ? '#1A0A3B' : '#9B8FB5' }}>
        {fileName ?? placeholder}
      </span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        onChange={e => {
          const f = e.target.files?.[0] ?? null;
          setFileName(f?.name ?? null);
          onChange?.(f);
        }}
        className="hidden"
      />
    </div>
  );
};

// ─── Alert compound ───────────────────────────────────────────────────────────

OficinaModal.Alert = function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'warning' | 'info'; children: React.ReactNode }) {
  const palette = {
    danger:  { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.28)',  text: '#B91C1C', icon: '#EF4444' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.28)', text: '#92400E', icon: '#B45309' },
    info:    { bg: 'rgba(108,59,255,0.06)', border: 'rgba(108,59,255,0.24)', text: '#4A25B8', icon: '#6C3BFF' },
  }[tone];
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl text-[13px] leading-relaxed"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text, padding: '10px 12px' }}
    >
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: palette.icon }} />
      <span>{children}</span>
    </div>
  );
};

export default OficinaModal;
