'use client';

/**
 * AccountSelector — combobox de cuentas sociales gestionadas por Navi Agencia.
 *
 * Se usa en NaviAgenciaDashboard y páginas de agencia para cambiar de cuenta
 * rápidamente sin recargar la página entera.
 *
 * Props:
 *   accounts    — lista de SocialAccount del portfolio del agente.
 *   currentId   — id de la cuenta actualmente seleccionada, o null = todas.
 *   onSelect    — callback(id | null) cuando el usuario cambia de opción.
 */

import { Users, AtSign, ChevronDown } from 'lucide-react';

export interface AccountSummary {
  id:                string;
  external_username: string | null;
  status:            'active' | 'needs_reauth' | 'disconnected' | string;
  paused:            boolean;
}

interface Props {
  accounts:  AccountSummary[];
  currentId: string | null;
  onSelect:  (id: string | null) => void;
}

/** Mapea status a color del chip */
function statusColor(status: string, paused: boolean): string {
  if (paused)                  return '#F59E0B'; // amarillo
  if (status === 'active')     return '#15803D'; // verde
  if (status === 'needs_reauth') return '#B91C1C'; // rojo
  return '#6B6480'; // gris (disconnected)
}

export default function AccountSelector({ accounts, currentId, onSelect }: Props) {
  const current = accounts.find(a => a.id === currentId) ?? null;

  return (
    <div className="relative inline-flex items-center gap-1">
      <div
        className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg cursor-pointer select-none"
        style={{ border: '1px solid #DDD6F5', background: '#F8F7FF', minWidth: 180 }}
      >
        {/* Ícono e identificador de cuenta actual */}
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: current ? 'rgba(108,59,255,0.12)' : '#F0EBF8' }}
        >
          {current
            ? <AtSign size={11} style={{ color: '#6C3BFF' }} />
            : <Users  size={11} style={{ color: '#6B6480' }} />
          }
        </div>

        <select
          aria-label="Seleccionar cuenta"
          value={currentId ?? ''}
          onChange={e => onSelect(e.target.value === '' ? null : e.target.value)}
          className="appearance-none bg-transparent text-[12px] font-medium outline-none flex-1 cursor-pointer"
          style={{ color: '#1A0A3B' }}
        >
          <option value="">Todas las cuentas</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.external_username ? `@${acc.external_username}` : 'Sin nombre'}
              {acc.paused ? ' (pausada)' : acc.status === 'needs_reauth' ? ' (reconectar)' : ''}
            </option>
          ))}
        </select>

        <ChevronDown size={12} style={{ color: '#6B6480', flexShrink: 0 }} />
      </div>

      {/* Indicador de estado de la cuenta actual */}
      {current && (
        <span
          aria-label={`Estado: ${current.status}`}
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: statusColor(current.status, current.paused) }}
        />
      )}
    </div>
  );
}
