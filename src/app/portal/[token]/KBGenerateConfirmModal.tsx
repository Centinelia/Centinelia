'use client';

import { useEffect } from 'react';
import { X, Columns3, Award, Zap, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';

export type KBGenerateVariant = 'compare' | 'auto';
export type KBGenerateKind    = 'business' | 'role';

interface Props {
  open:         boolean;
  onClose:      () => void;
  onConfirm:    () => void;
  variant:      KBGenerateVariant;
  kind:         KBGenerateKind;
  hasExisting:  boolean;
  accentColor?: string;
  loading?:     boolean;
}

const COPY: Record<KBGenerateVariant, { title: string; subtitle: string; primary: string; Icon: typeof Columns3 }> = {
  compare: {
    title:    'Comparar 3 estilos',
    subtitle: 'Generaremos 3 versiones para que elijas la que mejor se acomode.',
    primary:  'Sí, comparar variantes',
    Icon:     Columns3,
  },
  auto: {
    title:    'Elegir la mejor automáticamente',
    subtitle: 'Generaremos 3 versiones y un revisor experto elegirá la mejor por ti.',
    primary:  'Sí, generar y elegir',
    Icon:     Award,
  },
};

export default function KBGenerateConfirmModal({
  open,
  onClose,
  onConfirm,
  variant,
  kind,
  hasExisting,
  accentColor = '#6C3BFF',
  loading = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, loading]);

  if (!open) return null;

  const { title, subtitle, primary, Icon } = COPY[variant];
  const noun = kind === 'business' ? 'el manual de la organización' : 'las instrucciones del puesto';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-150"
      style={{ background: 'rgba(15,5,34,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={() => { if (!loading) onClose(); }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-3xl overflow-hidden animate-in zoom-in-95 duration-150"
        style={{
          background: '#ffffff',
          boxShadow: '0 24px 80px rgba(15,5,34,0.35), 0 0 0 1px rgba(232,227,245,0.5)',
        }}
      >
        {/* Header con gradient de acento */}
        <div
          className="relative px-6 pt-6 pb-5"
          style={{
            background: `linear-gradient(135deg, ${accentColor}1F 0%, ${accentColor}0A 60%, #ffffff 100%)`,
            borderBottom: '1px solid #F0EDF9',
          }}
        >
          <button
            onClick={onClose}
            disabled={loading}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[#F0EDF9] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={16} style={{ color: '#6B6480' }} />
          </button>

          <div className="flex items-start gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${accentColor}1A`, border: `1px solid ${accentColor}3D` }}
            >
              <Icon size={22} style={{ color: accentColor }} strokeWidth={2} />
            </div>
            <div className="flex flex-col gap-1 pt-0.5 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accentColor, letterSpacing: '0.08em' }}>
                Confirmar acción
              </p>
              <p className="text-[17px] font-semibold leading-tight" style={{ color: '#1A0A3B' }}>
                {title}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="text-[13px] leading-relaxed" style={{ color: '#6B6480' }}>
            {subtitle}
          </p>

          {/* Cost breakdown */}
          <div className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}33` }}>
              <Zap size={16} style={{ color: accentColor }} strokeWidth={2} fill={accentColor} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                Consumo: 3 tareas
              </p>
              <p className="text-[12px]" style={{ color: '#6B6480' }}>
                Se descontarán del pool mensual de tu plan.
              </p>
            </div>
          </div>

          {/* Warning si reemplaza */}
          {hasExisting && (
            <div className="flex items-start gap-3 rounded-xl px-4 py-3"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)' }}>
                {variant === 'compare'
                  ? <AlertTriangle size={16} style={{ color: '#B45309' }} strokeWidth={2} />
                  : <RefreshCw     size={16} style={{ color: '#B45309' }} strokeWidth={2} />}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: '#92400E' }}>
                  {variant === 'compare' ? 'Reemplazará el contenido actual' : 'Reemplazará el contenido actual'}
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: '#78350F' }}>
                  {variant === 'compare'
                    ? `Al elegir una de las 3 variantes, sobreescribirá ${noun}. No se puede deshacer.`
                    : `La variante ganadora sobreescribirá ${noun}. No se puede deshacer.`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ background: '#FAFAFB', borderTop: '1px solid #F0EDF9' }}>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-colors hover:bg-[#F0EDF9] disabled:opacity-50"
            style={{ color: '#6B6480', background: 'transparent' }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: accentColor,
              color: '#ffffff',
              boxShadow: `0 4px 12px ${accentColor}55`,
            }}
          >
            {loading ? <><Loader2 size={13} className="animate-spin" />Generando</> : primary}
          </button>
        </div>
      </div>
    </div>
  );
}
