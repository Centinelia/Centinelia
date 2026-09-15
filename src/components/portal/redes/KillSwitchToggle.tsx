'use client';

/**
 * KillSwitchToggle — pausa o reactiva publicaciones de Navi.
 *
 * Scope puede ser 'navi' (por agent_id) o 'account' (por social_account_id).
 * Al cambiar estado abre un diálogo de confirmación que solicita motivo opcional.
 *
 * Llama a:
 *   POST /api/portal/[token]/social/pause  body: { agent_id|social_account_id, reason }
 *   POST /api/portal/[token]/social/resume body: { agent_id|social_account_id }
 */
import { useState } from 'react';
import { Pause, Play, AlertTriangle } from 'lucide-react';

interface Props {
  token:            string;
  scope:            'navi' | 'account';
  /** agent_id si scope='navi', social_account_id si scope='account' */
  id:               string;
  /** Razón inicial (opcional) */
  reason?:          string;
  /** Estado actual — viene del server component */
  currentlyPaused:  boolean;
  /** Callback que se dispara después de un toggle exitoso */
  onToggle?:        (nowPaused: boolean) => void;
}

interface ConfirmDialogProps {
  action:   'pause' | 'resume';
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  isLoading: boolean;
}

function ConfirmDialog({ action, onCancel, onConfirm, isLoading }: ConfirmDialogProps) {
  const [reason, setReason] = useState('');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={action === 'pause' ? 'Confirmar pausa' : 'Confirmar reactivación'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4"
        style={{ background: '#fff', border: '1px solid #E8E3F5', boxShadow: '0 8px 32px rgba(26,10,59,0.14)' }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: action === 'pause' ? '#FEF2F2' : '#F0FDF4',
              border:     action === 'pause' ? '1px solid #FECACA' : '1px solid #BBF7D0',
            }}
          >
            <AlertTriangle
              size={16}
              strokeWidth={2}
              style={{ color: action === 'pause' ? '#B91C1C' : '#15803D' }}
            />
          </div>
          <div>
            <p className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
              {action === 'pause'
                ? 'Pausar publicaciones'
                : 'Reactivar publicaciones'}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: '#6B6480' }}>
              {action === 'pause'
                ? 'Navi dejará de publicar hasta que la reactives.'
                : 'Navi retomará publicaciones según el calendario.'}
            </p>
          </div>
        </div>

        {action === 'pause' && (
          <div className="flex flex-col gap-1">
            <label
              htmlFor="kill-switch-reason"
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: '#6B6480' }}
            >
              Motivo (opcional)
            </label>
            <input
              id="kill-switch-reason"
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej. mantenimiento del negocio"
              className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
              style={{
                border:     '1px solid #DDD6F5',
                background: '#FAFAFF',
                color:      '#1A0A3B',
              }}
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50"
            style={{ background: '#F3F0FF', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={isLoading}
            className="px-4 py-1.5 rounded-md text-[12px] font-semibold transition-opacity disabled:opacity-50"
            style={{
              background: action === 'pause' ? '#B91C1C' : '#15803D',
              color:      '#fff',
            }}
          >
            {isLoading ? 'Procesando...' : action === 'pause' ? 'Pausar' : 'Reactivar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KillSwitchToggle({
  token, scope, id, reason, currentlyPaused, onToggle,
}: Props) {
  const [paused,         setPaused]         = useState(currentlyPaused);
  const [showDialog,     setShowDialog]     = useState(false);
  const [pendingAction,  setPendingAction]  = useState<'pause' | 'resume' | null>(null);
  const [isLoading,      setIsLoading]      = useState(false);
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null);

  const handleToggleClick = () => {
    setErrorMsg(null);
    setPendingAction(paused ? 'resume' : 'pause');
    setShowDialog(true);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingAction(null);
  };

  const handleConfirm = async (confirmReason: string) => {
    if (!pendingAction) return;
    setIsLoading(true);
    try {
      const body: Record<string, string> =
        scope === 'navi'
          ? { agent_id: id }
          : { social_account_id: id };

      if (pendingAction === 'pause' && confirmReason.trim()) {
        body.reason = confirmReason.trim();
      }

      const endpoint = pendingAction === 'pause' ? 'pause' : 'resume';
      const res = await fetch(`/api/portal/${token}/social/${endpoint}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Error ${res.status}`);
      }

      const nowPaused = pendingAction === 'pause';
      setPaused(nowPaused);
      setShowDialog(false);
      setPendingAction(null);
      onToggle?.(nowPaused);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al cambiar estado');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {showDialog && pendingAction && (
        <ConfirmDialog
          action={pendingAction}
          onCancel={handleCancel}
          onConfirm={handleConfirm}
          isLoading={isLoading}
        />
      )}

      <div
        className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
        style={{
          background: paused ? '#FEF2F2' : '#F0FDF4',
          border:     paused ? '1px solid #FECACA' : '1px solid #BBF7D0',
        }}
      >
        <div className="flex items-center gap-2.5">
          {paused
            ? <Pause  size={16} style={{ color: '#B91C1C' }} />
            : <Play   size={16} style={{ color: '#15803D' }} />
          }
          <div>
            <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
              {paused ? 'Publicaciones pausadas' : 'Publicaciones activas'}
            </p>
            {paused && reason && (
              <p className="text-[11px]" style={{ color: '#6B6480' }}>
                Motivo: {reason}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleToggleClick}
            disabled={isLoading}
            aria-label={paused ? 'Reactivar publicaciones' : 'Pausar publicaciones'}
            aria-pressed={paused}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-opacity disabled:opacity-50"
            style={{
              background: paused ? '#15803D' : '#B91C1C',
              color:      '#fff',
            }}
          >
            {paused ? 'Reactivar' : 'Pausar'}
          </button>
          {errorMsg && (
            <p className="text-[10px]" style={{ color: '#B91C1C' }}>
              {errorMsg}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
