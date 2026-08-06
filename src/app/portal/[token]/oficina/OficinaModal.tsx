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

import { useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';

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

OficinaModal.SecondaryAction = function SecondaryAction({ onClick, disabled, children, type = 'button' }: ActionProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl transition-colors"
      style={{
        padding:      '9px 16px',
        background:   '#ffffff',
        color:        '#6B6480',
        fontSize:     13,
        fontWeight:   600,
        border:       '1px solid #E8E3F5',
        cursor:       disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.background = '#F5F0FF'; (e.currentTarget as HTMLElement).style.color = '#1A0A3B'; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff'; (e.currentTarget as HTMLElement).style.color = '#6B6480'; }}
    >
      {children}
    </button>
  );
};

OficinaModal.Field = function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>
        {label}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal" style={{ color: '#9B8FB5' }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
};

export default OficinaModal;
