'use client';

import { useState, useEffect } from 'react';
import {
  X, User, MessageCircle, Mail, DollarSign, Calendar,
  MapPin, Package, Clock, Phone, Briefcase, Tag, FileText,
  Play, Download,
} from 'lucide-react';

const RECORDING_TTL_DAYS = 7;

interface MatchedCall {
  id: string;
  recording_url?: string | null;
  created_at: string;
  duration_seconds: number;
  caller_number?: string;
  outcome?: string;
}

function RecordingPlayer({ url, createdAt }: { url: string; createdAt: string }) {
  const [downloading, setDownloading] = useState(false);
  const callDate     = new Date(createdAt);
  const expiresAt    = new Date(callDate.getTime() + RECORDING_TTL_DAYS * 86400000);
  const expired      = new Date() > expiresAt;
  const daysLeft     = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
  const expiresLabel = expiresAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  if (expired) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
        style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
        <Clock size={12} /> Grabación expirada
      </div>
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `llamada-${createdAt.slice(0, 10)}.wav`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Play size={11} style={{ color: '#6C3BFF' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>Grabación</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs flex items-center gap-1"
            style={{ color: daysLeft <= 2 ? '#f59e0b' : 'var(--c-text-3)' }}>
            <Clock size={10} /> hasta {expiresLabel}
          </span>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', opacity: downloading ? 0.6 : 1 }}
          >
            <Download size={11} /> {downloading ? 'Descargando…' : 'Descargar'}
          </button>
        </div>
      </div>
      <div className="px-3 pb-3">
        <audio controls src={url} style={{ width: '100%', height: 36, accentColor: '#6C3BFF' }} />
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, href }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs mb-0.5" style={{ color: 'var(--c-text-3)' }}>{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-sm font-medium hover:opacity-80 transition-opacity break-all"
            style={{ color: '#6C3BFF' }}>
            {value}
          </a>
        ) : (
          <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>{value}</p>
        )}
      </div>
    </div>
  );
}

export interface ActivityItem {
  id: string;
  created_at: string;
  [key: string]: any;
}

interface Props {
  type: 'lead' | 'order' | 'appt';
  item: ActivityItem;
  isPro: boolean;
  token: string;
  onClose: () => void;
}

const TYPE_META = {
  lead:  { label: 'Lead',   color: '#6C3BFF' },
  order: { label: 'Pedido', color: '#f59e0b' },
  appt:  { label: 'Cita',   color: '#3b82f6' },
};

export default function ActivityDetailModal({ type, item, isPro, token, onClose }: Props) {
  const [call, setCall] = useState<MatchedCall | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isPro) { setCall(null); return; }
    fetch(`/api/portal/${token}/call-for?date=${encodeURIComponent(item.created_at)}`)
      .then(r => r.json())
      .then(d => setCall(d.call ?? null))
      .catch(() => setCall(null));
  }, [item.id, isPro, token]);

  const meta = TYPE_META[type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--c-modal)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--c-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: meta.color }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{meta.label}</h3>
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              {new Date(item.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors"
            style={{ color: 'var(--c-text-2)' }}>
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5 overflow-y-auto" style={{ maxHeight: '75vh' }}>

          {/* Recording, Pro agents only */}
          {isPro && (
            <>
              {call === undefined ? (
                <div className="h-14 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                  <span className="text-xs animate-pulse" style={{ color: 'var(--c-text-3)' }}>
                    Buscando grabación…
                  </span>
                </div>
              ) : call?.recording_url ? (
                <RecordingPlayer url={call.recording_url} createdAt={call.created_at} />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                  <Clock size={12} /> Sin grabación disponible para esta llamada
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--c-border)' }} />
            </>
          )}

          {/* Client info */}
          <div className="flex flex-col gap-3">

            {type === 'lead' && <>
              {item.nombre     && <InfoRow icon={<User size={13} />}          label="Nombre"       value={item.nombre} />}
              {item.whatsapp   && <InfoRow icon={<Phone size={13} />}         label="Teléfono"     value={item.whatsapp} href={`tel:${item.whatsapp.replace(/\D/g, '')}`} />}
              {item.email      && <InfoRow icon={<Mail size={13} />}          label="Correo"       value={item.email} href={`mailto:${item.email}`} />}
              {item.servicio   && <InfoRow icon={<Tag size={13} />}           label="Servicio"     value={item.servicio} />}
              {item.presupuesto && <InfoRow icon={<DollarSign size={13} />}   label="Presupuesto"  value={item.presupuesto} />}
              {item.timeline   && <InfoRow icon={<Calendar size={13} />}      label="Timeline"     value={item.timeline} />}
              {item.negocio    && <InfoRow icon={<Briefcase size={13} />}     label="Organización" value={`${item.negocio}${item.giro ? ` · ${item.giro}` : ''}`} />}
            </>}

            {type === 'appt' && <>
              {item.nombre     && <InfoRow icon={<User size={13} />}     label="Cliente"    value={item.nombre} />}
              {item.telefono   && <InfoRow icon={<Phone size={13} />}    label="Teléfono"   value={item.telefono} href={`tel:${item.telefono}`} />}
              {item.servicio   && <InfoRow icon={<Tag size={13} />}      label="Servicio"   value={item.servicio} />}
              {(item.fecha || item.hora) && (
                <InfoRow icon={<Calendar size={13} />} label="Fecha y hora"
                  value={[item.fecha, item.hora].filter(Boolean).join(' · ')} />
              )}
            </>}

            {type === 'order' && <>
              {item.nombre     && <InfoRow icon={<User size={13} />}      label="Cliente"    value={item.nombre} />}
              {item.telefono   && <InfoRow icon={<Phone size={13} />}     label="Teléfono"   value={item.telefono} href={`tel:${item.telefono}`} />}
              {item.items      && <InfoRow icon={<Package size={13} />}   label="Pedido"     value={item.items} />}
              {item.tipo       && <InfoRow icon={<Briefcase size={13} />} label="Tipo"       value={item.tipo === 'entrega' ? 'A domicilio' : 'Para recoger'} />}
              {item.direccion  && <InfoRow icon={<MapPin size={13} />}    label="Dirección"  value={item.direccion} />}
              {item.notas      && <InfoRow icon={<FileText size={13} />}  label="Notas"      value={item.notas} />}
            </>}

          </div>
        </div>
      </div>
    </div>
  );
}
