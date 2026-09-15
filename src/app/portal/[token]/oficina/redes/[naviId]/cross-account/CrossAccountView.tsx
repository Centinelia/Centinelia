'use client';

/**
 * CrossAccountView — calendario mensual con puntos de color por cuenta.
 *
 * Recibe las cuentas y los borradores aprobados/programados del mes
 * y los muestra en un grid con dots de color por cuenta.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface AccountSummary {
  id:                string;
  external_username: string | null;
  status:            string;
  paused:            boolean;
}

interface DraftSummary {
  id:                string;
  scheduled_for:     string | null;
  caption:           string | null;
  status:            string;
  social_account_id: string | null;
}

interface Props {
  accounts:     AccountSummary[];
  drafts:       DraftSummary[];
  currentMonth: string; // YYYY-MM
}

// Paleta de colores para hasta 8 cuentas
const ACCOUNT_COLORS = [
  '#6C3BFF', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4',
];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

export default function CrossAccountView({ accounts, drafts, currentMonth }: Props) {
  const [month, setMonth] = useState(currentMonth);

  const accountColorMap = new Map(accounts.map((a, i) => [a.id, ACCOUNT_COLORS[i % ACCOUNT_COLORS.length]]));

  // Agrupar borradores por dia (YYYY-MM-DD)
  const draftsByDay = new Map<string, DraftSummary[]>();
  for (const d of drafts) {
    if (!d.scheduled_for) continue;
    const day = d.scheduled_for.slice(0, 10);
    if (!draftsByDay.has(day)) draftsByDay.set(day, []);
    draftsByDay.get(day)!.push(d);
  }

  const [yearStr, monthStr] = month.split('-');
  const year     = Number(yearStr);
  const monthNum = Number(monthStr) - 1;
  const days     = new Date(year, monthNum + 1, 0).getDate();
  const firstDay = new Date(year, monthNum, 1).getDay();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedDrafts = selectedDay ? (draftsByDay.get(selectedDay) ?? []) : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Leyenda de colores */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {accounts.map((acc, i) => (
            <div key={acc.id} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length] }}
              />
              <span className="text-[11px]" style={{ color: '#6B6480' }}>
                {acc.external_username ? `@${acc.external_username}` : acc.id.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Navegacion mes */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonth(prevMonth(month))}
          aria-label="Mes anterior"
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ border: '1px solid #E8E3F5', background: '#fff' }}
        >
          <ChevronLeft size={14} style={{ color: '#6B6480' }} />
        </button>
        <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>
          {MONTH_NAMES[monthNum]} {year}
        </p>
        <button
          onClick={() => setMonth(nextMonth(month))}
          aria-label="Mes siguiente"
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ border: '1px solid #E8E3F5', background: '#fff' }}
        >
          <ChevronRight size={14} style={{ color: '#6B6480' }} />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-hidden rounded-xl" style={{ border: '1px solid #E8E3F5' }}>
        {/* Cabecera */}
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

        {/* Celdas */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e-${i}`} style={{ background: '#FAFAFF', borderTop: '1px solid #F0EBF8', minHeight: 52 }} />
          ))}

          {Array.from({ length: days }).map((_, i) => {
            const dayNum  = i + 1;
            const dateStr = `${yearStr}-${monthStr}-${String(dayNum).padStart(2, '0')}`;
            const dayDrafts = draftsByDay.get(dateStr) ?? [];
            const isToday   = dateStr === new Date().toISOString().slice(0, 10);
            const isSelected = selectedDay === dateStr;

            return (
              <button
                key={dayNum}
                onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                className="relative flex flex-col items-center pt-1.5 pb-2"
                style={{
                  borderTop:  '1px solid #F0EBF8',
                  borderLeft: (i + firstDay) % 7 !== 0 ? '1px solid #F0EBF8' : undefined,
                  minHeight:  52,
                  background: isSelected ? 'rgba(108,59,255,0.06)' : isToday ? '#F8F7FF' : '#fff',
                }}
                aria-label={`${dateStr}${dayDrafts.length > 0 ? ` — ${dayDrafts.length} publicaciones` : ''}`}
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

                {/* Dots de color por cuenta */}
                {dayDrafts.length > 0 && (
                  <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                    {dayDrafts.slice(0, 5).map(d => (
                      <span
                        key={d.id}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: accountColorMap.get(d.social_account_id ?? '') ?? '#6C3BFF' }}
                        aria-hidden
                      />
                    ))}
                    {dayDrafts.length > 5 && (
                      <span className="text-[8px]" style={{ color: '#6B6480' }}>+{dayDrafts.length - 5}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Detalle del dia seleccionado */}
      {selectedDay && selectedDrafts.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex flex-col gap-2"
          style={{ background: '#F8F7FF', border: '1px solid #E8E3F5' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#6B6480' }}>
            {selectedDay}
          </p>
          {selectedDrafts.map((d, idx) => {
            const acc   = accounts.find(a => a.id === d.social_account_id);
            const color = accountColorMap.get(d.social_account_id ?? '') ?? '#6C3BFF';
            return (
              <div key={d.id} className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                  style={{ background: color }}
                />
                <div>
                  <p className="text-[11px] font-semibold" style={{ color: '#1A0A3B' }}>
                    {acc?.external_username ? `@${acc.external_username}` : 'Cuenta'}
                  </p>
                  {d.caption && (
                    <p className="text-[11px]" style={{ color: '#6B6480' }}>
                      {d.caption.slice(0, 80)}{d.caption.length > 80 ? '...' : ''}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDay && selectedDrafts.length === 0 && (
        <p className="text-[13px] text-center py-3" style={{ color: '#6B6480' }}>
          Sin publicaciones programadas para este dia.
        </p>
      )}
    </div>
  );
}
