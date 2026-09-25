'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Clock, Loader2, Mail, FileText, Hash, Wallet } from 'lucide-react';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';
import { useApi } from '@/lib/hooks/useApi';
import { formatMoney } from '@/lib/format/money';

interface PagoPendiente {
  id: string;
  cliente_id: string | null;
  related_uuid: string;
  monto: number;
  sent_to_email: string | null;
  created_at: string;
  meta: {
    fecha_pago?: string;
    num_operacion?: string;
    forma_pago?: string;
    motivos?: string[];
    cliente_razon_social?: string | null;
    resolved_at?: string;
    resolved_action?: string;
    rep_uuid?: string;
  };
  cliente: { razon_social: string; rfc: string; correo_facturacion: string } | null;
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PagosPendientesPage() {
  const { data: pendientes = [], error: fetchError, isLoading: loading, mutate } =
    useApi<PagoPendiente[]>('/api/admin/staff/neka/pagos-pendientes', { key: 'pendientes' });

  const [approving, setApproving] = useState<string | null>(null);
  const [feedback,  setFeedback]  = useState<{ id: string; type: 'ok' | 'err'; text: string } | null>(null);

  const approve = async (p: PagoPendiente) => {
    if (approving) return;
    if (!confirm(`¿Verificaste en tu banco que llegó el pago de ${formatMoney(p.monto)} de ${p.cliente?.razon_social ?? 'este cliente'}?`)) return;
    setApproving(p.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/staff/neka/pagos-pendientes/${p.id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.error) setFeedback({ id: p.id, type: 'err', text: data.error });
      else {
        setFeedback({ id: p.id, type: 'ok', text: `REP ${data.rep_uuid} timbrado y enviado a ${data.sent_to}` });
        mutate();
      }
    } catch (e) {
      setFeedback({ id: p.id, type: 'err', text: (e as Error).message });
    } finally {
      setApproving(null);
    }
  };

  const abiertos  = pendientes.filter(p => !p.meta.resolved_at);
  const resueltos = pendientes.filter(p => p.meta.resolved_at);
  const totalPendiente = abiertos.reduce((sum, p) => sum + (p.monto ?? 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/admin/staff/neka"
        className="inline-flex items-center gap-1.5 text-[12px] mb-4 transition-colors"
        style={{ color: '#6B6480' }}
      >
        <ArrowLeft size={12} />
        Volver a config
      </Link>

      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Staff · Neka</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          Pagos pendientes de verificación
        </h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Neka recibió comprobante SPEI que no cumplió reglas de auto-aprobación. Verifica en tu banco y aprueba para que Neka timbre el REP.
        </p>
      </header>

      {/* Stats */}
      {!loading && (abiertos.length > 0 || resueltos.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <StatCard label="Pendientes" value={String(abiertos.length)} accent="#B45309" icon={<Clock size={16} />} />
          <StatCard label="Monto pendiente" value={formatMoney(totalPendiente)} accent="#6C3BFF" icon={<Wallet size={16} />} hint="por verificar" />
          <StatCard label="Resueltos" value={String(resueltos.length)} accent="#22C55E" icon={<Check size={16} />} />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-[13px]" style={{ color: '#6B6480' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: '#6C3BFF' }} /> Cargando pagos…
        </div>
      )}

      {fetchError && (
        <div className="mb-4">
          <OficinaModal.Alert tone="danger">{fetchError.message}</OficinaModal.Alert>
        </div>
      )}

      {!loading && abiertos.length === 0 && (
        <div className="rounded-2xl text-center flex flex-col items-center gap-3" style={{ background: '#FAFAFB', border: '1px solid #E8E3F5', padding: '48px 24px' }}>
          <div className="flex items-center justify-center rounded-2xl" style={{ background: 'rgba(34,197,94,0.10)', width: 56, height: 56 }}>
            <Check size={24} style={{ color: '#22C55E' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold" style={{ color: '#1A0A3B' }}>Todo al día</p>
            <p className="text-[13px] mt-1 max-w-md" style={{ color: '#6B6480' }}>
              No hay pagos esperando tu aprobación.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {abiertos.map(p => (
          <article
            key={p.id}
            className="rounded-2xl transition-all"
            style={{
              background: '#ffffff',
              border:     '1px solid rgba(180,83,9,0.30)',
              boxShadow:  '0 1px 3px rgba(15,5,34,0.04)',
            }}
          >
            <div className="flex items-start gap-3" style={{ padding: '16px 18px 12px' }}>
              <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ background: 'rgba(180,83,9,0.10)', color: '#B45309', width: 36, height: 36 }}>
                <Clock size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[16px] font-bold tracking-tight truncate" style={{ color: '#1A0A3B' }}>
                    {p.cliente?.razon_social ?? p.meta.cliente_razon_social ?? 'Cliente no identificado'}
                  </h3>
                  {p.cliente?.rfc && (
                    <code className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md" style={{ background: 'rgba(108,59,255,0.10)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.20)' }}>
                      {p.cliente.rfc}
                    </code>
                  )}
                </div>
                <p className="text-[18px] font-bold tracking-tight mt-1" style={{ color: '#B45309' }}>
                  {formatMoney(p.monto)}
                </p>
              </div>
              <button
                onClick={() => approve(p)}
                disabled={approving === p.id}
                className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all flex-shrink-0"
                style={{
                  padding:    '10px 16px',
                  background: approving === p.id ? '#B9A8E8' : '#6C3BFF',
                  color:      '#ffffff',
                  boxShadow:  approving === p.id ? 'none' : '0 2px 8px rgba(108,59,255,0.32)',
                  cursor:     approving === p.id ? 'not-allowed' : 'pointer',
                }}
              >
                {approving === p.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Aprobar y timbrar REP
              </button>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ padding: '0 18px 12px' }}>
              <MetaItem icon={<Hash size={12} />} label="UUID factura" value={p.related_uuid.slice(0, 12).toUpperCase() + '…'} mono />
              {p.meta.fecha_pago && (
                <MetaItem icon={<Wallet size={12} />} label="SPEI recibido" value={`${p.meta.fecha_pago}${p.meta.num_operacion ? ` · Op ${p.meta.num_operacion}` : ''}`} />
              )}
              {p.sent_to_email && (
                <MetaItem icon={<Mail size={12} />} label="Enviado a" value={p.sent_to_email} />
              )}
            </div>

            {/* Warning: por qué no se auto-aprobó */}
            {p.meta.motivos && p.meta.motivos.length > 0 && (
              <div style={{ padding: '0 18px 14px' }}>
                <div className="rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', padding: '10px 14px' }}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: '#92400E' }}>
                    Por qué no se auto-aprobó
                  </p>
                  <ul className="text-[12.5px] leading-relaxed list-disc list-inside space-y-0.5" style={{ color: '#78350F' }}>
                    {p.meta.motivos.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {feedback?.id === p.id && (
              <div style={{ padding: '0 18px 14px' }}>
                <OficinaModal.Alert tone={feedback.type === 'ok' ? 'info' : 'danger'}>
                  {feedback.text}
                </OficinaModal.Alert>
              </div>
            )}
          </article>
        ))}
      </div>

      {resueltos.length > 0 && (
        <div className="mt-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: '#9B6DFF' }}>
            Resueltos ({resueltos.length})
          </p>
          <div className="flex flex-col gap-2">
            {resueltos.map(p => (
              <div
                key={p.id}
                className="rounded-xl flex items-center gap-3 text-[12.5px]"
                style={{ background: '#FAFAFB', border: '1px solid #F0EBFA', color: '#6B6480', padding: '10px 14px' }}
              >
                <FileText size={13} style={{ color: '#9B6DFF' }} />
                <span className="font-semibold" style={{ color: '#1A0A3B' }}>{p.cliente?.razon_social ?? '(sin cliente)'}</span>
                <span>· {formatMoney(p.monto)}</span>
                <span>· aprobado {fmtFecha(p.meta.resolved_at)}</span>
                <span>· REP {p.meta.rep_uuid?.slice(-8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stats Card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, icon, hint }: { label: string; value: string; accent: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl transition-all" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-lg" style={{ background: `${accent}1A`, color: accent, width: 28, height: 28 }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>{label}</p>
      </div>
      <p className="text-[24px] font-bold tracking-tight leading-none" style={{ color: '#1A0A3B' }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}

// ─── Meta Item ───────────────────────────────────────────────────────────────

function MetaItem({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="flex items-center justify-center rounded-md mt-0.5" style={{ background: '#F5F0FF', color: '#9B6DFF', width: 22, height: 22, flexShrink: 0 }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: '#9B8FB5' }}>{label}</p>
        <p className={`text-[12.5px] truncate ${mono ? 'font-mono' : ''}`} style={{ color: '#1A0A3B', fontWeight: 500 }}>{value}</p>
      </div>
    </div>
  );
}
