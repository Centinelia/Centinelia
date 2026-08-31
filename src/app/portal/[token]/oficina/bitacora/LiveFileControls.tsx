'use client';

import { useRef, useState } from 'react';
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle2 } from 'lucide-react';

interface Props {
  token:                string;
  agentId:              string;
  agentName:            string;
  hasCustomTemplate:    boolean;
  templateFilename?:    string | null;
  templateUploadedAt?:  string | null;
}

/**
 * Controles del archivo Excel del mes en curso:
 * - Bajar: siempre disponible. Retorna live file si existe, o genera on-demand.
 * - Subir versión editada: solo si el empleado tiene template custom. El cron
 *   parte de esta versión editada en el próximo envío, preservando cualquier
 *   cambio manual del cliente en cualquier columna.
 */
export function LiveFileControls({ token, agentId, agentName, hasCustomTemplate, templateFilename, templateUploadedAt }: Props) {
  const uploadedDateLabel = templateUploadedAt
    ? new Date(templateUploadedAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Monterrey' })
    : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingFlag, setDownloadingFlag] = useState(false);
  const [message,   setMessage]   = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  function downloadUrl(): string {
    return `/api/portal/${token}/oficina/bitacora/live-file?agent_id=${agentId}`;
  }

  async function handleDownload() {
    setDownloadingFlag(true);
    setMessage(null);
    try {
      // Descarga directa via fetch para poder detectar errores JSON
      const res = await fetch(downloadUrl());
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? 'No pude bajar el archivo');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // Preservar filename del header Content-Disposition
      const disposition = res.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      link.download = match?.[1] ?? `bitacora-${agentName.toLowerCase()}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setDownloadingFlag(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/portal/${token}/oficina/bitacora/live-file?agent_id=${agentId}`, {
        method: 'POST',
        body:   form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Error al subir');
      setMessage({ type: 'ok', text: `Guardada tu versión del mes ${body.month}. La próxima generación del cron parte de esta.` });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div
      className="rounded-xl p-4 md:p-5"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet size={16} style={{ color: '#6C3BFF' }} />
        <h2 className="text-sm font-bold" style={{ color: '#1A0A3B' }}>
          Archivo Excel del mes en curso
        </h2>
      </div>

      {hasCustomTemplate && (
        <div
          className="flex items-start gap-2 rounded-lg p-3 mb-3"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <CheckCircle2 size={14} style={{ color: '#16a34a', marginTop: 2, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: '#166534' }}>
              Plantilla personalizada activa
            </p>
            <p className="text-[11px] truncate" style={{ color: '#4B5563' }}>
              {templateFilename ?? 'archivo.xlsx'}
              {uploadedDateLabel && <span style={{ color: '#9B8FB5' }}> · subida el {uploadedDateLabel}</span>}
            </p>
          </div>
        </div>
      )}

      <p className="text-xs mb-4" style={{ color: '#6B6480' }}>
        Baja el archivo del mes en curso para revisarlo o editarlo en Excel.
        {hasCustomTemplate
          ? ' Si editas y lo vuelves a subir, tu empleado parte de tu versión en el próximo envío (respeta cualquier col que hayas editado a mano).'
          : ' Este empleado usa el formato por defecto de Centinelia; el archivo se re-genera cada semana desde la base de datos. Para editarlo y que persista, sube tu propia plantilla en la ficha del empleado.'}
      </p>

      {message && (
        <div
          className="text-[11px] px-2 py-1.5 rounded mb-3 flex items-start gap-1.5"
          style={
            message.type === 'ok'
              ? { background: 'rgba(34,197,94,0.08)', color: '#166534' }
              : { background: 'rgba(220,38,38,0.08)', color: '#DC2626' }
          }
        >
          {message.type === 'ok' && <CheckCircle2 size={12} style={{ marginTop: 1 }} />}
          <span>{message.text}</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) void handleUpload(f);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloadingFlag}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: '#6C3BFF', color: '#ffffff', border: 'none', cursor: 'pointer' }}
        >
          {downloadingFlag ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {downloadingFlag ? 'Bajando...' : 'Bajar archivo del mes'}
        </button>

        {hasCustomTemplate && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'transparent', color: '#6C3BFF', border: '1px solid #6C3BFF', cursor: 'pointer' }}
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {uploading ? 'Subiendo...' : 'Subir mi versión editada'}
          </button>
        )}
      </div>
    </div>
  );
}
