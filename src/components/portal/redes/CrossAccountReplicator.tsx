'use client';

/**
 * CrossAccountReplicator — formulario para replicar contenido entre cuentas
 * del portfolio de un Navi Agencia.
 *
 * Flujo:
 *   1. Usuario pega un media_id o URL del post fuente.
 *   2. Selecciona las cuentas destino con checkboxes.
 *   3. Click "Replicar" llama POST /api/portal/[token]/social/replicate.
 *   4. Muestra los borradores creados o error inline.
 *
 * Props:
 *   token    — token del portal
 *   naviId   — id del agente Navi Agencia
 *   accounts — lista de cuentas del portfolio
 */

import { useState } from 'react';
import { Copy, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AccountSummary } from './AccountSelector';

interface CreatedDraft {
  id:      string;
  caption: string;
  account_id: string;
}

interface ReplicateResult {
  ok:     boolean;
  drafts: CreatedDraft[];
  error?: string;
}

interface Props {
  token:    string;
  naviId:   string;
  accounts: AccountSummary[];
}

export default function CrossAccountReplicator({ token, naviId, accounts }: Props) {
  const [sourceMediaId, setSourceMediaId]   = useState('');
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [loading, setLoading]               = useState(false);
  const [result, setResult]                 = useState<ReplicateResult | null>(null);
  const [errorMsg, setErrorMsg]             = useState<string | null>(null);

  const activeAccounts = accounts.filter(a => a.status !== 'disconnected');

  const toggleAccount = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReplicate = async () => {
    if (!sourceMediaId.trim() || selected.size === 0) return;
    setLoading(true);
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/portal/${token}/social/replicate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          agent_id:           naviId,
          source_media_id:    sourceMediaId.trim(),
          target_account_ids: Array.from(selected),
        }),
      });
      const json = await res.json() as ReplicateResult & { error?: string };

      if (!res.ok) {
        throw new Error(json.error ?? `Error ${res.status}`);
      }
      setResult(json);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al replicar contenido');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = sourceMediaId.trim().length > 0 && selected.size > 0 && !loading;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-5"
      style={{ background: '#fff', border: '1px solid #E8E3F5' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)' }}
        >
          <Copy size={15} style={{ color: '#6C3BFF' }} />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
            Replicar contenido
          </h3>
          <p className="text-[11px]" style={{ color: '#6B6480' }}>
            Adapta un post existente a otras cuentas del portfolio
          </p>
        </div>
      </div>

      {/* Campo: media ID / URL fuente */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="source-media-id"
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: '#6B6480' }}
        >
          ID o URL del contenido origen
        </label>
        <input
          id="source-media-id"
          type="text"
          value={sourceMediaId}
          onChange={e => setSourceMediaId(e.target.value)}
          placeholder="Pega el media_id o URL del post original"
          className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{
            border:     '1px solid #DDD6F5',
            background: '#FAFAFF',
            color:      '#1A0A3B',
          }}
        />
      </div>

      {/* Checkboxes: cuentas destino */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: '#6B6480' }}>
          Cuentas destino
        </p>
        {activeAccounts.length === 0 && (
          <p className="text-[12px]" style={{ color: '#6B6480' }}>
            No hay cuentas activas en el portfolio.
          </p>
        )}
        {activeAccounts.map(acc => (
          <label
            key={acc.id}
            className="flex items-center gap-2.5 cursor-pointer py-1"
          >
            <input
              type="checkbox"
              aria-label={`Cuenta ${acc.external_username ?? acc.id}`}
              checked={selected.has(acc.id)}
              onChange={() => toggleAccount(acc.id)}
              className="w-4 h-4 rounded accent-[#6C3BFF] cursor-pointer"
            />
            <span className="text-[13px]" style={{ color: '#1A0A3B' }}>
              {acc.external_username ? `@${acc.external_username}` : acc.id}
            </span>
            {acc.paused && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{ background: '#FEF9C3', color: '#A16207' }}
              >
                pausada
              </span>
            )}
          </label>
        ))}
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12px]"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}
        >
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {errorMsg}
        </div>
      )}

      {/* Resultado */}
      {result && result.ok && (
        <div
          className="flex flex-col gap-2 rounded-lg px-3 py-3"
          style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}
        >
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={14} style={{ color: '#15803D' }} />
            <p className="text-[12px] font-semibold" style={{ color: '#15803D' }}>
              {result.drafts.length} {result.drafts.length === 1 ? 'borrador creado' : 'borradores creados'}
            </p>
          </div>
          <ul className="flex flex-col gap-1 pl-1">
            {result.drafts.map(d => (
              <li key={d.id} className="text-[11px]" style={{ color: '#1A0A3B' }}>
                Cuenta {accounts.find(a => a.id === d.account_id)?.external_username ?? d.account_id}:{' '}
                <span style={{ color: '#6B6480' }}>{d.caption?.slice(0, 60)}{(d.caption?.length ?? 0) > 60 ? '...' : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Botón submit */}
      <button
        onClick={handleReplicate}
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-40 w-full"
        style={{ background: '#6C3BFF', color: '#fff' }}
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> Replicando...</>
          : <><Copy size={14} /> Replicar en {selected.size > 0 ? `${selected.size} cuentas` : 'cuentas seleccionadas'}</>
        }
      </button>
    </div>
  );
}
