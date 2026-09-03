'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Wrench, Filter } from 'lucide-react';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

const NALA = MEERKAT_ROLES.find(r => r.id === 'nala')!;

interface ClassifyResult {
  fiscal: boolean;
  confidence: 'high' | 'med' | 'low';
  reason: string;
  matchedKeywords: string[];
}

interface ProcessEvent {
  kind: 'text' | 'tool_call' | 'tool_result' | 'error';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: { ok?: boolean; [k: string]: unknown };
  error?: string;
}

interface ProcessResult {
  fiscal: boolean;
  skipped: boolean;
  events?: ProcessEvent[];
  replyText?: string;
  replySent?: boolean;
  classifyResult: ClassifyResult;
}

const PRESET_FACTURA = {
  from: 'contabilidad@cliente-ejemplo.com',
  subject: 'Necesito factura',
  body: `Hola, necesito que me factures $10,000 de la asesoría de agosto.
Datos: RFC XAXX010101000, Persona Física Rica del Ejemplo, CP 66470, régimen 612.
Uso CFDI G03. Método PPD. Mándamela por favor.

Saludos,
Juan`,
};

const PRESET_SPEI = {
  from: 'ramonleang@icloud.com',
  subject: 'Comprobante SPEI Tortillas Estrella',
  body: `Hola,
Adjunto SPEI de $31,294.48 hecho el 27/08/2026 15:31.
Número de operación: 1254526.
UUID de la factura original: 5F1C5803-747F-4C1A-A03B-6BC3EF901FB2.
Datos receptor: TEN010518AL3, TORTILLAS ESTRELLA DEL NORTE, CP 66470, régimen 601.
Mándame el complemento de pago.

Beatriz`,
};

const PRESET_NO_FISCAL = {
  from: 'random@example.com',
  subject: 'Consulta sobre horarios',
  body: `Buenos días, ¿a qué hora abren mañana? Gracias.`,
};

export default function NalaTestEmailPage() {
  const [from, setFrom]           = useState('');
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [sendReply, setSendReply] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [mode, setMode]           = useState<'process' | 'classify'>('process');
  const [result, setResult]       = useState<ProcessResult | { classification: ClassifyResult } | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const loadPreset = (p: typeof PRESET_FACTURA) => {
    setFrom(p.from);
    setSubject(p.subject);
    setBody(p.body);
    setResult(null);
    setError(null);
  };

  const submit = async () => {
    if (!from.trim() || !subject.trim() || !body.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/staff/nala/process-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, subject, body,
          sendReply: mode === 'process' && sendReply,
          classifyOnly: mode === 'classify',
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isProcess = (r: ProcessResult | { classification: ClassifyResult }): r is ProcessResult =>
    'fiscal' in r;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/admin/staff/nala"
        className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a config
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
          Probar procesamiento de correo
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Simula un correo entrante a hola@centinelia.mx. Nala clasifica si es fiscal, y si sí, ejecuta sus tools.
          Los correos no-fiscales no los toca (retorna <code>skipped</code>).
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Input */}
        <section
          className="rounded-2xl p-5"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>
            Correo entrante
          </h2>

          <div className="flex gap-2 flex-wrap mb-4">
            <PresetButton label="Ej: Solicitud de factura" onClick={() => loadPreset(PRESET_FACTURA)} />
            <PresetButton label="Ej: Comprobante SPEI" onClick={() => loadPreset(PRESET_SPEI)} />
            <PresetButton label="Ej: No fiscal (skip)" onClick={() => loadPreset(PRESET_NO_FISCAL)} />
          </div>

          <div className="space-y-3">
            <Field label="De">
              <input
                type="text"
                value={from}
                onChange={e => setFrom(e.target.value)}
                placeholder="cliente@dominio.com"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
            </Field>
            <Field label="Asunto">
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Necesito factura / Comprobante SPEI / etc"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
            </Field>
            <Field label="Cuerpo">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                placeholder="Contenido del correo…"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
            </Field>
          </div>

          {/* Options */}
          <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--c-border)' }}>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
              <input
                type="radio"
                checked={mode === 'process'}
                onChange={() => setMode('process')}
              />
              <span>Procesar completo (Nala ejecuta tools + genera respuesta)</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--c-text-2)' }}>
              <input
                type="radio"
                checked={mode === 'classify'}
                onChange={() => setMode('classify')}
              />
              <span>Solo clasificar (¿es fiscal o no?)</span>
            </label>
            {mode === 'process' && (
              <label className="flex items-center gap-2 text-xs cursor-pointer pt-1" style={{ color: 'var(--c-text-2)' }}>
                <input
                  type="checkbox"
                  checked={sendReply}
                  onChange={e => setSendReply(e.target.checked)}
                />
                <span>Enviar respuesta real por correo al remitente</span>
              </label>
            )}
          </div>

          <button
            onClick={submit}
            disabled={loading || !from.trim() || !subject.trim() || !body.trim()}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: NALA.color, color: '#fff' }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" /> Procesando…</>
              : <><Send size={14} /> {mode === 'classify' ? 'Clasificar' : 'Procesar con Nala'}</>
            }
          </button>
        </section>

        {/* Output */}
        <section
          className="rounded-2xl p-5"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>Resultado</h2>

          {!result && !error && !loading && (
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Aún no has procesado nada. Pega un correo (o usa un preset) y dale a Procesar.
            </p>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
              <Loader2 size={12} className="animate-spin" />
              Corriendo…
            </div>
          )}

          {error && (
            <div className="rounded-lg p-3 text-xs flex items-start gap-2"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
              <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {/* Clasificación siempre visible */}
              {isProcess(result) ? (
                <ClassificationBox r={result.classifyResult} />
              ) : (
                <ClassificationBox r={result.classification} />
              )}

              {/* Si es process mode, mostrar eventos + reply */}
              {isProcess(result) && result.fiscal && (
                <>
                  {result.events && result.events.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
                        Ejecución
                      </p>
                      <div className="space-y-2">
                        {result.events.map((ev, i) => <EventBubble key={i} ev={ev} />)}
                      </div>
                    </div>
                  )}
                  {result.replyText && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
                        Respuesta a {isProcess(result) ? 'remitente' : ''}
                        {result.replySent && <span className="ml-2 text-[10px]" style={{ color: '#15803d' }}>✓ enviada</span>}
                        {result.replySent === false && sendReply && <span className="ml-2 text-[10px]" style={{ color: '#b91c1c' }}>✗ falló envío</span>}
                      </p>
                      <div
                        className="rounded-lg p-3 text-xs whitespace-pre-wrap"
                        style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)', color: 'var(--c-text)' }}
                      >
                        {result.replyText}
                      </div>
                    </div>
                  )}
                </>
              )}

              {isProcess(result) && !result.fiscal && (
                <div className="rounded-lg p-3 text-xs flex items-start gap-2"
                     style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)', color: 'var(--c-text-2)' }}>
                  <Filter size={12} className="mt-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }} />
                  <span>Correo <strong>no fiscal</strong>. Nala no lo toca.</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--c-text-4)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-[11px] transition-opacity hover:opacity-80"
      style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF' }}
    >
      {label}
    </button>
  );
}

function ClassificationBox({ r }: { r: ClassifyResult }) {
  return (
    <div
      className="rounded-lg p-3 text-xs"
      style={{
        background: r.fiscal ? 'rgba(34,197,94,0.08)' : 'rgba(108,59,255,0.06)',
        border: `1px solid ${r.fiscal ? 'rgba(34,197,94,0.3)' : 'rgba(108,59,255,0.2)'}`,
        color: 'var(--c-text-2)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {r.fiscal
          ? <CheckCircle2 size={12} style={{ color: '#15803d' }} />
          : <Filter size={12} style={{ color: '#6C3BFF' }} />
        }
        <span className="font-semibold" style={{ color: r.fiscal ? '#15803d' : '#6C3BFF' }}>
          {r.fiscal ? 'Fiscal' : 'No fiscal'} · confianza {r.confidence}
        </span>
      </div>
      <p>{r.reason}</p>
      {r.matchedKeywords.length > 0 && (
        <p className="mt-1 text-[10px]" style={{ color: 'var(--c-text-3)' }}>
          Keywords: {r.matchedKeywords.slice(0, 8).join(', ')}
          {r.matchedKeywords.length > 8 ? ` +${r.matchedKeywords.length - 8}` : ''}
        </p>
      )}
    </div>
  );
}

function EventBubble({ ev }: { ev: ProcessEvent }) {
  if (ev.kind === 'text' && ev.text) {
    return (
      <div className="rounded-lg p-2.5 text-xs" style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--c-text-2)' }}>
        {ev.text}
      </div>
    );
  }
  if (ev.kind === 'tool_call' && ev.name) {
    return (
      <div className="rounded-lg p-2.5 text-[11px] flex items-start gap-2"
           style={{ background: 'rgba(108,59,255,0.06)', border: '1px dashed rgba(108,59,255,0.35)', color: 'var(--c-text-2)' }}>
        <Wrench size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: '#6C3BFF' }}>Tool: <code>{ev.name}</code></p>
          <details className="mt-1">
            <summary className="cursor-pointer" style={{ color: 'var(--c-text-3)' }}>ver payload</summary>
            <pre className="text-[10px] mt-1 overflow-x-auto p-2 rounded" style={{ background: 'rgba(0,0,0,0.05)' }}>{JSON.stringify(ev.input, null, 2)}</pre>
          </details>
        </div>
      </div>
    );
  }
  if (ev.kind === 'tool_result' && ev.name) {
    const ok = ev.result?.ok === true;
    const uuid = typeof ev.result?.uuid === 'string' ? ev.result.uuid : undefined;
    return (
      <div className="rounded-lg p-2.5 text-[11px] flex items-start gap-2"
           style={{
             background: ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
             border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
             color: 'var(--c-text-2)',
           }}>
        {ok
          ? <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#15803d' }} />
          : <AlertCircle size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#b91c1c' }} />
        }
        <div className="min-w-0 flex-1">
          <p className="font-semibold" style={{ color: ok ? '#15803d' : '#b91c1c' }}>
            {ok ? 'Timbrado OK' : 'Error'} · <code>{ev.name}</code>
          </p>
          {uuid && <p className="font-mono text-[10px] mt-0.5">UUID: {uuid}</p>}
          <details className="mt-1">
            <summary className="cursor-pointer" style={{ color: 'var(--c-text-3)' }}>ver detalle</summary>
            <pre className="text-[10px] mt-1 overflow-x-auto p-2 rounded" style={{ background: 'rgba(0,0,0,0.05)' }}>{JSON.stringify(ev.result, null, 2)}</pre>
          </details>
        </div>
      </div>
    );
  }
  if (ev.kind === 'error' && ev.error) {
    return (
      <div className="rounded-lg p-2.5 text-xs flex items-start gap-2"
           style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}>
        <AlertCircle size={11} className="mt-0.5 flex-shrink-0" />
        <span>{ev.error}</span>
      </div>
    );
  }
  return null;
}
