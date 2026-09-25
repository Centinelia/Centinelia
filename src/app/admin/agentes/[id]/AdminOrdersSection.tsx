'use client';

import { useState } from 'react';
import { Truck, Store, Pencil, X, Check, Loader2, MapPin, StickyNote } from 'lucide-react';
import { toast } from 'sonner';

type OrderStatus = 'nuevo' | 'en_proceso' | 'listo' | 'entregado' | 'cancelado';

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string }> = {
  nuevo:      { label: 'Nuevo',      color: '#9B6DFF' },
  en_proceso: { label: 'En proceso', color: '#3b82f6' },
  listo:      { label: 'Listo',      color: '#f59e0b' },
  entregado:  { label: 'Entregado',  color: '#22c55e' },
  cancelado:  { label: 'Cancelado',  color: '#6b7280' },
};

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

const EDIT_FIELDS: [keyof Order, string][] = [
  ['nombre',   'Nombre'],
  ['telefono', 'Teléfono'],
  ['items',    'Pedido'],
  ['direccion','Dirección'],
  ['notas',    'Notas'],
];

export default function AdminOrdersSection({ initialOrders, token }: { initialOrders: Order[]; token: string }) {
  const [orders, setOrders]         = useState<Order[]>(initialOrders);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editing, setEditing]       = useState<Order | null>(null);
  const [editForm, setEditForm]     = useState<Partial<Order>>({});
  const [saving, setSaving]         = useState(false);

  const updateStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id);
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    const res = await fetch(`/api/portal/${token}/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) toast.error('Error al actualizar estado');
    setUpdatingId(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/portal/${token}/orders/${editing.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrders(prev => prev.map(o => o.id === editing.id ? updated : o));
      setEditing(null);
      toast.success('Pedido actualizado');
    } else {
      toast.error('Error al guardar');
    }
    setSaving(false);
  };

  if (orders.length === 0) {
    return (
      <p className="text-xs py-6 text-center" style={{ color: '#9B8FB5' }}>
        Sin pedidos registrados aún
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {orders.map(order => {
          const status = (order.status ?? 'nuevo') as OrderStatus;
          const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.nuevo;
          return (
            <div key={order.id} className="px-3 py-2.5 rounded-lg group"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{order.nombre ?? 'Sin nombre'}</span>
                    {order.telefono && (
                      <span className="text-xs" style={{ color: '#6B6480' }}>· {order.telefono}</span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: '#FAFAFB', color: '#4A3B6B' }}>
                      {order.tipo === 'entrega' ? <Truck size={9} /> : <Store size={9} />}
                      {order.tipo === 'entrega' ? 'Entrega' : 'Recoger'}
                    </span>
                    <select
                      value={status}
                      disabled={updatingId === order.id}
                      onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}
                      className="text-xs font-semibold rounded-full px-2 py-0.5 outline-none cursor-pointer border-0 appearance-none"
                      style={{ background: `${sc.color}18`, color: sc.color, opacity: updatingId === order.id ? 0.5 : 1 }}>
                      {(Object.entries(STATUS_CONFIG) as [OrderStatus, typeof sc][]).map(([val, cfg]) => (
                        <option key={val} value={val}>{cfg.label}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm mt-1 font-medium" style={{ color: '#1A0A3B' }}>{order.items}</p>
                  {order.direccion && (
                    <p className="text-xs mt-0.5 inline-flex items-center gap-1" style={{ color: '#4A3B6B' }}>
                      <MapPin size={11} /> {order.direccion}
                    </p>
                  )}
                  {order.notas && (
                    <p className="text-xs mt-0.5 inline-flex items-center gap-1" style={{ color: '#4A3B6B' }}>
                      <StickyNote size={11} /> {order.notas}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => { setEditing(order); setEditForm({ ...order }); }}
                    className="p-1.5 rounded-lg hover:bg-[#FAFAFB] transition-colors opacity-0 group-hover:opacity-100"
                    style={{ color: '#4A3B6B' }}>
                    <Pencil size={12} />
                  </button>
                  <span className="text-xs" style={{ color: '#9B8FB5' }}>
                    {new Date(order.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid #E8E3F5' }}>
              <h3 className="font-semibold text-sm" style={{ color: '#1A0A3B' }}>Editar pedido</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg hover:bg-[#FAFAFB]"
                style={{ color: '#4A3B6B' }}>
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {EDIT_FIELDS.map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#4A3B6B' }}>{label}</label>
                  <input
                    value={(editForm[key] as string) ?? ''}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid #E8E3F5' }}>
              <button onClick={() => setEditing(null)} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#FFFFFF', color: '#4A3B6B' }}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: '#6C3BFF', color: '#fff', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
