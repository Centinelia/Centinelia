'use client';

/**
 * AccountsGrid — tabla de cuentas del portfolio con acciones de eliminar.
 *
 * Soft delete: llama DELETE /api/portal/[token]/social/accounts/[id]
 * El endpoint actualiza status='disconnected', no borra el row.
 */

import { useState }      from 'react';
import Link              from 'next/link';
import { Trash2, AtSign, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';

interface AccountRow {
  id:                string;
  external_username: string | null;
  status:            string;
  paused:            boolean;
  paused_reason?:    string | null;
  created_at:        string;
}

interface Props {
  token:            string;
  naviId:           string;
  initialAccounts:  AccountRow[];
  connectUrl:       string;
}

function statusInfo(row: AccountRow): { label: string; icon: React.ReactNode } {
  if (row.status === 'disconnected') return {
    label: 'Desconectada',
    icon:  <XCircle size={13} style={{ color: '#6B7280' }} />,
  };
  if (row.status === 'needs_reauth') return {
    label: 'Token vencido',
    icon:  <AlertCircle size={13} style={{ color: '#B91C1C' }} />,
  };
  if (row.paused) return {
    label: 'Pausada',
    icon:  <AlertCircle size={13} style={{ color: '#A16207' }} />,
  };
  return {
    label: 'Activa',
    icon:  <CheckCircle2 size={13} style={{ color: '#15803D' }} />,
  };
}

export default function AccountsGrid({ token, naviId, initialAccounts, connectUrl }: Props) {
  const [accounts,  setAccounts]  = useState(initialAccounts);
  const [deleting,  setDeleting]  = useState<Set<string>>(new Set());
  const [errorMap,  setErrorMap]  = useState<Record<string, string>>({});

  const handleDelete = async (id: string) => {
    if (!window.confirm('Se desconectara esta cuenta. El historial se conserva. Continuar?')) return;
    setDeleting(prev => new Set(prev).add(id));
    setErrorMap(prev => { const n = { ...prev }; delete n[id]; return n; });

    try {
      const res = await fetch(`/api/portal/${token}/social/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error ?? `Error ${res.status}`);
      }
      // Actualizar local: cambiar status a 'disconnected'
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: 'disconnected', paused: true } : a));
    } catch (err) {
      setErrorMap(prev => ({ ...prev, [id]: err instanceof Error ? err.message : 'Error al eliminar' }));
    } finally {
      setDeleting(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const base = `/portal/${token}/oficina/redes/${naviId}`;

  if (accounts.length === 0) {
    return (
      <div
        className="rounded-2xl px-6 py-10 text-center"
        style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
      >
        <AtSign size={28} style={{ color: '#9B6DFF', margin: '0 auto 8px' }} />
        <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
          Sin cuentas en el portfolio
        </p>
        <p className="text-[12px] mt-1 mb-4" style={{ color: '#6B6480' }}>
          Conecta la primera cuenta de Instagram para que Navi Agencia comience a gestionarla.
        </p>
        <a
          href={connectUrl}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          Conectar Instagram
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {accounts.map(acc => {
        const { label, icon } = statusInfo(acc);
        const isDisconnected  = acc.status === 'disconnected';

        return (
          <div
            key={acc.id}
            className="flex items-center gap-4 rounded-xl px-4 py-3"
            style={{
              background: isDisconnected ? '#FAFAFA' : '#fff',
              border:     `1px solid ${isDisconnected ? '#E5E7EB' : '#E8E3F5'}`,
              opacity:    isDisconnected ? 0.7 : 1,
            }}
          >
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.08)', border: '1px solid rgba(108,59,255,0.15)' }}
            >
              <AtSign size={16} style={{ color: '#6C3BFF' }} />
            </div>

            {/* Handle + estado */}
            <div className="flex flex-col min-w-0 flex-1">
              <p className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
                {acc.external_username ? `@${acc.external_username}` : 'Sin nombre'}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                {icon}
                <span className="text-[11px]" style={{ color: '#6B6480' }}>{label}</span>
                {acc.paused_reason && (
                  <span className="text-[11px]" style={{ color: '#6B6480' }}>
                    — {acc.paused_reason}
                  </span>
                )}
              </div>
              {errorMap[acc.id] && (
                <p className="text-[11px] mt-0.5" style={{ color: '#B91C1C' }}>
                  {errorMap[acc.id]}
                </p>
              )}
            </div>

            {/* Acciones */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isDisconnected && (
                <Link
                  href={`${base}/cuenta/${acc.id}`}
                  className="px-3 py-1.5 rounded-md text-[11px] font-medium"
                  style={{ border: '1px solid #DDD6F5', background: '#F8F7FF', color: '#6C3BFF' }}
                >
                  Ver detalle
                </Link>
              )}
              {!isDisconnected && (
                <button
                  onClick={() => handleDelete(acc.id)}
                  disabled={deleting.has(acc.id)}
                  aria-label={`Desconectar cuenta ${acc.external_username ?? acc.id}`}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity disabled:opacity-40"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
                >
                  <Trash2 size={13} style={{ color: '#B91C1C' }} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
