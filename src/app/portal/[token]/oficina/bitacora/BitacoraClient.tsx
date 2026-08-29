'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { IncidentRow } from './loadBitacoraData';

interface InitialData {
  enabled:   boolean;
  agent:     { id: string; business_name: string };
  weekStart: string;
  incidents: IncidentRow[];
}

interface Props {
  token:   string;
  initial: InitialData;
}

// L M MI J V S — columnas de la semana (lunes a sabado)
const DAYS = ['L', 'M', 'MI', 'J', 'V', 'S'];

function rowColorClass(inc: IncidentRow): string {
  if (inc.is_new_client) return 'text-blue-700';
  if (inc.verification_result === 'no_visitado') return 'text-red-700';
  if (inc.verification_result === 'sin_respuesta') return 'text-gray-500';
  return 'text-gray-900';
}

/** Retorna el indice (0=L … 5=S) del dia en que se verifico, o null si no aplica. */
function okDayIndex(inc: IncidentRow): number | null {
  if (inc.verification_result !== 'ok' || !inc.verification_called_at) return null;
  const day = new Date(inc.verification_called_at).getDay(); // 0=dom
  const idx  = day === 0 ? 6 : day - 1;                      // 0=lun
  return idx < DAYS.length ? idx : null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

function formatWeekLabel(isoMonday: string): string {
  const start = new Date(isoMonday);
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`;
}

function prevMonday(isoMonday: string): string {
  const d = new Date(isoMonday);
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function nextMonday(isoMonday: string): string {
  const d = new Date(isoMonday);
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

const RESULT_LABEL: Record<string, string> = {
  ok:           'OK',
  no_visitado:  'No visitado',
  sin_respuesta: 'Sin respuesta',
};

export function BitacoraClient({ token, initial }: Props) {
  const router    = useRouter();
  const [incidents, setIncidents] = useState(initial.incidents);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  function navigate(weekIso: string) {
    router.push(`/portal/${token}/oficina/bitacora?week=${encodeURIComponent(weekIso)}`);
  }

  async function updateVendedor(id: string, vendedor: string) {
    setSaving(id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/vendedor`, {
        method:  'PATCH',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ id, vendedor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'No se pudo guardar');
      }
      setIncidents(prev =>
        prev.map(i => i.id === id ? { ...i, vendedor: vendedor || null } : i),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const weekLabel = formatWeekLabel(initial.weekStart);

  return (
    <div className="flex flex-col gap-4">

      {/* Week navigator */}
      <div
        className="flex items-center justify-between px-4 py-2 rounded-xl"
        style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
      >
        <button
          type="button"
          onClick={() => navigate(prevMonday(initial.weekStart))}
          className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded transition-opacity hover:opacity-75"
          style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.07)', border: 'none', cursor: 'pointer' }}
        >
          <ChevronLeft size={14} /> Semana anterior
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
          {weekLabel}
        </span>
        <button
          type="button"
          onClick={() => navigate(nextMonday(initial.weekStart))}
          className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded transition-opacity hover:opacity-75"
          style={{ color: '#6C3BFF', background: 'rgba(108,59,255,0.07)', border: 'none', cursor: 'pointer' }}
        >
          Semana siguiente <ChevronRight size={14} />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          <XCircle size={12} />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {incidents.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: '#FAFAFB', border: '1px dashed #E8E3F5' }}
        >
          <ClipboardList size={20} style={{ color: '#9B8FB5', margin: '0 auto 8px' }} />
          <p className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>
            Sin incidencias esta semana
          </p>
          <p className="text-xs mt-1" style={{ color: '#6B6480' }}>
            No se registraron incidencias de clientes en el periodo seleccionado.
          </p>
        </div>
      ) : (
        /* Table */
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid #E8E3F5', background: '#ffffff' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th
                    colSpan={10}
                    className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: '#FEF9C3', color: '#854D0E', borderBottom: '1px solid #E8E3F5' }}
                  >
                    Datos del cliente
                  </th>
                  <th
                    colSpan={DAYS.length}
                    className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: '#F0FDF4', color: '#166534', borderBottom: '1px solid #E8E3F5' }}
                  >
                    Seguimiento semanal
                  </th>
                </tr>
                <tr style={{ background: '#FAFAFB' }}>
                  {[
                    'Fecha', 'Tipo', 'Verificacion', 'Negocio', 'Cliente',
                    'Direccion', 'Telefono', 'Motivo', 'Resultado', 'Vendedor',
                  ].map(h => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                      style={{ color: '#6B6480', borderBottom: '1px solid #E8E3F5' }}
                    >
                      {h}
                    </th>
                  ))}
                  {DAYS.map(d => (
                    <th
                      key={d}
                      className="px-2 py-2 text-center font-semibold w-8"
                      style={{ color: '#6B6480', borderBottom: '1px solid #E8E3F5' }}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc, idx) => {
                  const okIdx  = okDayIndex(inc);
                  const isSaving = saving === inc.id;
                  return (
                    <tr
                      key={inc.id}
                      className={rowColorClass(inc)}
                      style={{
                        borderBottom: idx < incidents.length - 1 ? '1px solid #F1EDF9' : 'none',
                        background:   idx % 2 === 0 ? '#ffffff' : '#FAFAFB',
                      }}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatDate(inc.created_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {inc.type === 'alta' ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#DCFCE7', color: '#166534' }}>
                            Alta
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                            Queja
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {inc.verification_scheduled_at ? formatDate(inc.verification_scheduled_at) : <span style={{ color: '#9B8FB5' }}>—</span>}
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[160px]">
                        <div className="truncate">{inc.business_name}</div>
                        {inc.sucursal && (
                          <div className="text-[10px] font-normal truncate" style={{ color: '#6B6480' }}>
                            Suc. {inc.sucursal}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[120px] truncate">
                        {inc.contact_name ?? <span style={{ color: '#9B8FB5' }}>Sin nombre</span>}
                      </td>
                      <td className="px-3 py-2 max-w-[160px] truncate">
                        {inc.address}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {inc.contact_phone}
                      </td>
                      <td className="px-3 py-2 max-w-[160px] truncate">
                        {inc.motivo ?? <span style={{ color: '#9B8FB5' }}>—</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {inc.type === 'alta' ? (
                          <span className="flex items-center gap-1" style={{ color: '#9B8FB5' }}>—</span>
                        ) : inc.verification_result ? (
                          <span className="flex items-center gap-1">
                            {inc.verification_result === 'ok' && (
                              <CheckCircle size={11} style={{ color: '#16a34a' }} />
                            )}
                            {RESULT_LABEL[inc.verification_result] ?? inc.verification_result}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1" style={{ color: '#9B8FB5' }}>
                            <Clock size={10} /> Pendiente
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          defaultValue={inc.vendedor ?? ''}
                          placeholder="Sin asignar"
                          disabled={isSaving}
                          className="w-24 text-xs px-1.5 py-0.5 rounded outline-none transition-colors disabled:opacity-50"
                          style={{
                            background:   '#ffffff',
                            border:       '1px solid #E8E3F5',
                            color:        '#1A0A3B',
                            fontFamily:   'inherit',
                          }}
                          onFocus={e => {
                            (e.target as HTMLInputElement).style.borderColor = '#6C3BFF';
                          }}
                          onBlur={e => {
                            (e.target as HTMLInputElement).style.borderColor = '#E8E3F5';
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val !== (inc.vendedor ?? '')) {
                              updateVendedor(inc.id, val);
                            }
                          }}
                        />
                      </td>
                      {DAYS.map((_, i) => (
                        <td
                          key={i}
                          className="px-2 py-2 text-center font-bold text-[10px]"
                          style={{ color: okIdx === i ? '#16a34a' : 'transparent' }}
                        >
                          {okIdx === i ? 'OK' : '.'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className="px-4 py-2 text-[10px]"
            style={{ color: '#9B8FB5', borderTop: '1px solid #F1EDF9' }}
          >
            {incidents.length} {incidents.length === 1 ? 'incidencia' : 'incidencias'} en esta semana.
            <span style={{ color: '#1D4ED8' }}> Azul</span> = cliente nuevo.
            <span style={{ color: '#DC2626' }}> Rojo</span> = no visitado.
            <span style={{ color: '#6B7280' }}> Gris</span> = sin respuesta.
          </div>
        </div>
      )}
    </div>
  );
}
