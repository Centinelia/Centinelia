'use client';

/**
 * NaviAgenciaDashboard — dashboard tipo social media manager para Navi Agencia.
 *
 * Muestra una tabla portfolio con todas las cuentas IG gestionadas:
 *   - @handle | Estado | Prox. pub | Engagement 7d | Bandeja pendiente | Acciones
 *
 * Barra superior:
 *   - AccountSelector para ir al detalle de una cuenta
 *   - Botón "Vista consolidada" (this view)
 *   - Botón "Cross-account" (link)
 *
 * Carga via GET /api/portal/[token]/social/accounts?agent_id=naviId
 *
 * Props:
 *   token      — token del portal
 *   naviId     — id del agente Navi Agencia
 *   agentName  — nombre del agente (para el header)
 */

import { useEffect, useState, useCallback }  from 'react';
import { useRouter }                          from 'next/navigation';
import Link                                   from 'next/link';
import {
  RefreshCw, ExternalLink, BarChart2, Clock, Inbox, Plus,
} from 'lucide-react';
import AccountSelector, { type AccountSummary } from './AccountSelector';
import KillSwitchToggle                          from './KillSwitchToggle';

interface AccountRow extends AccountSummary {
  next_pub?:       string | null; // ISO timestamp
  pending_count?:  number;
  likes_7d?:       number | null;
  comments_7d?:    number | null;
}

interface Props {
  token:     string;
  naviId:    string;
  agentName: string | null;
}

/** Chip de estado para una cuenta */
function StatusChip({ status, paused }: { status: string; paused: boolean }) {
  let label: string;
  let bg:    string;
  let color: string;
  let border: string;

  if (paused) {
    label  = 'Pausada';
    bg     = '#FEF9C3'; color = '#A16207'; border = '#FDE047';
  } else if (status === 'active') {
    label  = 'Activa';
    bg     = '#F0FDF4'; color = '#15803D'; border = '#BBF7D0';
  } else if (status === 'needs_reauth') {
    label  = 'Reconectar';
    bg     = '#FEF2F2'; color = '#B91C1C'; border = '#FECACA';
  } else {
    label  = 'Desconectada';
    bg     = '#F3F4F6'; color = '#6B7280'; border = '#E5E7EB';
  }

  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  );
}

export default function NaviAgenciaDashboard({ token, naviId, agentName }: Props) {
  const router  = useRouter();
  const base    = `/portal/${token}/oficina/redes/${naviId}`;

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/portal/${token}/social/accounts?agent_id=${naviId}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json() as { data?: AccountRow[] };
      setAccounts(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  }, [token, naviId]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  const handleSelectAccount = (id: string | null) => {
    if (id) router.push(`${base}/cuenta/${id}`);
  };

  const accountSummaries: AccountSummary[] = accounts.map(a => ({
    id:                a.id,
    external_username: a.external_username,
    status:            a.status,
    paused:            a.paused,
  }));

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-3">
        <AccountSelector
          accounts={accountSummaries}
          currentId={null}
          onSelect={handleSelectAccount}
        />

        <span
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
          style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.2)' }}
        >
          Vista consolidada
        </span>

        <Link
          href={`${base}/cross-account`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity"
          style={{ border: '1px solid #E8E3F5', background: '#fff', color: '#1A0A3B' }}
        >
          <BarChart2 size={12} style={{ color: '#6C3BFF' }} />
          Cross-account
        </Link>

        <Link
          href={`${base}/cuentas`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity ml-auto"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          <Plus size={12} />
          Agregar cuenta
        </Link>
      </div>

      {/* Estado de carga */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: '#6B6480' }}>
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-[13px]">Cargando cuentas...</span>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-[13px]"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}
        >
          No se pudieron cargar las cuentas: {error}
        </div>
      )}

      {/* Tabla portfolio */}
      {!loading && !error && accounts.length === 0 && (
        <div
          className="rounded-2xl px-6 py-10 text-center"
          style={{ background: '#F8F7FF', border: '1px dashed rgba(108,59,255,0.25)' }}
        >
          <p className="text-[14px] font-medium" style={{ color: '#1A0A3B' }}>
            Sin cuentas en el portfolio
          </p>
          <p className="text-[12px] mt-1 mb-4" style={{ color: '#6B6480' }}>
            Agrega la primera cuenta de Instagram para comenzar.
          </p>
          <Link
            href={`${base}/cuentas`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            <Plus size={13} />
            Agregar cuenta
          </Link>
        </div>
      )}

      {!loading && !error && accounts.length > 0 && (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #E8E3F5' }}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ background: '#F8F7FF' }}>
                {['@Handle', 'Estado', 'Prox. pub.', 'Engagement 7d', 'Pendientes', 'Acciones'].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap"
                    style={{ color: '#6B6480', borderBottom: '1px solid #E8E3F5' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc, idx) => (
                <tr
                  key={acc.id}
                  style={{ borderTop: idx > 0 ? '1px solid #F0EBF8' : undefined }}
                >
                  {/* @handle */}
                  <td className="px-4 py-3">
                    <span className="text-[13px] font-medium" style={{ color: '#1A0A3B' }}>
                      {acc.external_username ? `@${acc.external_username}` : <span style={{ color: '#6B6480' }}>Sin nombre</span>}
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3">
                    <StatusChip status={acc.status} paused={acc.paused} />
                  </td>

                  {/* Prox pub */}
                  <td className="px-4 py-3">
                    {acc.next_pub ? (
                      <span className="flex items-center gap-1 text-[12px]" style={{ color: '#6B6480' }}>
                        <Clock size={11} />
                        {new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(new Date(acc.next_pub))}
                      </span>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#CBD5E1' }}>—</span>
                    )}
                  </td>

                  {/* Engagement 7d */}
                  <td className="px-4 py-3">
                    {acc.likes_7d != null || acc.comments_7d != null ? (
                      <span className="text-[12px]" style={{ color: '#1A0A3B' }}>
                        {(acc.likes_7d ?? 0).toLocaleString('es-MX')} me gusta
                        {acc.comments_7d != null && ` · ${acc.comments_7d.toLocaleString('es-MX')} com.`}
                      </span>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#CBD5E1' }}>—</span>
                    )}
                  </td>

                  {/* Pendientes de aprobacion */}
                  <td className="px-4 py-3">
                    {(acc.pending_count ?? 0) > 0 ? (
                      <span
                        className="flex items-center gap-1 text-[12px] font-semibold"
                        style={{ color: '#6C3BFF' }}
                      >
                        <Inbox size={11} />
                        {acc.pending_count}
                      </span>
                    ) : (
                      <span className="text-[12px]" style={{ color: '#CBD5E1' }}>0</span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <KillSwitchToggle
                        token={token}
                        scope="account"
                        id={acc.id}
                        currentlyPaused={acc.paused}
                        onToggle={(nowPaused) => {
                          setAccounts(prev =>
                            prev.map(a => a.id === acc.id ? { ...a, paused: nowPaused } : a),
                          );
                        }}
                      />
                      <Link
                        href={`${base}/cuenta/${acc.id}`}
                        aria-label={`Ver detalle de ${acc.external_username ?? acc.id}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-opacity whitespace-nowrap"
                        style={{ border: '1px solid #E8E3F5', background: '#fff', color: '#6C3BFF' }}
                      >
                        <ExternalLink size={11} />
                        Ver
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer con link al admin de cuentas */}
      {!loading && !error && accounts.length > 0 && (
        <div className="flex justify-end">
          <Link
            href={`${base}/cuentas`}
            className="text-[12px] font-medium"
            style={{ color: '#6C3BFF' }}
          >
            Gestionar portfolio de cuentas
          </Link>
        </div>
      )}
    </div>
  );
}
