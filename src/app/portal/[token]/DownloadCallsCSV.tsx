'use client';
import { Download } from 'lucide-react';
import type { VoiceCall } from '@/types/agent';

const OUTCOME_LABELS: Record<string, string> = {
  lead_created:       'Lead',
  appointment_booked: 'Cita',
  order_taken:        'Pedido',
  transferred:        'Transferido',
  info_provided:      'Información',
  escalated_whatsapp: 'Escalada',
  unanswered:         'No contestó',
  other:              'Otro',
};

export default function DownloadCallsCSV({ calls, filename }: { calls: VoiceCall[]; filename: string }) {
  if (calls.length === 0) return null;

  const download = () => {
    const rows = [
      ['Fecha', 'Duración (min)', 'Resultado', 'Número', 'Resumen'],
      ...calls.map(c => [
        new Date(c.created_at).toLocaleString('es-MX'),
        String(Math.ceil((c.duration_seconds ?? 0) / 60)),
        OUTCOME_LABELS[c.outcome] ?? c.outcome,
        c.caller_number ?? '',
        (c.summary ?? '').replace(/"/g, '""'),
      ]),
    ];
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={download}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
      style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
    >
      <Download size={12} />
      CSV
    </button>
  );
}
