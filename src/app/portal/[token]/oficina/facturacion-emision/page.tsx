'use client';

import { useCallback, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Upload, Camera, FileText, Loader2, AlertTriangle,
  CheckCircle2, XCircle, Download, Sparkles,
} from 'lucide-react';

interface ExtractedProduct {
  nombre: string;
  cantidad: number;
  unidad: string | null;
}
interface ExtractedNote {
  cliente_texto: string | null;
  productos: ExtractedProduct[];
  metodo_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | null;
  fecha: string | null;
  monto_total: number | null;
  confianza: { cliente: number; productos: number; metodo_pago: number; global: number };
  notas_raw: string;
}
interface ClientMatch {
  rfc: string; adapterId: string; razonSocial: string;
  usoCFDI: string; regimen: string; codigoPostal: string; score: number;
}
interface ProductMatch {
  sku: string; nombre: string; unidad: string;
  precio: number; claveSAT: string; ivaTasa: number; score: number;
}
interface MatchedProductRow {
  extracted: ExtractedProduct;
  candidates: ProductMatch[];
  chosen: ProductMatch | null;
}
interface InvoiceLine {
  sku: string; qty: number; unitPrice: number; ivaTasa?: number;
}
interface InvoicePayload {
  clientRFC: string; date: string; lines: InvoiceLine[];
  paymentMethod: string; usoCFDI: string; serie?: string;
}
interface ProcessResponse {
  extracted: ExtractedNote;
  clientCandidates: ClientMatch[];
  clientChosen: ClientMatch | null;
  products: MatchedProductRow[];
  invoice: InvoicePayload | null;
  xml: string | null;
  savedPath: string | null;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function mxn(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function confidenceColor(score: number): string {
  if (score >= 0.75) return '#22c55e';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}

export default function FacturacionEmisionPage() {
  const { token } = useParams<{ token: string }>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }, [previewUrl]);

  const submit = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`/api/portal/${token}/facturacion-emision/process`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
      } else {
        setResult(data as ProcessResponse);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full p-4 md:p-6">
      {/* Hero */}
      <header className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <Sparkles size={26} style={{ color: '#6C3BFF' }} strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9B6DFF' }}>
            Facturación (piloto)
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
            Emitir factura desde una notita
          </h1>
          <p className="text-[14px]" style={{ color: '#6B6480' }}>
            Sube la foto de la nota de venta. Nala extrae los datos, busca al cliente en tu catálogo
            de CONTPAQi y genera el XML de importación listo para timbrar.
          </p>
        </div>
      </header>

      {/* Upload zone */}
      <div
        className={`rounded-2xl overflow-hidden transition-colors ${dragOver ? 'ring-2' : ''}`}
        style={{
          background: '#ffffff',
          border: '1px solid #E8E3F5',
          boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <div className="p-6 flex flex-col md:flex-row gap-6 items-start">
          <div className="flex-1 w-full">
            <div
              className="rounded-xl border-2 border-dashed p-8 text-center cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor: dragOver ? '#6C3BFF' : '#D1C9E8', background: dragOver ? 'rgba(108,59,255,0.04)' : '#FAFBFF' }}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.1)' }}>
                  <Camera size={22} style={{ color: '#6C3BFF' }} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
                    Arrastra la foto aquí o haz click para elegirla
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
                    JPG, PNG o WEBP · tamaño máximo 10 MB
                  </p>
                </div>
              </div>
            </div>

            {file && (
              <div className="mt-4 flex items-center gap-3 justify-between rounded-lg px-3 py-2" style={{ background: '#F5F2FB', border: '1px solid #E8E3F5' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} style={{ color: '#6C3BFF' }} />
                  <span className="text-[12px] truncate" style={{ color: '#1A0A3B' }}>{file.name}</span>
                  <span className="text-[11px]" style={{ color: '#9B8FB5' }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
                <button
                  onClick={submit}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: '#6C3BFF', color: '#fff' }}
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {loading ? 'Procesando...' : 'Procesar notita'}
                </button>
              </div>
            )}
          </div>

          {previewUrl && (
            <div className="flex-1 w-full">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B8FB5' }}>Vista previa</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Notita"
                className="w-full rounded-lg"
                style={{ border: '1px solid #E8E3F5', maxHeight: 400, objectFit: 'contain', background: '#FAFBFF' }}
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#7f1d1d' }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-5">
          {/* Extracted note summary */}
          <section className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
            <div className="flex items-baseline justify-between gap-2 mb-4">
              <h2 className="text-[16px] font-bold" style={{ color: '#1A0A3B' }}>Datos extraídos de la notita</h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: confidenceColor(result.extracted.confianza.global) + '15', color: confidenceColor(result.extracted.confianza.global) }}>
                Confianza global {pct(result.extracted.confianza.global)}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px]">
              <FieldRow k="Cliente escrito" v={result.extracted.cliente_texto ?? '(vacío)'} confidence={result.extracted.confianza.cliente} />
              <FieldRow k="Método de pago" v={result.extracted.metodo_pago ?? '(no detectado)'} confidence={result.extracted.confianza.metodo_pago} />
              <FieldRow k="Fecha" v={result.extracted.fecha ?? '(hoy)'} />
              <FieldRow k="Monto total escrito" v={result.extracted.monto_total !== null ? mxn(result.extracted.monto_total) : '(no visible)'} />
              <FieldRow k="Productos detectados" v={`${result.extracted.productos.length}`} confidence={result.extracted.confianza.productos} />
            </div>
            {result.extracted.notas_raw && (
              <details className="mt-4">
                <summary className="text-[11px] font-semibold uppercase tracking-widest cursor-pointer" style={{ color: '#9B8FB5' }}>
                  Notas del extractor
                </summary>
                <p className="text-[12px] mt-2" style={{ color: '#6B6480' }}>{result.extracted.notas_raw}</p>
              </details>
            )}
          </section>

          {/* Client match */}
          <section className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
            <h2 className="text-[16px] font-bold mb-3" style={{ color: '#1A0A3B' }}>Cliente en CONTPAQi</h2>
            {result.clientChosen ? (
              <>
                <div className="flex items-start gap-3 rounded-lg p-3 mb-3" style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <CheckCircle2 size={16} className="mt-0.5" style={{ color: '#22c55e' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{result.clientChosen.razonSocial}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px]" style={{ color: '#6B6480' }}>
                      <span className="font-mono">{result.clientChosen.rfc}</span>
                      <span>·</span>
                      <span>Uso CFDI {result.clientChosen.usoCFDI}</span>
                      <span>·</span>
                      <span>CP {result.clientChosen.codigoPostal}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: confidenceColor(result.clientChosen.score) + '15', color: confidenceColor(result.clientChosen.score) }}>
                    Score {pct(result.clientChosen.score)}
                  </span>
                </div>
                {result.clientCandidates.length > 1 && (
                  <details>
                    <summary className="text-[11px] font-semibold uppercase tracking-widest cursor-pointer" style={{ color: '#9B8FB5' }}>
                      Otros candidatos ({result.clientCandidates.length - 1})
                    </summary>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {result.clientCandidates.slice(1).map((c) => (
                        <div key={c.rfc} className="flex items-center justify-between text-[12px] px-2 py-1 rounded" style={{ background: '#FAFAFB' }}>
                          <span style={{ color: '#1A0A3B' }}>{c.razonSocial}</span>
                          <span className="font-mono text-[11px]" style={{ color: '#6B6480' }}>{c.rfc} · {pct(c.score)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', color: '#7f1d1d' }}>
                <XCircle size={14} className="mt-0.5 shrink-0" />
                <span className="text-[12px]">
                  Nala no encontró un cliente con RFC coincidente en tu catálogo. Registra al cliente en
                  CONTPAQi primero (o corrige el nombre escrito en la nota).
                </span>
              </div>
            )}
          </section>

          {/* Products match */}
          <section className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
            <h2 className="text-[16px] font-bold mb-3" style={{ color: '#1A0A3B' }}>Productos</h2>
            {result.products.length === 0 && (
              <p className="text-[12px]" style={{ color: '#6B6480' }}>Ningún producto detectado en la nota.</p>
            )}
            <div className="flex flex-col gap-2">
              {result.products.map((row, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: row.chosen ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.04)', border: `1px solid ${row.chosen ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {row.chosen ? <CheckCircle2 size={14} style={{ color: '#22c55e' }} /> : <XCircle size={14} style={{ color: '#ef4444' }} />}
                        <span className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
                          {row.extracted.cantidad} {row.extracted.unidad ?? ''} — {row.extracted.nombre}
                        </span>
                      </div>
                      {row.chosen && (
                        <div className="mt-1 text-[11px]" style={{ color: '#6B6480' }}>
                          <span className="font-mono">{row.chosen.sku}</span>
                          <span> · {row.chosen.nombre}</span>
                          <span> · {mxn(row.chosen.precio)}/{row.chosen.unidad}</span>
                        </div>
                      )}
                    </div>
                    {row.chosen && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: confidenceColor(row.chosen.score) + '15', color: confidenceColor(row.chosen.score) }}>
                        {pct(row.chosen.score)}
                      </span>
                    )}
                  </div>
                  {!row.chosen && (
                    <p className="text-[11px] mt-2" style={{ color: '#7f1d1d' }}>
                      Sin coincidencia en el catálogo de CONTPAQi. Registra el producto o revisa el nombre escrito.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Invoice + XML download */}
          {result.xml && result.invoice && result.savedPath && (
            <section className="rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h2 className="text-[16px] font-bold" style={{ color: '#1A0A3B' }}>XML de importación listo</h2>
                <a
                  href={`/api/portal/${token}/facturacion-emision/xml?path=${encodeURIComponent(result.savedPath)}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold transition-opacity hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#fff' }}
                >
                  <Download size={12} /> Descargar XML
                </a>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px] mb-3">
                <div><span style={{ color: '#9B8FB5' }}>RFC receptor:</span> <span className="font-mono" style={{ color: '#1A0A3B' }}>{result.invoice.clientRFC}</span></div>
                <div><span style={{ color: '#9B8FB5' }}>Fecha:</span> <span style={{ color: '#1A0A3B' }}>{result.invoice.date}</span></div>
                <div><span style={{ color: '#9B8FB5' }}>Método de pago:</span> <span style={{ color: '#1A0A3B' }}>{result.invoice.paymentMethod}</span></div>
                <div><span style={{ color: '#9B8FB5' }}>Serie:</span> <span style={{ color: '#1A0A3B' }}>{result.invoice.serie ?? '(default)'}</span></div>
                <div className="col-span-2"><span style={{ color: '#9B8FB5' }}>Guardado en:</span> <span className="font-mono text-[11px]" style={{ color: '#1A0A3B' }}>{result.savedPath}</span></div>
              </div>
              <details>
                <summary className="text-[11px] font-semibold uppercase tracking-widest cursor-pointer" style={{ color: '#9B8FB5' }}>
                  Ver XML crudo
                </summary>
                <pre className="mt-2 text-[10px] font-mono p-3 rounded overflow-auto max-h-[400px]"
                  style={{ background: '#0f172a', color: '#e2e8f0' }}>
                  {result.xml}
                </pre>
              </details>
              <p className="text-[11px] mt-3" style={{ color: '#6B6480' }}>
                Descarga el XML, abre CONTPAQi Comercial → Documentos → Importar → selecciona este archivo.
                Verifica que la factura aparezca en el cliente correcto antes de timbrar.
              </p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({ k, v, confidence }: { k: string; v: string; confidence?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#9B8FB5' }}>{k}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>{v}</span>
        {confidence !== undefined && (
          <span className="text-[10px] font-semibold" style={{ color: confidenceColor(confidence) }}>{pct(confidence)}</span>
        )}
      </div>
    </div>
  );
}
