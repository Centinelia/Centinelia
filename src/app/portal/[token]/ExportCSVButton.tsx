'use client';

import { Download } from 'lucide-react';

interface Lead {
  nombre?: string;
  negocio?: string;
  giro?: string;
  servicio?: string;
  presupuesto?: string;
  timeline?: string;
  whatsapp?: string;
  email?: string;
  created_at: string;
}

export default function ExportCSVButton({ leads, filename }: { leads: Lead[]; filename?: string }) {
  const handleExport = () => {
    const headers = ['Nombre', 'Negocio', 'Giro', 'Servicio', 'Presupuesto', 'Para cuándo', 'Teléfono', 'Email', 'Fecha'];
    const rows = leads.map(l => [
      l.nombre ?? '',
      l.negocio ?? '',
      l.giro ?? '',
      l.servicio ?? '',
      l.presupuesto ?? '',
      l.timeline ?? '',
      l.whatsapp ?? '',
      l.email ?? '',
      new Date(l.created_at).toLocaleDateString('es-MX'),
    ].map(v => `"${v.replace(/"/g, '""')}"`));

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
      style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
    >
      <Download size={12} />
      Exportar CSV
    </button>
  );
}
