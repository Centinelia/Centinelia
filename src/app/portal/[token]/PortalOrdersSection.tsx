'use client';

import { useState, useMemo } from 'react';
import { ShoppingBag, Filter, Truck, Store, Pencil, X, Check, Loader2, Download, FileText } from 'lucide-react';
import ActivityDetailModal, { type ActivityItem } from './ActivityDetailModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

type OrderStatus = 'nuevo' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  nuevo:      { label: 'Nuevo',       color: '#6C3BFF', bg: 'rgba(108,59,255,0.12)' },
  en_proceso: { label: 'En proceso',  color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  listo:      { label: 'Listo',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  entregado:  { label: 'Entregado',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  cancelado:  { label: 'Cancelado',   color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

const QUICK_FILTERS = [
  { label: 'Todos',          value: 'all' },
  { label: 'Hoy',           value: 'today' },
  { label: 'Últimos 7 días', value: 'week' },
  { label: 'Este mes',       value: 'month' },
  { label: 'Rango',          value: 'custom' },
] as const;
type QuickFilter = typeof QUICK_FILTERS[number]['value'];

function filterByDate(items: Order[], qf: QuickFilter, from: string, to: string): Order[] {
  if (qf === 'all') return items;
  const now = new Date();
  let start: Date, end: Date;
  if (qf === 'custom') {
    if (!from && !to) return items;
    start = from ? new Date(from + 'T00:00:00') : new Date(0);
    end   = to   ? new Date(to   + 'T23:59:59') : now;
  } else {
    end = now;
    start = new Date(now);
    if (qf === 'today') { start.setHours(0, 0, 0, 0); }
    else if (qf === 'week')  { start.setDate(now.getDate() - 7); start.setHours(0,0,0,0); }
    else { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  }
  return items.filter(o => { const d = new Date(o.created_at); return d >= start && d <= end; });
}

interface Order {
  id: string;
  nombre?: string;
  telefono?: string;
  items: string;
  tipo?: string;
  direccion?: string;
  notas?: string;
  status?: string;
  created_at: string;
}

const EDIT_FIELDS: { key: keyof Order; label: string; placeholder?: string }[] = [
  { key: 'nombre',    label: 'Nombre del cliente', placeholder: 'Ej: Juan García' },
  { key: 'telefono',  label: 'Teléfono',            placeholder: 'Ej: +52 81 1234 5678' },
  { key: 'items',     label: 'Pedido',               placeholder: 'Ej: 2x Tacos, 1x Refresco' },
  { key: 'direccion', label: 'Dirección de entrega', placeholder: 'Ej: Calle Roble 123' },
  { key: 'notas',     label: 'Notas especiales',     placeholder: 'Ej: Sin cebolla' },
];

export default function PortalOrdersSection({ initialOrders, token, isPro }: {
  initialOrders: Order[];
  token: string;
  isPro?: boolean;
}) {
  const [orders, setOrders]             = useState<Order[]>(initialOrders);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [detailOrder, setDetailOrder]   = useState<Order | null>(null);
  const [editForm, setEditForm]         = useState<Partial<Order>>({});
  const [saving, setSaving]             = useState(false);
  const [updatingStatus, setUpdating]   = useState<string | null>(null);
  const [quickFilter, setQuickFilter]   = useState<QuickFilter>('all');
  const [customFrom, setCustomFrom]     = useState('');
  const [customTo, setCustomTo]         = useState('');

  const filtered = useMemo(() => filterByDate(orders, quickFilter, customFrom, customTo), [orders, quickFilter, customFrom, customTo]);

  const updateStatus = async (id: string, status: OrderStatus) => {
    setUpdating(id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    try {
      await fetch(`/api/portal/${token}/orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } finally {
      setUpdating(null);
    }
  };

  const saveEdit = async () => {
    if (!editingOrder) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/orders/${editingOrder.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders(prev => prev.map(o => o.id === editingOrder.id ? updated : o));
        setEditingOrder(null);
      }
    } finally {
      setSaving(false);
    }
  };

  if (orders.length === 0) {
    return (
      <div className="text-center py-10" style={{ color: 'var(--c-text-3)' }}>
        <ShoppingBag size={28} className="mx-auto mb-2 opacity-30" />
        <p className="text-sm">Sin pedidos registrados</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Date filter */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} style={{ color: 'var(--c-text-3)' }} />
            {QUICK_FILTERS.map(({ label, value }) => (
              <button key={value} onClick={() => setQuickFilter(value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{ background: quickFilter === value ? '#6C3BFF' : 'var(--c-input-bg)', color: quickFilter === value ? '#fff' : 'var(--c-text-2)' }}>
                {label}
              </button>
            ))}
          </div>
          {quickFilter === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <DatePicker value={customFrom} onChange={setCustomFrom} className="w-auto min-w-[160px]" />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>–</span>
              <DatePicker value={customTo} onChange={setCustomTo} className="w-auto min-w-[160px]" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {filtered.length} de {orders.length} pedido{orders.length !== 1 ? 's' : ''}{quickFilter !== 'all' ? ' (filtrado)' : ''}
          </p>
          {filtered.length > 0 && (
            <button
              onClick={() => {
                const rows = [
                  ['Nombre', 'Teléfono', 'Pedido', 'Tipo', 'Dirección', 'Notas', 'Estado', 'Fecha'],
                  ...filtered.map(o => [
                    o.nombre ?? '', o.telefono ?? '', o.items ?? '', o.tipo ?? '',
                    o.direccion ?? '', o.notas ?? '', o.status ?? '',
                    new Date(o.created_at).toLocaleString('es-MX'),
                  ].map(v => `"${String(v).replace(/"/g, '""')}"` )),
                ];
                const csv  = rows.map(r => r.join(',')).join('\r\n');
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a'); a.href = url;
                a.download = `pedidos-${new Date().toISOString().slice(0,10)}.csv`;
                a.click(); URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style={{ background: 'rgba(108,59,255,0.12)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.25)' }}
            >
              <Download size={12} /> Exportar CSV
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'var(--c-text-3)' }}>Sin pedidos en este período</div>
        ) : (
          filtered.map(order => {
            const status = (order.status ?? 'nuevo') as OrderStatus;
            const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.nuevo;
            return (
              <div key={order.id} className="rounded-xl p-4 cursor-pointer transition-all hover:border-[var(--c-border-2)]"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                onClick={() => setDetailOrder(order)}>
                <div className="flex flex-col gap-2.5">
                  {/* Top: content + edit button */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>
                          {order.nombre ?? 'Sin nombre'}
                        </span>
                        {order.telefono && (
                          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>· {order.telefono}</span>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-2)' }}>
                          {order.tipo === 'entrega' ? <Truck size={9} /> : <Store size={9} />}
                          {order.tipo === 'entrega' ? 'Entrega' : 'Recoger'}
                        </span>
                      </div>
                      <p className="text-sm mt-1.5 font-medium" style={{ color: 'var(--c-text)' }}>{order.items}</p>
                      {order.direccion && <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>📍 {order.direccion}</p>}
                      {order.notas    && <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>📝 {order.notas}</p>}
                    </div>
                    <button onClick={e => { e.stopPropagation(); setEditingOrder(order); setEditForm({ ...order }); }}
                      className="p-1.5 rounded-lg hover:bg-[var(--c-surface-2)] transition-colors flex-shrink-0"
                      style={{ color: 'var(--c-text-3)' }}>
                      <Pencil size={13} />
                    </button>
                  </div>
                  {/* Bottom: date + status select + PDF */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      {new Date(order.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <a href={`/api/portal/${token}/pdf/orden/${order.id}`} target="_blank" rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-opacity hover:opacity-70"
                        style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                        <FileText size={10} /> PDF
                      </a>
                    <div onClick={e => e.stopPropagation()}>
                      <Select
                        value={status}
                        disabled={updatingStatus === order.id}
                        onValueChange={v => updateStatus(order.id, v as OrderStatus)}
                      >
                        <SelectTrigger
                          className="w-auto text-xs font-semibold rounded-full px-2.5 py-1 border-0"
                          style={{ background: sc.bg, color: sc.color, opacity: updatingStatus === order.id ? 0.5 : 1 }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.entries(STATUS_CONFIG) as [OrderStatus, typeof sc][]).map(([val, cfg]) => (
                            <SelectItem key={val} value={val}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit modal */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditingOrder(null); }}>
          <div className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden" style={{ background: 'var(--c-modal)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>Editar pedido</h3>
              <button onClick={() => setEditingOrder(null)} className="p-1 rounded-lg hover:bg-[var(--c-surface-2)]" style={{ color: 'var(--c-text-2)' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {EDIT_FIELDS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>{label}</label>
                  <input value={(editForm[key] as string) ?? ''} placeholder={placeholder}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid var(--c-border)' }}>
              <button onClick={() => setEditingOrder(null)} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--c-input-bg)', color: 'var(--c-text-2)' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailOrder && (
        <ActivityDetailModal
          type="order"
          item={detailOrder as ActivityItem}
          isPro={!!isPro}
          token={token}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </>
  );
}
