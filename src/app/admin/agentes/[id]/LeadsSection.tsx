'use client';

import { useState } from 'react';
import { Pencil, Trash2, Check, X, DollarSign, Calendar, Smartphone, Mail } from 'lucide-react';
import { toast } from 'sonner';
import EditLeadModal from './EditLeadModal';

interface Lead {
  id: string;
  nombre?: string;
  negocio?: string;
  giro?: string;
  servicio?: string;
  presupuesto?: string;
  timeline?: string;
  email?: string;
  whatsapp?: string;
  status?: string;
  created_at: string;
}

const STATUSES = [
  { value: 'nuevo',      label: 'Nuevo',      color: '#9B6DFF' },
  { value: 'contactado', label: 'Contactado', color: '#3b82f6' },
  { value: 'cerrado',    label: 'Cerrado',    color: '#22c55e' },
  { value: 'perdido',    label: 'Perdido',    color: '#6b7280' },
];

export default function LeadsSection({ initialLeads }: { initialLeads: Lead[] }) {
  const [leads, setLeads]           = useState<Lead[]>(initialLeads);
  const [editing, setEditing]       = useState<Lead | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSaved = (updated: Lead) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
    setEditing(null);
    toast.success('Lead actualizado');
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(null);
    setLeads(prev => prev.filter(l => l.id !== id));
    const res = await fetch(`/api/admin/leads/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Lead eliminado');
    }
  };

  const handleStatus = async (lead: Lead, newStatus: string) => {
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
    const res = await fetch(`/api/admin/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) {
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: lead.status } : l));
      toast.error('Error al actualizar estado');
    }
  };

  return (
    <>
      <div className="p-5 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
        <h2 className="text-xs font-semibold mb-4 tracking-widest uppercase" style={{ color: '#6B6480' }}>
          Leads recientes ({leads.length})
        </h2>

        {leads.length === 0 ? (
          <p className="text-xs py-6 text-center leading-relaxed" style={{ color: '#9B8FB5' }}>
            Sin leads — se registran automáticamente al terminar una llamada
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {leads.map(lead => {
              const status     = lead.status ?? 'nuevo';
              const statusInfo = STATUSES.find(s => s.value === status) ?? STATUSES[0];
              const isDeleting = deletingId === lead.id;

              return (
                <div key={lead.id} className="px-3 py-2.5 rounded-lg group"
                  style={{ background: '#FAFAFB', border: `1px solid ${isDeleting ? 'rgba(239,68,68,0.4)' : '#E8E3F5'}` }}>

                  {isDeleting ? (
                    /* Inline delete confirmation */
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium" style={{ color: '#1A0A3B' }}>
                        ¿Eliminar lead <span style={{ color: '#ef4444' }}>{lead.nombre ?? 'Sin nombre'}</span>? Esta acción no se puede deshacer.
                      </p>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => setDeletingId(null)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: '#FFFFFF', color: '#6B6480', border: '1px solid #E8E3F5' }}>
                          <X size={11} /> Cancelar
                        </button>
                        <button
                          onClick={() => confirmDelete(lead.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: '#ef4444', color: '#fff' }}>
                          <Trash2 size={11} /> Eliminar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: '#1A0A3B' }}>{lead.nombre ?? 'Sin nombre'}</span>
                          <button
                            title="Click para cambiar estado"
                            onClick={() => {
                              const idx  = STATUSES.findIndex(s => s.value === status);
                              const next = STATUSES[(idx + 1) % STATUSES.length];
                              handleStatus(lead, next.value);
                            }}
                            className="text-xs px-2 py-0.5 rounded-full font-medium transition-all hover:opacity-70 cursor-pointer"
                            style={{ background: `${statusInfo.color}18`, color: statusInfo.color, border: `1px solid ${statusInfo.color}33` }}
                          >
                            {statusInfo.label}
                          </button>
                          <span className="text-xs" style={{ color: '#6B6480' }}>
                            {new Date(lead.created_at).toLocaleDateString('es-MX')}
                          </span>
                        </div>
                        {lead.negocio && (
                          <div className="text-xs mt-0.5" style={{ color: '#4A3B6B' }}>
                            {lead.negocio}{lead.giro ? ` · ${lead.giro}` : ''}
                          </div>
                        )}
                        {lead.servicio && (
                          <div className="text-xs mt-0.5" style={{ color: '#9B6DFF' }}>{lead.servicio}</div>
                        )}
                        <div className="flex gap-3 mt-1 flex-wrap">
                          {lead.presupuesto && (
                            <span className="text-xs inline-flex items-center gap-1" style={{ color: '#6B6480' }}>
                              <DollarSign size={11} /> {lead.presupuesto}
                            </span>
                          )}
                          {lead.timeline && (
                            <span className="text-xs inline-flex items-center gap-1" style={{ color: '#6B6480' }}>
                              <Calendar size={11} /> {lead.timeline}
                            </span>
                          )}
                          {lead.whatsapp && (
                            <span className="text-xs inline-flex items-center gap-1" style={{ color: '#6B6480' }}>
                              <Smartphone size={11} /> {lead.whatsapp}
                            </span>
                          )}
                          {lead.email && (
                            <span className="text-xs inline-flex items-center gap-1" style={{ color: '#6B6480' }}>
                              <Mail size={11} /> {lead.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => setEditing(lead)}
                          title="Editar lead"
                          className="p-1.5 rounded-lg hover:bg-[#FAFAFB] transition-colors"
                          style={{ color: '#4A3B6B' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setDeletingId(lead.id)}
                          title="Eliminar lead"
                          className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
                          style={{ color: '#4A3B6B' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <EditLeadModal
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
