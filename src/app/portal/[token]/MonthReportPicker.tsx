'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

const SELECT_TRIGGER_STYLE: React.CSSProperties = {
  background: 'var(--c-surface-2)',
  border:     '2px solid rgba(108,59,255,0.4)',
  color:      'var(--c-text)',
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
        <Select
          value={String(month)}
          onValueChange={v => {
            const m = Number(v);
            if (year === currentYear && m > now.getMonth() + 1) setMonth(now.getMonth() + 1);
            else setMonth(m);
          }}
        >
          <SelectTrigger className="flex-1 text-xs font-medium" style={SELECT_TRIGGER_STYLE}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((nombre, i) => (
              <SelectItem key={i + 1} value={String(i + 1)} disabled={year === currentYear && i + 1 > maxMonth}>
                {nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(year)}
          onValueChange={v => {
            const y = Number(v);
            setYear(y);
            if (y === currentYear && month > now.getMonth() + 1) setMonth(now.getMonth() + 1);
          }}
        >
          <SelectTrigger className="w-auto text-xs font-medium" style={SELECT_TRIGGER_STYLE}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
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
