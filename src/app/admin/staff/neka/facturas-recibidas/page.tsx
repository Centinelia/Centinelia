'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, Download, FileText, Trash2, Loader2, AlertCircle, Receipt, Filter, CheckCircle2, XCircle, Edit3 } from 'lucide-react';

interface FacturaRecibida {
  id:                  string;
  rfc_emisor:          string;
  razon_social_emisor: string;
  uuid_fiscal:         string | null;
  fecha_emision:       string;
  tipo_comprobante:    string;
  moneda:              string;
  subtotal:            number;
  iva:                 number;
  total:               number;
  categoria_gasto:     string | null;
  deducible:           boolean;
  notas:               string | null;
  created_at:          string;
}

function money(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const CATEGORIAS = [
  'renta', 'hosting', 'software', 'servicios profesionales',
  'papeleria', 'transporte', 'telefonia', 'internet',
  'marketing', 'nomina', 'otro',
];

export default function FacturasRecibidasPage() {
  const [facturas, setFacturas] = useState<FacturaRecibida[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [deducibleFilter, setDeducibleFilter] = useState<'todas' | 'true' | 'false'>('todas');
  const [fromFilter,      setFromFilter]      = useState('');
  const [toFilter,        setToFilter]        = useState('');
  const [rfcFilter,       setRfcFilter]       = useState('');

  const xmlRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [uCategoria, setUCategoria] = useState('');
  const [uDeducible, setUDeducible] = useState(true);
  const [uNotas,     setUNotas]     = useState('');
  const [uploading,  setUploading]  = useState(false);

  const [editing, setEditing] = useState<FacturaRecibida | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (deducibleFilter !== 'todas') params.set('deducible', deducibleFilter);
      if (fromFilter) params.set('from', fromFilter);
      if (toFilter)   params.set('to', toFilter);
      if (rfcFilter)  params.set('rfc', rfcFilter.trim().toUpperCase());
      const res  = await fetch(`/api/admin/staff/neka/facturas-recibidas?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Error al cargar');
      else setFacturas(data.facturas ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [deducibleFilter, fromFilter, toFilter, rfcFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const upload = async () => {
    const xml = xmlRef.current?.files?.[0];
    const pdf = pdfRef.current?.files?.[0];
    if (!xml) { setError('Selecciona el XML'); return; }
    if (!pdf) { setError('Selecciona el PDF'); return; }
    setError(null); setUploading(true);
    try {
      const form = new FormData();
      form.append('xml', xml);
      form.append('pdf', pdf);
      if (uCategoria.trim()) form.append('categoriaGasto', uCategoria.trim());
      form.append('deducible', uDeducible ? 'true' : 'false');
      if (uNotas.trim()) form.append('notas', uNotas.trim());

      const res  = await fetch('/api/admin/staff/neka/facturas-recibidas', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al subir'); return; }
      if (xmlRef.current) xmlRef.current.value = '';
      if (pdfRef.current) pdfRef.current.value = '';
      setUCategoria(''); setUDeducible(true); setUNotas('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const download = async (f: FacturaRecibida, kind: 'xml' | 'pdf') => {
    try {
      const res  = await fetch(`/api/admin/staff/neka/facturas-recibidas/${f.id}/url?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'No se pudo generar enlace'); return; }
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (f: FacturaRecibida) => {
    if (!confirm(`¿Borrar factura ${f.razon_social_emisor} por $${money(f.total)}? El archivo se elimina del servidor.`)) return;
    try {
      const res  = await fetch(`/api/admin/staff/neka/facturas-recibidas/${f.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Error al borrar'); return; }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const totales = facturas.reduce((acc, f) => {
    acc.subtotal += f.subtotal;
    acc.iva      += f.iva;
    acc.total    += f.total;
    return acc;
  }, { subtotal: 0, iva: 0, total: 0 });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/staff/neka" className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70" style={{ color: '#6B6480' }}>
        <ArrowLeft size={12} /> Volver a Neka
      </Link>

      <header className="flex items-center gap-3 mb-6 flex-wrap">
        <Receipt size={20} style={{ color: '#15803d' }} />
        <div className="flex-1">
          <h1 className="text-xl font-bold" style={{ color: '#1A0A3B' }}>Facturas recibidas</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
            CFDIs que proveedores emiten a Centinelia. Neka parsea el XML automáticamente para extraer emisor, montos y UUID.
          </p>
        </div>
      </header>

      <section className="rounded-xl p-4 mb-5" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
        <div className="flex items-center gap-2 mb-3">
          <Upload size={14} style={{ color: '#15803d' }} />
          <h2 className="text-sm font-semibold" style={{ color: '#1A0A3B' }}>Subir factura recibida</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="text-[10px] block mb-1 uppercase font-bold tracking-widest" style={{ color: '#9B8FB5' }}>XML</label>
            <input ref={xmlRef} type="file" accept="application/xml,text/xml,.xml" className="w-full text-xs" style={{ color: '#4A3B6B' }} />
          </div>
          <div>
            <label className="text-[10px] block mb-1 uppercase font-bold tracking-widest" style={{ color: '#9B8FB5' }}>PDF</label>
            <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="w-full text-xs" style={{ color: '#4A3B6B' }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <select
            value={uCategoria}
            onChange={e => setUCategoria(e.target.value)}
            className="px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          >
            <option value="">Categoría gasto…</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs px-2" style={{ color: '#4A3B6B' }}>
            <input type="checkbox" checked={uDeducible} onChange={e => setUDeducible(e.target.checked)} />
            Deducible
          </label>
          <input
            type="text"
            value={uNotas}
            onChange={e => setUNotas(e.target.value)}
            placeholder="Notas (opcional)"
            maxLength={200}
            className="px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </div>
        <button
          onClick={upload}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: '#15803d' }}
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Subir y parsear
        </button>
      </section>

      <section className="rounded-xl p-4 mb-4" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} style={{ color: '#6B6480' }} />
          <h2 className="text-xs uppercase font-bold tracking-widest" style={{ color: '#9B8FB5' }}>Filtros</h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <select
            value={deducibleFilter}
            onChange={e => setDeducibleFilter(e.target.value as 'todas' | 'true' | 'false')}
            className="px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          >
            <option value="todas">Todas</option>
            <option value="true">Solo deducibles</option>
            <option value="false">No deducibles</option>
          </select>
          <input
            type="date"
            value={fromFilter}
            onChange={e => setFromFilter(e.target.value)}
            className="px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            placeholder="Desde"
          />
          <input
            type="date"
            value={toFilter}
            onChange={e => setToFilter(e.target.value)}
            className="px-2 py-1.5 rounded text-xs outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
          <input
            type="text"
            value={rfcFilter}
            onChange={e => setRfcFilter(e.target.value)}
            placeholder="RFC emisor exacto"
            className="px-2 py-1.5 rounded text-xs outline-none uppercase"
            style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </div>
      </section>

      <section className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E8E3F5' }}>
        {loading && (
          <div className="p-4 text-center text-xs" style={{ color: '#6B6480' }}>
            <Loader2 size={13} className="inline animate-spin mr-1.5" /> Cargando…
          </div>
        )}
        {!loading && facturas.length === 0 && (
          <div className="p-6 text-center text-xs" style={{ color: '#6B6480' }}>
            Sin facturas recibidas para estos filtros.
          </div>
        )}
        {!loading && facturas.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#FFFFFF', color: '#6B6480' }}>
                <th className="p-2 text-left uppercase tracking-widest">Fecha</th>
                <th className="p-2 text-left uppercase tracking-widest">Emisor</th>
                <th className="p-2 text-left uppercase tracking-widest">RFC</th>
                <th className="p-2 text-left uppercase tracking-widest">Categoría</th>
                <th className="p-2 text-right uppercase tracking-widest">Total</th>
                <th className="p-2 text-center uppercase tracking-widest">Deducible</th>
                <th className="p-2 text-right uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map(f => (
                <tr key={f.id} style={{ borderTop: '1px solid #E8E3F5' }}>
                  <td className="p-2" style={{ color: '#4A3B6B' }}>{fmtDate(f.fecha_emision)}</td>
                  <td className="p-2 max-w-[240px] truncate" style={{ color: '#1A0A3B' }} title={f.razon_social_emisor}>{f.razon_social_emisor}</td>
                  <td className="p-2 font-mono" style={{ color: '#6B6480' }}>{f.rfc_emisor}</td>
                  <td className="p-2" style={{ color: '#4A3B6B' }}>{f.categoria_gasto ?? '—'}</td>
                  <td className="p-2 text-right font-medium" style={{ color: '#1A0A3B' }}>${money(f.total)}</td>
                  <td className="p-2 text-center">
                    {f.deducible
                      ? <CheckCircle2 size={13} className="inline" style={{ color: '#15803d' }} />
                      : <XCircle size={13} className="inline" style={{ color: '#b91c1c' }} />}
                  </td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button onClick={() => setEditing(f)} className="p-1.5 rounded hover:opacity-70 mr-1" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="Editar">
                      <Edit3 size={11} />
                    </button>
                    <button onClick={() => download(f, 'xml')} className="p-1.5 rounded hover:opacity-70 mr-1" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="XML">
                      <Download size={11} />
                    </button>
                    <button onClick={() => download(f, 'pdf')} className="p-1.5 rounded hover:opacity-70 mr-1" style={{ background: 'rgba(108,59,255,0.05)', color: '#6C3BFF' }} title="PDF">
                      <FileText size={11} />
                    </button>
                    <button onClick={() => remove(f)} className="p-1.5 rounded hover:opacity-70" style={{ background: 'rgba(239,68,68,0.05)', color: '#b91c1c' }} title="Borrar">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#FFFFFF', borderTop: '2px solid #E8E3F5' }}>
                <td colSpan={4} className="p-2 text-right font-semibold" style={{ color: '#6B6480' }}>
                  Totales ({facturas.length} facturas):
                </td>
                <td className="p-2 text-right font-bold" style={{ color: '#1A0A3B' }}>
                  Sub ${money(totales.subtotal)} · IVA ${money(totales.iva)} · <span style={{ color: '#15803d' }}>Total ${money(totales.total)}</span>
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {error && (
        <div className="rounded-lg p-2 text-xs flex items-start gap-2 mt-3"
             style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {editing && (
        <EditModal
          factura={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function EditModal({ factura, onClose, onSaved }: { factura: FacturaRecibida; onClose: () => void; onSaved: () => void }) {
  const [categoria, setCategoria] = useState(factura.categoria_gasto ?? '');
  const [deducible, setDeducible] = useState(factura.deducible);
  const [notas,     setNotas]     = useState(factura.notas ?? '');
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);

  const save = async () => {
    setErr(null); setSaving(true);
    try {
      const res = await fetch(`/api/admin/staff/neka/facturas-recibidas/${factura.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoriaGasto: categoria.trim() || null,
          deducible,
          notas: notas.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Error'); return; }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div
        className="rounded-2xl p-5 max-w-md w-full"
        style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold mb-1" style={{ color: '#1A0A3B' }}>Editar factura recibida</h3>
        <p className="text-xs mb-4" style={{ color: '#6B6480' }}>
          {factura.razon_social_emisor} · <span className="font-mono">{factura.rfc_emisor}</span> · ${money(factura.total)}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>Categoría gasto</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full px-2 py-1.5 rounded text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            >
              <option value="">Sin categoría</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: '#4A3B6B' }}>
            <input type="checkbox" checked={deducible} onChange={e => setDeducible(e.target.checked)} />
            Es deducible
          </label>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#9B8FB5' }}>Notas</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full px-2 py-1.5 rounded text-sm outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            />
          </div>
        </div>

        {err && (
          <div className="rounded-lg p-2 text-xs flex items-start gap-2 mt-3"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
            <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: '#4A3B6B' }}>Cancelar</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#15803d' }}>
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
