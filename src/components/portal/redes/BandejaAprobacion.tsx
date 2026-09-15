'use client';

/**
 * BandejaAprobacion — bandeja de borradores pendientes de aprobación.
 *
 * Carga borradores con status=pending_approval para el naviId dado.
 * Permite aprobar, rechazar o editar cada borrador llamando al endpoint
 * PATCH /api/portal/[token]/social/drafts/[id].
 *
 * Gating: se espera que el server component padre ya verificó el feature flag
 * y la sesión. Este cliente asume acceso concedido.
 */
import { useEffect, useState, useCallback } from 'react';
import { Check, X, Edit3, RefreshCw } from 'lucide-react';
import DraftPreview, { type ContentDraft } from './DraftPreview';

interface Props {
  token:            string;
  naviId:           string;
  /** Si se especifica, filtra por cuenta social (agencia multi-cuenta). */
  socialAccountId?: string;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

interface DraftRowState {
  draft:       ContentDraft;
  actionState: ActionState;
  errorMsg?:   string;
}

export default function BandejaAprobacion({ token, naviId, socialAccountId }: Props) {
  const [rows,    setRows]    = useState<DraftRowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        status:   'pending_approval',
        agent_id: naviId,
        ...(socialAccountId ? { target_account_id: socialAccountId } : {}),
      });
      const res = await fetch(`/api/portal/${token}/social/drafts?${qs}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setRows(
        ((json.data ?? []) as ContentDraft[]).map(d => ({ draft: d, actionState: 'idle' as ActionState })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar borradores');
    } finally {
      setLoading(false);
    }
  }, [token, naviId, socialAccountId]);

  useEffect(() => { void loadDrafts(); }, [loadDrafts]);

  const handleAction = useCallback(
    async (id: string, action: 'approve' | 'reject') => {
      setRows(prev =>
        prev.map(r => r.draft.id === id ? { ...r, actionState: 'loading' } : r),
      );
      try {
        const res = await fetch(`/api/portal/${token}/social/drafts/${id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `Error ${res.status}`);
        }
        // Quitar de la lista tras acción exitosa
        setRows(prev => prev.filter(r => r.draft.id !== id));
      } catch (err) {
        setRows(prev =>
          prev.map(r =>
            r.draft.id === id
              ? { ...r, actionState: 'error', errorMsg: err instanceof Error ? err.message : 'Error' }
              : r,
          ),
        );
      }
    },
    [token],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-2" style={{ color: '#6B6480' }}>
        <RefreshCw size={16} className="animate-spin" />
        <span className="text-[13px]">Cargando borradores...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg px-4 py-3 text-[13px]"
        style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}
      >
        No se pudieron cargar los borradores: {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl px-5 py-8 text-center"
        style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
      >
        <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
          Sin borradores pendientes
        </p>
        <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
          Navi no ha generado contenido nuevo por revisar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ color: '#6B6480' }}>
          Pendientes de aprobación
        </h3>
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}
        >
          {rows.length}
        </span>
      </div>

      {rows.map(({ draft, actionState, errorMsg }) => (
        <div key={draft.id} className="flex flex-col gap-2">
          <DraftPreview draft={draft} showStatus={false} />

          {/* Botones de acción */}
          <div className="flex gap-2 justify-end">
            {actionState === 'error' && (
              <p className="text-[11px] self-center mr-auto" style={{ color: '#EF4444' }}>
                {errorMsg}
              </p>
            )}

            <button
              onClick={() => handleAction(draft.id, 'reject')}
              disabled={actionState === 'loading'}
              aria-label="Rechazar borrador"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}
            >
              <X size={12} strokeWidth={2} />
              Rechazar
            </button>

            <button
              onClick={() => {
                // Edición: redirige a la sub-página de edición (Task 13) o abre modal futuro.
                // Por ahora abre el draft en modo edit en la misma página.
                const newCaption = window.prompt('Editar caption:', draft.caption ?? '');
                if (newCaption === null) return;
                void (async () => {
                  setRows(prev => prev.map(r => r.draft.id === draft.id ? { ...r, actionState: 'loading' } : r));
                  try {
                    const res = await fetch(`/api/portal/${token}/social/drafts/${draft.id}`, {
                      method:  'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body:    JSON.stringify({ action: 'edit', caption: newCaption }),
                    });
                    if (!res.ok) throw new Error(`Error ${res.status}`);
                    const json = await res.json();
                    setRows(prev =>
                      prev.map(r =>
                        r.draft.id === draft.id
                          ? { ...r, draft: { ...r.draft, caption: json.data?.caption ?? newCaption }, actionState: 'idle' }
                          : r,
                      ),
                    );
                  } catch (err) {
                    setRows(prev =>
                      prev.map(r =>
                        r.draft.id === draft.id
                          ? { ...r, actionState: 'error', errorMsg: err instanceof Error ? err.message : 'Error' }
                          : r,
                      ),
                    );
                  }
                })();
              }}
              disabled={actionState === 'loading'}
              aria-label="Editar borrador"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#F3F0FF', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
            >
              <Edit3 size={12} strokeWidth={2} />
              Editar
            </button>

            <button
              onClick={() => handleAction(draft.id, 'approve')}
              disabled={actionState === 'loading'}
              aria-label="Aprobar borrador"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-opacity disabled:opacity-50"
              style={{ background: '#6C3BFF', color: '#fff' }}
            >
              <Check size={12} strokeWidth={2.5} />
              {actionState === 'loading' ? 'Procesando...' : 'Aprobar'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
