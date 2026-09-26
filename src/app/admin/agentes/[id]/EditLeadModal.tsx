'use client';

import { useState } from 'react';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';

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
  created_at: string;
}

interface Props {
  lead: Lead;
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}

export default function EditLeadModal({ lead, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre:      lead.nombre      ?? '',
    negocio:     lead.negocio     ?? '',
    giro:        lead.giro        ?? '',
    servicio:    lead.servicio    ?? '',
    presupuesto: lead.presupuesto ?? '',
    timeline:    lead.timeline    ?? '',
    email:       lead.email       ?? '',
    whatsapp:    lead.whatsapp    ?? '',
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Error al guardar');
        return;
      }
      const updated = await res.json();
      onSaved(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <OficinaModal
      open
      onClose={onClose}
      size="md"
      eyebrow="Lead"
      title={form.nombre || form.negocio || 'Editar lead'}
      description="Actualiza los datos del prospecto capturados por el empleado."
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={saving}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={handleSave} loading={saving}>Guardar cambios</OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <OficinaModal.Field label="Nombre del contacto">
          <OficinaModal.Input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Juan Pérez" />
        </OficinaModal.Field>

        <div className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="Negocio">
            <OficinaModal.Input value={form.negocio} onChange={e => setForm(f => ({ ...f, negocio: e.target.value }))} placeholder="Tortillas Estrella" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Giro">
            <OficinaModal.Input value={form.giro} onChange={e => setForm(f => ({ ...f, giro: e.target.value }))} placeholder="Alimentos" />
          </OficinaModal.Field>
        </div>

        <OficinaModal.Field label="Servicio de interés">
          <OficinaModal.Input value={form.servicio} onChange={e => setForm(f => ({ ...f, servicio: e.target.value }))} placeholder="Recepcionista IA" />
        </OficinaModal.Field>

        <div className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="Presupuesto">
            <OficinaModal.Input value={form.presupuesto} onChange={e => setForm(f => ({ ...f, presupuesto: e.target.value }))} placeholder="$5,000 - $10,000" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Para cuándo">
            <OficinaModal.Input value={form.timeline} onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))} placeholder="Este mes" />
          </OficinaModal.Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="Email">
            <OficinaModal.Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="juan@negocio.com" />
          </OficinaModal.Field>
          <OficinaModal.Field label="WhatsApp">
            <OficinaModal.Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+52 81 1234 5678" />
          </OficinaModal.Field>
        </div>

        {error && <OficinaModal.Alert tone="danger">{error}</OficinaModal.Alert>}
      </div>
    </OficinaModal>
  );
}
