'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, User, Calendar, Pause, Play, Edit3, Loader2, AlertCircle, FileText } from 'lucide-react';
import type { ClienteDoc } from '@/lib/billing/centinelia-clientes';
import { DocsSection } from './DocsSection';
import { FacturasSection } from './FacturasSection';
import OficinaModal from '@/app/portal/[token]/oficina/OficinaModal';

interface Cliente {
  id: string;
  rfc: string;
  razon_social: string;
  cp: string;
  regimen_fiscal: string;
  uso_cfdi_default: string;
  correo_facturacion: string;
  nombre_contacto: string | null;
  activo: boolean;
  conceptos: Array<{ descripcion: string; valor_unitario: number; cantidad?: number; con_iva?: boolean }>;
  periodicidad: 'monthly' | 'biweekly' | 'weekly' | 'annual';
  fecha_proxima_facturacion: string;
  fecha_ultima_facturacion: string | null;
  metodo_pago_default: 'PUE' | 'PPD';
  forma_pago_default: string;
  notas: string | null;
  docs: ClienteDoc[];
}

const PERIODICIDAD_LABEL: Record<Cliente['periodicidad'], string> = {
  monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal', annual: 'Anual',
};

export default function ClientesNekaPage() {
  const [clientes, setClientes]   = useState<Cliente[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Cliente | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/staff/neka/clientes');
      const data = await res.json();
      if (data.error) setError(data.error);
      else setClientes(data.clientes ?? []);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- `refresh` dispara setLoading; patrón "fetch on mount + manual refresh" no calza con la regla React 19 sin migrar a SWR/TanStack Query.
  useEffect(() => { refresh(); }, [refresh]);

  const togglePause = async (c: Cliente) => {
    await fetch(`/api/admin/staff/neka/clientes/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !c.activo }),
    });
    refresh();
  };

  const totalMensual = clientes
    .filter(c => c.activo && c.periodicidad === 'monthly')
    .reduce((sum, c) => sum + c.conceptos.reduce((s, cc) => s + (cc.valor_unitario * (cc.cantidad ?? 1) * (cc.con_iva !== false ? 1.16 : 1)), 0), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link
        href="/admin/staff/neka"
        className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a config
      </Link>

      <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
            Clientes de Centinelia
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
            Catálogo que Neka usa para facturar proactivamente. Cada cliente activo se factura automáticamente en su fecha próxima.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
          style={{
            padding:    '9px 18px',
            background: '#6C3BFF',
            color:      '#ffffff',
            boxShadow:  '0 2px 8px rgba(108,59,255,0.32)',
          }}
        >
          <Plus size={14} />
          Nuevo cliente
        </button>
      </header>

      {/* Stats */}
      {!loading && clientes.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <StatCard label="Activos" value={String(clientes.filter(c => c.activo).length)} />
          <StatCard label="Pausados" value={String(clientes.filter(c => !c.activo).length)} />
          <StatCard label="Ingreso mensual estimado" value={`$${totalMensual.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
          <Loader2 size={12} className="animate-spin" /> Cargando…
        </div>
      )}

      {error && (
        <div className="rounded-lg p-3 text-xs flex items-start gap-2 mb-4"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && clientes.length === 0 && (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <User size={32} className="mx-auto mb-2" style={{ color: 'var(--c-text-4)' }} />
          <p className="text-sm mb-1" style={{ color: 'var(--c-text)' }}>Aún no hay clientes registrados</p>
          <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>Agrega el primero para que Nala empiece a facturar automáticamente en el ciclo definido.</p>
        </div>
      )}

      <div className="space-y-2">
        {clientes.map(c => (
          <article
            key={c.id}
            className="p-4 rounded-xl flex items-start gap-4"
            style={{
              background: c.activo ? 'var(--c-surface)' : 'rgba(0,0,0,0.02)',
              border: '1px solid var(--c-border)',
              opacity: c.activo ? 1 : 0.6,
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{c.razon_social}</h3>
                <code className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}>{c.rfc}</code>
                {!c.activo && <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--c-text-3)' }}>pausado</span>}
              </div>
              <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                {c.correo_facturacion} · CP {c.cp} · régimen {c.regimen_fiscal} · {PERIODICIDAD_LABEL[c.periodicidad]}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--c-text-2)' }}>
                {c.conceptos.length} concepto{c.conceptos.length !== 1 ? 's' : ''}: {c.conceptos.slice(0, 2).map(cc => `${cc.descripcion} $${cc.valor_unitario}`).join(', ')}
                {c.conceptos.length > 2 ? ` +${c.conceptos.length - 2} más` : ''}
              </p>
              <p className="text-xs mt-1 flex items-center gap-1 flex-wrap" style={{ color: 'var(--c-text-3)' }}>
                <Calendar size={11} />
                Próxima factura: {c.fecha_proxima_facturacion}
                {c.fecha_ultima_facturacion && ` · Última: ${c.fecha_ultima_facturacion}`}
                {c.docs && c.docs.length > 0 && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    · <FileText size={11} /> {c.docs.length} doc{c.docs.length !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => togglePause(c)}
                className="p-2 rounded-lg transition-opacity hover:opacity-70"
                style={{ background: 'rgba(108,59,255,0.05)', color: c.activo ? '#b45309' : '#15803d' }}
                title={c.activo ? 'Pausar' : 'Activar'}
              >
                {c.activo ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button
                onClick={() => { setEditing(c); setShowForm(true); }}
                className="p-2 rounded-lg transition-opacity hover:opacity-70"
                style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }}
                title="Editar"
              >
                <Edit3 size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {showForm && (
        <ClienteForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--c-text-4)' }}>{label}</p>
      <p className="text-lg font-bold mt-1" style={{ color: 'var(--c-text)' }}>{value}</p>
    </div>
  );
}

interface FormState {
  rfc: string;
  razon_social: string;
  cp: string;
  regimen_fiscal: string;
  uso_cfdi_default: string;
  correo_facturacion: string;
  nombre_contacto: string;
  activo: boolean;
  periodicidad: Cliente['periodicidad'];
  fecha_proxima_facturacion: string;
  metodo_pago_default: 'PUE' | 'PPD';
  forma_pago_default: string;
  notas: string;
  conceptos: Array<{ descripcion: string; valor_unitario: string; cantidad: string; con_iva: boolean }>;
}

function toFormState(c: Cliente | null): FormState {
  return {
    rfc:                       c?.rfc                       ?? '',
    razon_social:              c?.razon_social              ?? '',
    cp:                        c?.cp                        ?? '',
    regimen_fiscal:            c?.regimen_fiscal            ?? '601',
    uso_cfdi_default:          c?.uso_cfdi_default          ?? 'G03',
    correo_facturacion:        c?.correo_facturacion        ?? '',
    nombre_contacto:           c?.nombre_contacto           ?? '',
    activo:                    c?.activo                    ?? true,
    periodicidad:              c?.periodicidad              ?? 'monthly',
    fecha_proxima_facturacion: c?.fecha_proxima_facturacion ?? new Date().toISOString().slice(0, 10),
    metodo_pago_default:       c?.metodo_pago_default       ?? 'PPD',
    forma_pago_default:        c?.forma_pago_default        ?? '99',
    notas:                     c?.notas                     ?? '',
    conceptos: c?.conceptos?.length
      ? c.conceptos.map(cc => ({
          descripcion:    cc.descripcion,
          valor_unitario: String(cc.valor_unitario),
          cantidad:       String(cc.cantidad ?? 1),
          con_iva:        cc.con_iva !== false,
        }))
      : [{ descripcion: '', valor_unitario: '', cantidad: '1', con_iva: true }],
  };
}

function ClienteForm({ initial, onClose, onSaved }: { initial: Cliente | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF]           = useState<FormState>(toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const body = {
        rfc: f.rfc.toUpperCase().trim(),
        razon_social: f.razon_social.trim(),
        cp: f.cp.trim(),
        regimen_fiscal: f.regimen_fiscal,
        uso_cfdi_default: f.uso_cfdi_default,
        correo_facturacion: f.correo_facturacion.trim(),
        nombre_contacto: f.nombre_contacto.trim() || null,
        activo: f.activo,
        periodicidad: f.periodicidad,
        fecha_proxima_facturacion: f.fecha_proxima_facturacion,
        metodo_pago_default: f.metodo_pago_default,
        forma_pago_default: f.forma_pago_default,
        notas: f.notas.trim() || null,
        conceptos: f.conceptos
          .filter(c => c.descripcion.trim() && c.valor_unitario)
          .map(c => ({
            descripcion:    c.descripcion.trim(),
            valor_unitario: Number(c.valor_unitario),
            cantidad:       Number(c.cantidad) || 1,
            con_iva:        c.con_iva,
          })),
      };
      const url = initial ? `/api/admin/staff/neka/clientes/${initial.id}` : '/api/admin/staff/neka/clientes';
      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const addConcepto = () => setF({ ...f, conceptos: [...f.conceptos, { descripcion: '', valor_unitario: '', cantidad: '1', con_iva: true }] });
  const rmConcepto = (i: number) => setF({ ...f, conceptos: f.conceptos.filter((_, idx) => idx !== i) });
  const updateConcepto = (i: number, patch: Partial<FormState['conceptos'][number]>) =>
    setF({ ...f, conceptos: f.conceptos.map((c, idx) => idx === i ? { ...c, ...patch } : c) });

  return (
    <OficinaModal
      open
      onClose={onClose}
      size="xl"
      eyebrow={initial ? 'Editar cliente' : 'Nuevo cliente'}
      title={initial?.razon_social || (initial ? 'Editar cliente' : 'Nuevo cliente de facturación')}
      description={initial
        ? 'Actualiza datos fiscales, conceptos, documentos o facturas emitidas.'
        : 'Neka usará estos datos para timbrar automáticamente cada ciclo.'}
      footer={
        <>
          <OficinaModal.SecondaryAction onClick={onClose} disabled={saving}>Cancelar</OficinaModal.SecondaryAction>
          <OficinaModal.PrimaryAction onClick={submit} loading={saving}>
            {initial ? 'Guardar cambios' : 'Crear cliente'}
          </OficinaModal.PrimaryAction>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Sección: Datos fiscales */}
        <section className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="RFC">
            <OficinaModal.Input value={f.rfc} onChange={e => setF({ ...f, rfc: e.target.value })} placeholder="TEN010518AL3" style={{ textTransform: 'uppercase' }} />
          </OficinaModal.Field>
          <OficinaModal.Field label="CP">
            <OficinaModal.Input value={f.cp} onChange={e => setF({ ...f, cp: e.target.value })} placeholder="66470" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Razón social" className="col-span-2">
            <OficinaModal.Input value={f.razon_social} onChange={e => setF({ ...f, razon_social: e.target.value })} placeholder="TORTILLAS ESTRELLA DEL NORTE" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Régimen fiscal">
            <OficinaModal.Input value={f.regimen_fiscal} onChange={e => setF({ ...f, regimen_fiscal: e.target.value })} placeholder="601" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Uso CFDI">
            <OficinaModal.Input value={f.uso_cfdi_default} onChange={e => setF({ ...f, uso_cfdi_default: e.target.value })} placeholder="G03" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Correo de facturación" className="col-span-2">
            <OficinaModal.Input value={f.correo_facturacion} onChange={e => setF({ ...f, correo_facturacion: e.target.value })} placeholder="facturacion@cliente.com" type="email" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Contacto" hint="opcional" className="col-span-2">
            <OficinaModal.Input value={f.nombre_contacto} onChange={e => setF({ ...f, nombre_contacto: e.target.value })} placeholder="Nombre del contable" />
          </OficinaModal.Field>
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: '#F0EBFA' }} />

        {/* Sección: Ciclo y pagos */}
        <section className="grid grid-cols-2 gap-3">
          <OficinaModal.Field label="Periodicidad">
            <OficinaModal.Select value={f.periodicidad} onChange={e => setF({ ...f, periodicidad: e.target.value as Cliente['periodicidad'] })}>
              <option value="monthly">Mensual</option>
              <option value="biweekly">Quincenal</option>
              <option value="weekly">Semanal</option>
              <option value="annual">Anual</option>
            </OficinaModal.Select>
          </OficinaModal.Field>
          <OficinaModal.Field label="Próxima facturación">
            <OficinaModal.Input type="date" value={f.fecha_proxima_facturacion} onChange={e => setF({ ...f, fecha_proxima_facturacion: e.target.value })} />
          </OficinaModal.Field>
          <OficinaModal.Field label="Método de pago">
            <OficinaModal.Select value={f.metodo_pago_default} onChange={e => setF({ ...f, metodo_pago_default: e.target.value as 'PUE' | 'PPD' })}>
              <option value="PPD">PPD (parcialidades / diferido)</option>
              <option value="PUE">PUE (una sola exhibición)</option>
            </OficinaModal.Select>
          </OficinaModal.Field>
          <OficinaModal.Field label="Forma de pago" hint="clave SAT">
            <OficinaModal.Input value={f.forma_pago_default} onChange={e => setF({ ...f, forma_pago_default: e.target.value })} placeholder="99" />
          </OficinaModal.Field>
          <OficinaModal.Field label="Notas internas" hint="opcional" className="col-span-2">
            <OficinaModal.Textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} rows={2} />
          </OficinaModal.Field>
        </section>

        {/* Divider */}
        <div style={{ height: 1, background: '#F0EBFA' }} />

        {/* Sección: Conceptos */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: '#6B6480' }}>
              Conceptos a facturar cada ciclo
            </label>
            <button
              type="button"
              onClick={addConcepto}
              className="text-[12px] font-semibold transition-colors"
              style={{ color: '#6C3BFF' }}
            >
              + Agregar concepto
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {f.conceptos.map((c, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center rounded-xl" style={{ background: '#FAFAFB', border: '1px solid #F0EBFA', padding: '10px' }}>
                <div className="col-span-6"><OficinaModal.Input value={c.descripcion} onChange={e => updateConcepto(i, { descripcion: e.target.value })} placeholder="Descripción" /></div>
                <div className="col-span-2"><OficinaModal.Input value={c.valor_unitario} onChange={e => updateConcepto(i, { valor_unitario: e.target.value })} placeholder="Precio" type="number" step="0.01" /></div>
                <div className="col-span-1"><OficinaModal.Input value={c.cantidad} onChange={e => updateConcepto(i, { cantidad: e.target.value })} placeholder="Cant" type="number" /></div>
                <label className="flex items-center gap-1.5 text-[12px] col-span-2 cursor-pointer" style={{ color: '#6B6480' }}>
                  <input type="checkbox" checked={c.con_iva} onChange={e => updateConcepto(i, { con_iva: e.target.checked })} style={{ accentColor: '#6C3BFF' }} />
                  IVA
                </label>
                <button
                  type="button"
                  onClick={() => rmConcepto(i)}
                  className="col-span-1 flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
                  style={{ background: 'rgba(239,68,68,0.06)', color: '#B91C1C', width: 32, height: 32, marginLeft: 'auto' }}
                  aria-label="Quitar concepto"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Activo toggle */}
        <label className="flex items-center gap-2 text-[13px] cursor-pointer rounded-xl" style={{ padding: '10px 14px', background: '#FAFAFB', border: '1px solid #F0EBFA', color: '#1A0A3B' }}>
          <input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} style={{ accentColor: '#6C3BFF' }} />
          Cliente activo <span style={{ color: '#6B6480' }}>· Neka factura automáticamente en su fecha</span>
        </label>

        {initial && (
          <>
            <div style={{ height: 1, background: '#F0EBFA' }} />
            <DocsSection
              clienteId={initial.id}
              initialDocs={initial.docs ?? []}
              onClienteUpdated={onSaved}
            />
            <div style={{ height: 1, background: '#F0EBFA' }} />
            <FacturasSection clienteId={initial.id} />
          </>
        )}

        {error && <OficinaModal.Alert tone="danger">{error}</OficinaModal.Alert>}
      </div>
    </OficinaModal>
  );
}
