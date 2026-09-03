'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send, Loader2, Wrench, AlertCircle, CheckCircle2 } from 'lucide-react';
import { MEERKAT_ROLES } from '@/lib/portal/meerkat-roles';

const NALA = MEERKAT_ROLES.find(r => r.id === 'nala')!;

type ChatMsg =
  | { kind: 'user'; text: string }
  | { kind: 'nala'; text: string }
  | { kind: 'tool_call'; name: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; result: { ok?: boolean; [k: string]: unknown } }
  | { kind: 'error'; error: string };

interface ApiEvent {
  kind: 'text' | 'tool_call' | 'tool_result' | 'error';
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: { ok?: boolean; [k: string]: unknown };
  error?: string;
}

const EXAMPLES = [
  'Hazme un CFDI para Tortillas Estrella (TEN010518AL3, CP 66470) por $14,990 de contratación de Noah + $11,988 de jornada. Correo Ramonleang@icloud.com',
  'Ya llegó el SPEI de Tortillas Estrella el 27/08/2026 15:31, número operación 1254526, monto $31,294.48. UUID original 5F1C5803-747F-4C1A-A03B-6BC3EF901FB2. Manda el REP a Ramonleang@icloud.com',
  '¿Cómo se llena un CFDI para persona física con actividad profesional?',
];

export default function NalaChatPage() {
  const [messages, setMessages]     = useState<ChatMsg[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;

    const nextMessages: ChatMsg[] = [...messages, { kind: 'user', text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    // Transcript para el API: solo user + nala (los tool_call/tool_result son eventos visuales)
    const transcript = nextMessages
      .filter((m): m is Extract<ChatMsg, { kind: 'user' | 'nala' }> => m.kind === 'user' || m.kind === 'nala')
      .map(m => ({ role: m.kind === 'user' ? 'user' : 'assistant' as const, content: m.text }));

    try {
      const res = await fetch('/api/admin/staff/nala/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: transcript }),
      });
      const data = await res.json() as { events?: ApiEvent[]; error?: string };
      if (data.error) {
        setMessages(m => [...m, { kind: 'error', error: data.error! }]);
        return;
      }
      const appended: ChatMsg[] = [];
      for (const ev of data.events ?? []) {
        if (ev.kind === 'text' && ev.text) appended.push({ kind: 'nala', text: ev.text });
        else if (ev.kind === 'tool_call' && ev.name) appended.push({ kind: 'tool_call', name: ev.name, input: ev.input ?? {} });
        else if (ev.kind === 'tool_result' && ev.name) appended.push({ kind: 'tool_result', name: ev.name, result: ev.result ?? {} });
        else if (ev.kind === 'error' && ev.error) appended.push({ kind: 'error', error: ev.error });
      }
      setMessages(m => [...m, ...appended]);
    } catch (e) {
      setMessages(m => [...m, { kind: 'error', error: (e as Error).message }]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Header */}
      <header className="p-6 pb-3 flex-shrink-0">
        <Link
          href="/admin/staff/nala"
          className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
          style={{ color: 'var(--c-text-3)' }}
        >
          <ArrowLeft size={12} />
          Volver a config
        </Link>

        <div className="flex items-center gap-3">
          {NALA.imagen && (
            <span
              style={{
                width: 44, height: 44, borderRadius: '50%',
                overflow: 'hidden', display: 'inline-block', flexShrink: 0,
                background: '#ffffff', border: `2px solid ${NALA.color}33`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={NALA.imagen}
                alt="Nala"
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  objectPosition: NALA.avatarPosition ?? 'center 3%',
                  transform: NALA.avatarScale && NALA.avatarScale !== 1 ? `scale(${NALA.avatarScale})` : 'none',
                  transformOrigin: NALA.avatarPosition ?? 'center 3%',
                }}
              />
            </span>
          )}
          <div>
            <h1 className="font-semibold" style={{ color: 'var(--c-text)' }}>Chat con {NALA.nombre}</h1>
            <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
              Pídele que timbre CFDIs o REPs a nombre de Centinelia
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 min-h-0">
        {messages.length === 0 ? (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--c-text-4)' }}>
              Ejemplos
            </p>
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => send(ex)}
                className="w-full text-left p-3 rounded-xl text-xs transition-all hover:opacity-80"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
              >
                {ex}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
            {loading && (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--c-text-3)' }}>
                <Loader2 size={12} className="animate-spin" />
                Nala está pensando…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 pt-3 flex-shrink-0">
        <div
          className="flex gap-2 items-end p-2 rounded-2xl"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ej: Emite CFDI a TEN010518AL3 por $10,000..."
            rows={2}
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm p-2"
            style={{ color: 'var(--c-text)', fontFamily: 'inherit' }}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 p-2.5 rounded-xl transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: NALA.color, color: '#fff' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--c-text-4)' }}>
          Enter para enviar · Shift+Enter para nueva línea
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  if (msg.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md text-sm"
          style={{ background: '#6C3BFF', color: '#fff' }}
        >
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.kind === 'nala') {
    return (
      <div className="flex justify-start">
        <div
          className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-bl-md text-sm whitespace-pre-wrap"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        >
          {msg.text}
        </div>
      </div>
    );
  }
  if (msg.kind === 'tool_call') {
    return (
      <div className="flex justify-start pl-4">
        <div
          className="max-w-[85%] px-3 py-2 rounded-xl text-[11px] flex items-start gap-2"
          style={{ background: 'rgba(108,59,255,0.06)', border: '1px dashed rgba(108,59,255,0.35)', color: 'var(--c-text-2)' }}
        >
          <Wrench size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#6C3BFF' }} />
          <div>
            <p className="font-semibold" style={{ color: '#6C3BFF' }}>
              Llamando <code>{msg.name}</code>
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer" style={{ color: 'var(--c-text-3)' }}>ver payload</summary>
              <pre className="text-[10px] mt-1 overflow-x-auto p-2 rounded" style={{ background: 'rgba(0,0,0,0.03)' }}>{JSON.stringify(msg.input, null, 2)}</pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
  if (msg.kind === 'tool_result') {
    const ok = msg.result?.ok === true;
    const uuid = typeof msg.result?.uuid === 'string' ? msg.result.uuid : undefined;
    return (
      <div className="flex justify-start pl-4">
        <div
          className="max-w-[85%] px-3 py-2 rounded-xl text-[11px] flex items-start gap-2"
          style={{
            background: ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: 'var(--c-text-2)',
          }}
        >
          {ok
            ? <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#15803d' }} />
            : <AlertCircle size={11} className="mt-0.5 flex-shrink-0" style={{ color: '#b91c1c' }} />
          }
          <div className="min-w-0 flex-1">
            <p className="font-semibold" style={{ color: ok ? '#15803d' : '#b91c1c' }}>
              {ok ? 'Timbrado OK' : 'Error del tool'} · <code>{msg.name}</code>
            </p>
            {uuid && (
              <p className="mt-0.5 font-mono text-[10px]" style={{ color: 'var(--c-text-2)' }}>UUID: {uuid}</p>
            )}
            <details className="mt-1">
              <summary className="cursor-pointer" style={{ color: 'var(--c-text-3)' }}>ver detalle</summary>
              <pre className="text-[10px] mt-1 overflow-x-auto p-2 rounded" style={{ background: 'rgba(0,0,0,0.03)' }}>{JSON.stringify(msg.result, null, 2)}</pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] px-3 py-2 rounded-xl text-xs flex items-start gap-2"
        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#b91c1c' }}
      >
        <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
        <span>{msg.error}</span>
      </div>
    </div>
  );
}
