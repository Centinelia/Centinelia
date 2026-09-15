'use client';

/**
 * CalendarioEditorial — calendario mensual de borradores programados.
 *
 * Carga el calendario del mes indicado via
 * GET /api/portal/[token]/social/calendar/[YYYY-MM].
 * Permite aprobar el calendario completo con
 * POST /api/portal/[token]/social/calendar/[YYYY-MM]/approve.
 */
import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check, RefreshCw, CalendarClock } from 'lucide-react';
import DraftPreview, { type ContentDraft } from './DraftPreview';

interface CalendarSlot {
  id?:          string;
  date:         string;  // ISO date YYYY-MM-DD
  content_draft?: ContentDraft;
  status?:      string;
}

interface CalendarData {
  slots:   CalendarSlot[];
  approved: boolean;
}

interface Props {
  token:            string;
  naviId:           string;
  /** Mes inicial en formato YYYY-MM */
  month:            string;
  socialAccountId?: string;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function CalendarioEditorial({ token, naviId, month: initialMonth, socialAccountId }: Props) {
  const [month,      setMonth]      = useState(initialMonth);
  const [calendar,   setCalendar]   = useState<CalendarData | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [approving,  setApproving]  = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadCalendar = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    setSelectedDay(null);
    try {
      const res = await fetch(
        `/api/portal/${token}/social/calendar/${m}?agent_id=${naviId}${socialAccountId ? `&account_id=${socialAccountId}` : ''}`,
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setCalendar(json.data ?? { slots: [], approved: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar calendario');
    } finally {
      setLoading(false);
    }
  }, [token, naviId, socialAccountId]);

  useEffect(() => { void loadCalendar(month); }, [loadCalendar, month]);

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/portal/${token}/social/calendar/${month}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agent_id: naviId }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setCalendar(prev => prev ? { ...prev, approved: true } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar calendario');
    } finally {
      setApproving(false);
    }
  };

  const [yearStr, monthStr] = month.split('-');
  const year    = Number(yearStr);
  const monthNum = Number(monthStr) - 1;
  const days    = daysInMonth(year, monthNum);
  const firstDay = firstDayOfMonth(year, monthNum);

  // Slots por día (keyed YYYY-MM-DD)
  const slotsByDay = new Map<string, CalendarSlot>();
  for (const slot of (calendar?.slots ?? [])) {
    slotsByDay.set(slot.date.slice(0, 10), slot);
  }

  const selectedSlot = selectedDay ? slotsByDay.get(selectedDay) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado del mes + navegación */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonth(prevMonth(month))}
          aria-label="Mes anterior"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ border: '1px solid #E8E3F5', background: '#fff' }}
        >
          <ChevronLeft size={14} style={{ color: '#6B6480' }} />
        </button>

        <div className="text-center">
          <h2 className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>
            {MONTH_NAMES[monthNum]} {year}
          </h2>
          {calendar && (
            <p className="text-[11px]" style={{ color: '#6B6480' }}>
              {calendar.slots.length} publicaciones programadas
            </p>
          )}
        </div>

        <button
          onClick={() => setMonth(nextMonth(month))}
          aria-label="Mes siguiente"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ border: '1px solid #E8E3F5', background: '#fff' }}
        >
          <ChevronRight size={14} style={{ color: '#6B6480' }} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-2" style={{ color: '#6B6480' }}>
          <RefreshCw size={16} className="animate-spin" />
          <span className="text-[13px]">Cargando calendario...</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg px-4 py-3 text-[13px]" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Grid del mes */}
          <div className="overflow-hidden rounded-xl" style={{ border: '1px solid #E8E3F5' }}>
            {/* Cabecera días */}
            <div className="grid grid-cols-7" style={{ background: '#F8F7FF' }}>
              {DAY_NAMES.map(d => (
                <div
                  key={d}
                  className="text-center text-[10px] font-bold uppercase tracking-wide py-2"
                  style={{ color: '#6B6480' }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Celdas de días */}
            <div className="grid grid-cols-7">
              {/* Relleno de días anteriores al mes */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} style={{ background: '#FAFAFF', borderTop: '1px solid #F0EBF8', minHeight: 56 }} />
              ))}

              {Array.from({ length: days }).map((_, i) => {
                const dayNum     = i + 1;
                const dateStr    = `${yearStr}-${monthStr}-${String(dayNum).padStart(2, '0')}`;
                const slot       = slotsByDay.get(dateStr);
                const isToday    = dateStr === new Date().toISOString().slice(0, 10);
                const isSelected = selectedDay === dateStr;

                return (
                  <button
                    key={dayNum}
                    onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                    className="relative flex flex-col items-center pt-1.5 pb-2 transition-colors text-left"
                    style={{
                      borderTop:   '1px solid #F0EBF8',
                      borderLeft:  (i + firstDay) % 7 !== 0 ? '1px solid #F0EBF8' : undefined,
                      minHeight:   56,
                      background:  isSelected
                        ? 'rgba(108,59,255,0.08)'
                        : isToday ? '#F8F7FF' : '#fff',
                    }}
                    aria-label={`Día ${dayNum}${slot ? ' — tiene publicación' : ''}`}
                  >
                    <span
                      className="text-[12px] font-semibold w-6 h-6 flex items-center justify-center rounded-full"
                      style={{
                        background: isToday ? '#6C3BFF' : 'transparent',
                        color:      isToday ? '#fff' : '#1A0A3B',
                      }}
                    >
                      {dayNum}
                    </span>
                    {slot && (
                      <span
                        className="mt-1 w-4 h-1 rounded-full"
                        style={{ background: '#6C3BFF', opacity: 0.7 }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalle del día seleccionado */}
          {selectedDay && selectedSlot?.content_draft && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CalendarClock size={14} style={{ color: '#6C3BFF' }} />
                <span className="text-[12px] font-semibold" style={{ color: '#6B6480' }}>
                  Publicación del {selectedDay}
                </span>
              </div>
              <DraftPreview draft={selectedSlot.content_draft} />
            </div>
          )}

          {selectedDay && !selectedSlot && (
            <p className="text-[13px] text-center py-4" style={{ color: '#6B6480' }}>
              Sin publicación programada para este día.
            </p>
          )}

          {/* Botón de aprobación */}
          {!calendar?.approved && (calendar?.slots.length ?? 0) > 0 && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-opacity disabled:opacity-50 w-full"
              style={{ background: '#6C3BFF', color: '#fff' }}
            >
              <Check size={14} strokeWidth={2.5} />
              {approving ? 'Aprobando...' : 'Aprobar calendario del mes'}
            </button>
          )}

          {calendar?.approved && (
            <div
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold"
              style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}
            >
              <Check size={14} strokeWidth={2.5} />
              Calendario aprobado
            </div>
          )}
        </>
      )}
    </div>
  );
}
