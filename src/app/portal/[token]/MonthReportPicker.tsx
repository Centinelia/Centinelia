'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const SELECT_STYLE: React.CSSProperties = {
  background:  'var(--c-surface-2)',
  border:      '2px solid rgba(108,59,255,0.4)',
  color:       'var(--c-text)',
  outline:     'none',
};

export function MonthReportPicker({ token }: { token: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const href  = `/api/portal/${token}/pdf/reporte?year=${year}&month=${month}`;
  const label = `${MESES[month - 1]} ${year}`;

  const currentYear = now.getFullYear();
  const years = Array.from({ length: 3 }, (_, i) => currentYear - i);

  // Disable future months for the selected year
  const maxMonth = year === currentYear ? now.getMonth() + 1 : 12;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <select
          value={month}
          onChange={e => {
            const m = Number(e.target.value);
            setMonth(m);
            if (year === currentYear && m > now.getMonth() + 1) setMonth(now.getMonth() + 1);
          }}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium"
          style={SELECT_STYLE}
        >
          {MESES.map((nombre, i) => (
            <option key={i + 1} value={i + 1} disabled={year === currentYear && i + 1 > maxMonth}>
              {nombre}
            </option>
          ))}
        </select>
        <select
          value={year}
          onChange={e => {
            const y = Number(e.target.value);
            setYear(y);
            if (y === currentYear && month > now.getMonth() + 1) setMonth(now.getMonth() + 1);
          }}
          className="px-3 py-2 rounded-lg text-xs font-medium"
          style={SELECT_STYLE}
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
        style={{ background: '#6C3BFF', color: '#fff' }}
      >
        <Download size={12} />
        Descargar — {label}
      </a>
    </div>
  );
}
