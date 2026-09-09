'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, X, Loader2, AlertCircle, Image as ImageIcon, CheckCircle2, ZoomIn, Search, Plus, Trash2 } from 'lucide-react';

interface Producto {
  sku?:              string;
  descripcion?:      string;
  nombre?:           string;
  cantidad?:         number;
  cant?:             number;
  unidad?:           string;
  precio_unitario?:  number;
  p_unit?:           number;
  precio?:           number;
}

interface PendingItem {
  id:              string;
  email_id:        string;
  image_index:     number | null;
  remision_index:  number | null;
  reason:          string;
  extracted:       Record<string, unknown>;
  candidates:      { top?: string; segundo?: string } | null;
  status:          string;
  folio:           string | null;
  cliente_texto:   string | null;
  rfc_matched:     string | null;
  total:           number | null;
  fecha:           string | null;
  productos:       Producto[] | null;
  created_at:      string;
  image_url:       string | null;
  image_filename:  string | null;
  email: {
    from_address: string | null;
    subject:      string | null;
    received_at:  string | null;
  } | null;
  /** Archivos fuente (xlsx) para el excel_pipeline path. Signed URLs (60min). */
  source_files?: Array<{ filename: string; url: string }>;
}

interface CatalogClient {
  rfc:           string;
  razon_social:  string;
  uso_cfdi:      string | null;
  regimen:       string | null;
  codigo_postal: string | null;
}

export default function PendientesPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [items,   setItems]   = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/${token}/billing/pendientes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function doAction(id: string, action: 'approve' | 'reject' | 'edit', corrections?: Record<string, unknown>) {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/portal/${token}/billing/pendientes/${id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, corrections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: data.status ?? action } : i));
      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== id));
      }, 8000);
    } catch (e) {
      alert(`No se pudo ${action}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href={`/portal/${token}/oficina/facturas`}
        className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a Facturas
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
          Pendientes de revisión
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
          Cada tarjeta es una remisión que Nala procesó. Revisa lo que leyó, corrige lo que esté mal (elige el cliente del catálogo, ajusta productos o total) y aprueba para timbrar. Si la foto no sirve, rechaza y súbela manual desde Facturación.
        </p>
      </header>

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

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl p-8 text-center"
             style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <CheckCircle2 size={32} style={{ color: '#22c55e', margin: '0 auto 8px' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
            Sin pendientes. Todas las notitas están al día.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map(item => (
          <PendingCard
            key={item.id}
            token={token}
            item={item}
            busy={busy === item.id}
            onApprove={(patch) => doAction(item.id, 'approve', patch)}
            onEditApprove={(patch) => doAction(item.id, 'edit', patch)}
            onReject={() => doAction(item.id, 'reject')}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function PendingCard({
  token, item, busy, onApprove, onEditApprove, onReject,
}: {
  token:         string;
  item:          PendingItem;
  busy:          boolean;
  onApprove:     (patch: Record<string, unknown>) => void;
  onEditApprove: (patch: Record<string, unknown>) => void;
  onReject:      () => void;
}) {
  const [showLightbox, setShowLightbox] = useState(false);

  // Editable state — inicializado desde item.
  const [folio,    setFolio]    = useState<string>(item.folio ?? '');
  const [fecha,    setFecha]    = useState<string>(item.fecha ?? '');
  const [rfc,      setRfc]      = useState<string>(item.rfc_matched ?? '');
  const [cliente,  setCliente]  = useState<string>(item.cliente_texto ?? '');
  const [total,    setTotal]    = useState<string>(item.total != null ? String(item.total) : '');
  // Marca si el usuario editó el total manualmente. Si no, el total se sincroniza
  // con la suma de productos (recalcula automático al editar cantidad/precio).
  const [totalManuallyEdited, setTotalManuallyEdited] = useState<boolean>(false);
  const [productos, setProductos] = useState<Producto[]>(
    Array.isArray(item.productos) && item.productos.length > 0
      ? item.productos
      : []
  );

  // Auto-recalc del total desde suma de subtotales cuando cambian productos,
  // salvo que el usuario haya editado el total a mano (respetar override).
  const productosSum = useMemo(() => {
    return productos.reduce((s, p) => {
      const q = Number(p.cantidad ?? p.cant ?? 0);
      const price = Number(p.precio_unitario ?? p.p_unit ?? p.precio ?? 0);
      return s + (Number.isFinite(q) && Number.isFinite(price) ? q * price : 0);
    }, 0);
  }, [productos]);
  useEffect(() => {
    if (!totalManuallyEdited) {
      const rounded = Math.round(productosSum * 100) / 100;
      setTotal(rounded > 0 ? String(rounded) : '');
    }
  }, [productosSum, totalManuallyEdited]);

  const isResolved = item.status !== 'pending';
  const statusPill =
    item.status === 'approved'         ? { label: '✓ Aprobada',              bg: 'rgba(34,197,94,0.15)',   fg: '#15803d' } :
    item.status === 'edited_approved'  ? { label: '✓ Corregida y aprobada',   bg: 'rgba(108,59,255,0.15)', fg: '#6C3BFF' } :
    item.status === 'rejected'         ? { label: '✕ Rechazada',              bg: 'rgba(239,68,68,0.15)',  fg: '#b91c1c' } :
    null;

  const originalCliente = item.cliente_texto ?? '';
  const originalRfc     = item.rfc_matched ?? '';
  const originalTotal   = item.total != null ? String(item.total) : '';
  const originalFolio   = item.folio ?? '';
  const originalFecha   = item.fecha ?? '';
  const wasEdited =
    cliente.trim() !== originalCliente.trim() ||
    rfc.trim()     !== originalRfc.trim() ||
    String(total)  !== originalTotal ||
    folio.trim()   !== originalFolio.trim() ||
    fecha          !== originalFecha ||
    JSON.stringify(productos) !== JSON.stringify(item.productos ?? []);

  function buildPatch(): Record<string, unknown> {
    return {
      folio, fecha, cliente, rfc,
      total: total ? Number(total) : null,
      productos,
    };
  }

  function handleApprove() {
    if (isResolved) return;
    // Validaciones frontend: bloquear approve con datos que el backend rechazaría
    // igualmente pero con menos claridad. Beatriz obtiene feedback inmediato.
    const rfcClean = rfc.trim();
    if (!rfcClean) {
      alert('Falta el RFC del cliente. Búscalo en el catálogo o escríbelo antes de aprobar.');
      return;
    }
    if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(rfcClean)) {
      alert(`El RFC "${rfcClean}" no tiene formato válido (12-13 caracteres SAT, ej. CAL051103F36). Corrígelo antes de aprobar.`);
      return;
    }
    if (!cliente.trim()) {
      alert('Falta el nombre del cliente. Selecciónalo del catálogo antes de aprobar.');
      return;
    }
    if (productos.length === 0) {
      alert('No hay productos en esta factura. Agrega al menos uno antes de aprobar.');
      return;
    }
    const productoSinSku = productos.find(p => !(p.sku ?? '').toString().trim());
    if (productoSinSku) {
      alert(`Un producto no tiene código SKU (${productoSinSku.descripcion ?? productoSinSku.nombre ?? 'sin descripción'}). Corrígelo antes de aprobar.`);
      return;
    }
    const totalNum = total ? Number(total) : 0;
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      alert(`Total inválido (${total}). Debe ser mayor a 0.`);
      return;
    }
    const patch = buildPatch();
    const msg = wasEdited
      ? '¿Guardar cambios y timbrar? Nala procesará con estos datos.'
      : '¿Aprobar y timbrar esta remisión?';
    if (!confirm(msg)) return;
    if (wasEdited) onEditApprove(patch);
    else onApprove(patch);
  }

  function handleReject() {
    if (isResolved) return;
    if (!confirm('¿Rechazar esta factura permanentemente? No se timbrará y no vuelve a aparecer. Si dudas, cierra este mensaje y déjala pendiente.')) return;
    onReject();
  }

  return (
    <div className="rounded-2xl overflow-hidden relative"
         style={{
           background: 'var(--c-surface)',
           border: '1px solid var(--c-border)',
           opacity: isResolved ? 0.75 : 1,
           transition: 'opacity 300ms',
         }}>
      {statusPill && (
        <div className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-xs font-semibold"
             style={{ background: statusPill.bg, color: statusPill.fg }}>
          {statusPill.label}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-0">
        {/* Origen: foto (vision path) o Excel (excel_pipeline) */}
        <div className="p-3" style={{ background: 'rgba(0,0,0,0.02)', borderRight: '1px solid var(--c-border)' }}>
          {item.image_url ? (
            <>
              <button
                type="button"
                onClick={() => setShowLightbox(true)}
                className="group relative block w-full rounded-lg overflow-hidden cursor-zoom-in"
                title="Click para ver en grande y hacer zoom"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt={item.image_filename ?? 'notita'}
                     className="w-full object-contain group-hover:opacity-95 transition-opacity"
                     style={{ maxHeight: 320 }} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                     style={{ background: 'rgba(26,10,59,0.35)' }}>
                  <div className="rounded-full p-2" style={{ background: 'rgba(255,255,255,0.95)' }}>
                    <ZoomIn size={20} style={{ color: '#1A0A3B' }} />
                  </div>
                </div>
              </button>
              <p className="text-[10px] mt-2 truncate" style={{ color: 'var(--c-text-4)' }}>
                {item.image_filename ?? '(sin nombre)'} · click para zoom
              </p>
              {item.remision_index !== null && item.remision_index !== undefined && (
                <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
                  Remisión <strong>{(item.remision_index ?? 0) + 1}</strong> de la foto
                </p>
              )}
            </>
          ) : (
            /* Excel path — sin foto, mostrar metadata del bloque */
            <div className="flex flex-col gap-2 text-[11px]" style={{ color: 'var(--c-text-3)' }}>
              <div className="rounded-lg p-3 flex items-center gap-2" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.15)' }}>
                <div className="rounded-full p-1.5" style={{ background: 'rgba(108,59,255,0.15)' }}>
                  <ImageIcon size={14} style={{ color: '#6C3BFF' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#6C3BFF' }}>Excel</p>
                  <p className="text-xs truncate" style={{ color: 'var(--c-text)' }}>{item.email?.subject ?? 'Correo semanal'}</p>
                </div>
              </div>
              {item.remision_index !== null && item.remision_index !== undefined && (
                <p className="text-[10px]">
                  Bloque <strong>{(item.remision_index ?? 0) + 1}</strong> del Excel
                </p>
              )}
              {item.folio && (
                <p className="text-[10px]">
                  Folios: <span style={{ color: 'var(--c-text)' }}>{item.folio}</span>
                </p>
              )}
              {item.source_files && item.source_files.length > 0 && (
                <div className="flex flex-col gap-1 pt-1" style={{ borderTop: '1px solid var(--c-border)' }}>
                  <p className="text-[9px] uppercase tracking-wider font-semibold pt-1" style={{ color: 'var(--c-text-4)' }}>
                    Archivo original
                  </p>
                  {item.source_files.map((f, i) => (
                    <a
                      key={i}
                      href={f.url}
                      download={f.filename}
                      className="text-[10px] hover:underline truncate"
                      style={{ color: '#6C3BFF' }}
                      title={f.filename}
                    >
                      ↓ {f.filename}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="p-4">
          <div className="mb-3">
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#f59e0b' }}>
              Requiere revisión
            </span>
            <p className="text-sm mt-0.5 whitespace-pre-line" style={{ color: 'var(--c-text)' }}>
              {item.reason}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--c-text-3)' }}>
              De: {item.email?.from_address ?? '—'} · {new Date(item.created_at).toLocaleString('es-MX')}
            </p>
          </div>

          {/* Row: folio + fecha + total */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <InputField label="Folio" value={folio} onChange={setFolio} disabled={isResolved} />
            <InputField label="Fecha" type="date" value={fecha} onChange={setFecha} disabled={isResolved} />
            <CurrencyField
              label="Total"
              value={total}
              onChange={v => { setTotal(v); setTotalManuallyEdited(true); }}
              disabled={isResolved}
            />
          </div>

          {/* Cliente: autocomplete contra catálogo */}
          <ClientPicker
            token={token}
            cliente={cliente}
            rfc={rfc}
            onPick={(c) => {
              setCliente(c.razon_social);
              setRfc(c.rfc);
            }}
            onFreeText={(txt) => setCliente(txt)}
            onRfcChange={setRfc}
            hintOriginal={item.cliente_texto ?? undefined}
            disabled={isResolved}
          />

          {/* Productos editables */}
          <div className="mt-4">
            <div className="mb-1.5">
              <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--c-text-4)' }}>
                Productos ({productos.length})
              </span>
            </div>
            {productos.length === 0 ? (
              <p className="text-xs italic" style={{ color: 'var(--c-text-3)' }}>
                Nala no extrajo productos. Si vas a timbrar, agrega al menos uno.
              </p>
            ) : (
              <>
                {/* Header row: mismos anchos que ProductRow */}
                <div className="grid grid-cols-[1fr_70px_90px_80px_30px] gap-1 items-center mb-1 px-1">
                  <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--c-text-4)' }}>Descripción</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-right" style={{ color: 'var(--c-text-4)' }}>Cantidad</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-right" style={{ color: 'var(--c-text-4)' }}>Precio</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-right pr-1" style={{ color: 'var(--c-text-4)' }}>Total</span>
                  <span />
                </div>
                <div className="space-y-1">
                  {productos.map((p, i) => (
                    <ProductRow
                      key={i}
                      producto={p}
                      disabled={isResolved}
                      onChange={(next) => setProductos(prev => prev.map((x, j) => i === j ? next : x))}
                      onRemove={() => setProductos(prev => prev.filter((_, j) => j !== i))}
                    />
                  ))}
                </div>
              </>
            )}
            {!isResolved && (
              <button
                onClick={() => setProductos(prev => [...prev, { descripcion: '', cantidad: 1, precio_unitario: 0 }])}
                className="mt-2 text-[10px] font-semibold inline-flex items-center gap-1 hover:opacity-80"
                style={{ color: '#6C3BFF' }}
              >
                <Plus size={10} /> Agregar producto
              </button>
            )}
          </div>

          {/* Botones */}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={handleApprove}
              disabled={busy || isResolved}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: wasEdited ? '#6C3BFF' : '#22c55e', color: '#fff' }}
            >
              <Check size={12} /> {wasEdited ? 'Guardar cambios y timbrar' : 'Aprobar y timbrar'}
            </button>
            <button
              onClick={handleReject}
              disabled={busy || isResolved}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'transparent', color: '#b91c1c', border: '1px solid rgba(239,68,68,0.35)' }}
            >
              <X size={12} /> Rechazar
            </button>
            {busy && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--c-text-3)' }} />}
          </div>
        </div>
      </div>

      {showLightbox && item.image_url && (
        <ImageLightbox
          url={item.image_url}
          filename={item.image_filename ?? 'notita'}
          onClose={() => setShowLightbox(false)}
        />
      )}
    </div>
  );
}

// ─── Client picker con autocomplete ─────────────────────────────────────────

function ClientPicker({
  token, cliente, rfc, onPick, onFreeText, onRfcChange, hintOriginal, disabled,
}: {
  token:        string;
  cliente:      string;
  rfc:          string;
  onPick:       (c: CatalogClient) => void;
  onFreeText:   (txt: string) => void;
  onRfcChange:  (rfc: string) => void;
  hintOriginal?: string;
  disabled?:    boolean;
}) {
  const [query, setQuery]         = useState(cliente);
  const [results, setResults]     = useState<CatalogClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen]           = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync query cuando cliente cambia externamente.
  useEffect(() => { setQuery(cliente); }, [cliente]);

  // Debounced fetch.
  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/portal/${token}/billing/catalog-clients?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.clients ?? []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, token]);

  // Cerrar dropdown al click fuera.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="grid grid-cols-[1fr_180px] gap-2" ref={dropdownRef}>
      <div className="relative">
        <label className="block text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--c-text-4)' }}>
          Cliente
        </label>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--c-text-4)' }} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); onFreeText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder="Buscar por nombre o RFC…"
            className="w-full pl-7 pr-2 py-1.5 rounded text-xs"
            style={{ background: '#fff', border: '1px solid var(--c-border)' }}
          />
        </div>
        {hintOriginal && hintOriginal !== cliente && (
          <p className="text-[9px] mt-0.5 italic" style={{ color: 'var(--c-text-3)' }}>
            Nala leyó: &ldquo;{hintOriginal}&rdquo;
          </p>
        )}
        {open && results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg shadow-lg"
               style={{ background: '#fff', border: '1px solid var(--c-border)' }}>
            {results.map(c => (
              <button
                key={c.rfc}
                type="button"
                onClick={() => { onPick(c); setQuery(c.razon_social); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-[#F5F2FB] border-b last:border-b-0"
                style={{ borderColor: 'var(--c-border)' }}
              >
                <div className="font-semibold" style={{ color: 'var(--c-text)' }}>{c.razon_social}</div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--c-text-3)' }}>{c.rfc}</div>
              </button>
            ))}
          </div>
        )}
        {open && !searching && query.length >= 2 && results.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg px-3 py-2 text-[11px]"
               style={{ background: '#fff', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
            Sin coincidencias en tu catálogo. Si es un cliente nuevo, dalo de alta en CONTPAQi primero.
          </div>
        )}
      </div>
      <div>
        <label className="block text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--c-text-4)' }}>
          RFC
        </label>
        <input
          value={rfc}
          onChange={e => onRfcChange(e.target.value.toUpperCase())}
          disabled={disabled}
          placeholder="Se llena automático"
          className="w-full px-2 py-1.5 rounded text-xs font-mono"
          style={{ background: rfc ? '#fff' : '#F9F8FC', border: '1px solid var(--c-border)' }}
        />
      </div>
    </div>
  );
}

// ─── Product row ────────────────────────────────────────────────────────────

function ProductRow({
  producto, disabled, onChange, onRemove,
}: {
  producto: Producto;
  disabled?: boolean;
  onChange: (p: Producto) => void;
  onRemove: () => void;
}) {
  const desc  = producto.descripcion ?? producto.nombre ?? '';
  const qty   = producto.cantidad ?? producto.cant ?? 0;
  const price = producto.precio_unitario ?? producto.p_unit ?? producto.precio ?? 0;
  const subtotal = useMemo(() => Number((qty * price).toFixed(2)), [qty, price]);

  return (
    <div className="grid grid-cols-[1fr_70px_90px_80px_30px] gap-1 items-center">
      <input
        value={desc}
        onChange={e => onChange({ ...producto, descripcion: e.target.value })}
        placeholder="Descripción"
        disabled={disabled}
        className="px-2 py-1 rounded text-xs"
        style={{ background: '#fff', border: '1px solid var(--c-border)' }}
      />
      <input
        type="number" step="0.01" min="0"
        value={qty}
        onChange={e => onChange({ ...producto, cantidad: Number(e.target.value) })}
        disabled={disabled}
        className="px-2 py-1 rounded text-xs text-right"
        style={{ background: '#fff', border: '1px solid var(--c-border)' }}
      />
      <CurrencyInput
        value={price}
        onChange={v => onChange({ ...producto, precio_unitario: Number(v) })}
        disabled={disabled}
        className="px-2 py-1 rounded text-xs text-right"
      />
      <span className="text-xs text-right pr-1" style={{ color: 'var(--c-text-3)' }}>
        {formatMxn(subtotal)}
      </span>
      {!disabled && (
        <button onClick={onRemove} className="p-1 rounded hover:bg-[#FEE2E2]" title="Eliminar">
          <Trash2 size={11} style={{ color: '#b91c1c' }} />
        </button>
      )}
    </div>
  );
}

// ─── Inputs helpers ─────────────────────────────────────────────────────────

function InputField({
  label, value, onChange, type = 'text', step, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; step?: string; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--c-text-4)' }}>
        {label}
      </span>
      <input
        type={type}
        step={step}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-2 py-1.5 rounded text-xs"
        style={{ background: '#fff', border: '1px solid var(--c-border)' }}
      />
    </label>
  );
}

/**
 * Input de moneda MXN sin label: al focus muestra dígitos+punto para editar
 * libremente; al blur formatea a "$1,234.56" con separadores. Guarda el valor
 * plano (sin $ ni comas) en el state para no romper el submit al backend.
 */
function CurrencyInput({
  value, onChange, disabled, className,
}: {
  value: string | number; onChange: (v: string) => void; disabled?: boolean; className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const strValue = String(value ?? '');
  const parsed = Number(strValue);
  const display = focused
    ? strValue
    : (strValue === '' || !Number.isFinite(parsed))
      ? ''
      : `$${parsed.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={e => {
        // Normaliza input español ("8.972,60"), miles-con-punto ("8,972.60"),
        // o mixto. Regla: si hay ambos . y , el último caracter decide cuál es
        // el decimal; el otro es separador de miles y se quita. Si solo hay
        // uno, es decimal (se convierte a punto para JS Number).
        let raw = e.target.value.replace(/[$\s]/g, '');
        const lastDot   = raw.lastIndexOf('.');
        const lastComma = raw.lastIndexOf(',');
        if (lastDot !== -1 && lastComma !== -1) {
          if (lastComma > lastDot) {
            raw = raw.replace(/\./g, '').replace(',', '.');
          } else {
            raw = raw.replace(/,/g, '');
          }
        } else if (lastComma !== -1) {
          raw = raw.replace(',', '.');
        }
        if (raw === '' || /^\d*\.?\d*$/.test(raw)) onChange(raw);
      }}
      disabled={disabled}
      className={className ?? 'w-full px-2 py-1.5 rounded text-xs text-right'}
      style={{ background: '#fff', border: '1px solid var(--c-border)' }}
    />
  );
}

function CurrencyField({
  label, value, onChange, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--c-text-4)' }}>
        {label}
      </span>
      <CurrencyInput value={value} onChange={onChange} disabled={disabled} />
    </label>
  );
}

/** Formatea un número como "$1,234.56" MXN. Para spans/texto (no inputs). */
function formatMxn(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

function ImageLightbox({ url, filename, onClose }: { url: string; filename: string; onClose: () => void }) {
  const [scale, setScale]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(s * 1.25, 8));
      if (e.key === '-') setScale(s => Math.max(s / 1.25, 0.5));
      if (e.key === '0') { setScale(1); setOffset({ x: 0, y: 0 }); }
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setScale(s => Math.min(Math.max(s * delta, 0.5), 8));
  }

  function onMouseDown(e: React.MouseEvent) {
    setDragging({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
  }
  function onMouseUp() { setDragging(null); }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(26,10,59,0.92)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
           style={{ background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-sm truncate" style={{ color: '#fff' }}>{filename}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale(s => Math.max(s / 1.25, 0.5))}
                  className="w-8 h-8 rounded flex items-center justify-center text-lg"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Zoom out (-)">−</button>
          <button onClick={() => setScale(s => Math.min(s * 1.25, 8))}
                  className="w-8 h-8 rounded flex items-center justify-center text-lg"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Zoom in (+)">+</button>
          <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
                  className="px-3 h-8 rounded text-xs"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Reset (0)">1:1</button>
          <a href={url} download={filename}
             className="px-3 h-8 rounded text-xs inline-flex items-center"
             style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Descargar original">Descargar</a>
          <button onClick={onClose}
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }} title="Cerrar (Esc)">✕</button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden flex items-center justify-center"
        style={{ cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'default' }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={filename}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 120ms',
            maxWidth:  '95vw',
            maxHeight: '85vh',
            userSelect: 'none',
          }}
        />
      </div>
      <div className="text-center text-[10px] py-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Rueda del mouse para zoom · arrastra para mover · Esc para cerrar · +/− teclas · 0 para reset
      </div>
    </div>
  );
}
