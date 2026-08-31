'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardList, CheckCircle, XCircle, Clock, X, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { IncidentRow, VerificationAttempt, BitacoraKpis, UpcomingCallback } from './loadBitacoraData';

interface InitialData {
  enabled:   boolean;
  agent:     { id: string; business_name: string };
  weekStart: string;
  incidents: IncidentRow[];
  kpis?:     BitacoraKpis;
  upcoming?: UpcomingCallback[];
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

const RESULT_LABEL_LONG: Record<string, string> = {
  ok:            'Recibió pedido',
  no_visitado:   'Vendedor no ha ido',
  sin_respuesta: 'No contestó',
};

const RESULT_COLOR: Record<string, string> = {
  ok:            '#16a34a',
  no_visitado:   '#DC2626',
  sin_respuesta: '#6B6480',
};

export function BitacoraClient({ token, initial }: Props) {
  const router    = useRouter();
  const [incidents, setIncidents] = useState(initial.incidents);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [attemptsModal, setAttemptsModal] = useState<{ incident: IncidentRow } | null>(null);

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
  const kpis = initial.kpis;
  const upcoming = initial.upcoming ?? [];

  return (
    <div className="flex flex-col gap-4">

      {/* KPI bar */}
      {kpis && kpis.total > 0 && (
        <div
          className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 rounded-xl"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
        >
          <KpiCell label="Total" value={kpis.total} color="#1A0A3B" />
          <KpiCell label="Verificados OK" value={kpis.ok} color="#16a34a" />
          <KpiCell label="Pendientes" value={kpis.pendiente} color="#B45309" />
          <KpiCell label="Necesitan atención" value={kpis.rojo} color="#DC2626" />
          <KpiCell label="Escalados a humano" value={kpis.escalados} color="#7C2D12" />
        </div>
      )}

      {/* Upcoming callbacks */}
      {upcoming.length > 0 && (
        <div
          className="p-3 rounded-xl"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} style={{ color: '#6C3BFF' }} />
            <h3 className="text-xs font-bold" style={{ color: '#1A0A3B' }}>Próximas llamadas de verificación</h3>
          </div>
          <div className="flex flex-col gap-1">
            {upcoming.map(u => {
              const when = new Date(u.scheduled_at);
              const dateStr = when.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
              const timeStr = when.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={u.incident_id} className="flex items-center justify-between text-[11px] py-1">
                  <div className="flex-1 min-w-0 truncate" style={{ color: '#1A0A3B' }}>
                    <strong>{u.business}</strong>
                    {u.contact_name && <span style={{ color: '#6B6480' }}> · {u.contact_name}</span>}
                  </div>
                  <div className="flex items-center gap-3 whitespace-nowrap ml-2">
                    <span style={{ color: '#6B6480' }}>{u.telefono}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF' }}
                    >
                      intento {u.attempt_num}
                    </span>
                    <span className="capitalize" style={{ color: '#1A0A3B' }}>{dateStr} {timeStr}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                            {(inc.verification_attempts?.length ?? 0) > 1 && (
                              <button
                                type="button"
                                onClick={() => setAttemptsModal({ incident: inc })}
                                title={`Ver los ${inc.verification_attempts.length} intentos`}
                                className="ml-1 px-1 py-0.5 rounded text-[9px] font-semibold hover:opacity-80"
                                style={{ background: 'rgba(108,59,255,0.1)', color: '#6C3BFF', border: 'none', cursor: 'pointer' }}
                              >
                                {inc.verification_attempts.length}×
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1" style={{ color: '#9B8FB5' }}>
                            <Clock size={10} /> Pendiente
                          </span>
                        )}
                        {inc.next_callback_at && inc.next_callback_status === 'pending' && (
                          <div className="text-[9px] mt-0.5 italic" style={{ color: '#6B6480' }}>
                            <Clock size={8} style={{ display: 'inline', marginRight: 2 }} />
                            próxima llamada {new Date(inc.next_callback_at).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </div>
                        )}
                        {inc.next_callback_status === 'failed' && (
                          <div className="text-[9px] mt-0.5 font-semibold" style={{ color: '#DC2626' }}>
                            escalado a humano (máx intentos)
                          </div>
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

      {attemptsModal && (
        <AttemptsModal
          incident={attemptsModal.incident}
          onClose={() => setAttemptsModal(null)}
        />
      )}
    </div>
  );
}

function KpiCell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-1">
      <span className="text-lg font-bold" style={{ color }}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: '#6B6480' }}>{label}</span>
    </div>
  );
}

function AttemptsModal({ incident, onClose }: { incident: IncidentRow; onClose: () => void }) {
  const attempts = incident.verification_attempts ?? [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl p-5"
        style={{ background: '#ffffff' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold" style={{ color: '#1A0A3B' }}>
              Historial de intentos
            </h3>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              {incident.business_name}
              {incident.contact_name && ` · ${incident.contact_name}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X size={16} style={{ color: '#6B6480' }} />
          </button>
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {attempts.map((a: VerificationAttempt, idx: number) => {
            const date = new Date(a.called_at);
            const dateStr = date.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' });
            const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            return (
              <div
                key={idx}
                className="rounded-lg p-3"
                style={{ background: '#FAF7FF', border: '1px solid #E8E3F5' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div
                      className="flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0"
                      style={{ background: '#6C3BFF', color: '#ffffff' }}
                    >
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 text-xs" style={{ color: '#1A0A3B' }}>
                        <Phone size={10} />
                        <span className="font-semibold capitalize">{dateStr}</span>
                        <span style={{ color: '#9B8FB5' }}>· {timeStr}</span>
                      </div>
                      {a.notes && (
                        <p className="text-[11px] mt-1" style={{ color: '#4B5563' }}>
                          {a.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
                    style={{
                      background: `${RESULT_COLOR[a.result] ?? '#6B6480'}20`,
                      color:      RESULT_COLOR[a.result] ?? '#6B6480',
                    }}
                  >
                    {RESULT_LABEL_LONG[a.result] ?? a.result}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] mt-4" style={{ color: '#9B8FB5' }}>
          El estado más reciente es el que aparece en la tabla. Los intentos previos quedan solo aquí.
        </p>
      </div>
    </div>
  );
}
