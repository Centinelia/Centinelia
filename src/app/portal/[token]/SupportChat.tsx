'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, Loader } from 'lucide-react';


type Message = { role: 'user' | 'assistant'; content: string };

const WELCOME: Message = {
  role: 'assistant',
  content: '¡Hola! Soy el asistente de Centinelia. Puedo ayudarte con dudas sobre tu portal, minutos, configuración del agente o cualquier otra pregunta. ¿En qué te puedo ayudar?',
};

export default function SupportChat() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([WELCOME]);
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/portal/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })) }),
      });

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Ocurrió un error. Por favor intenta de nuevo.' }]);
        return;
      }

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text: chunk } = JSON.parse(payload);
            if (chunk) {
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { role: 'assistant', content: last.content + chunk }];
                }
                return prev;
              });
            }
          } catch { /* ignore malformed chunks */ }
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'No pude conectarme. Verifica tu conexión e intenta de nuevo.' }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 left-4 md:left-56 z-50 flex flex-col overflow-hidden"
          style={{
            width: 'min(360px, calc(100vw - 32px))',
            height: 480,
            background: '#1A0B38',
            border: '1px solid rgba(108,59,255,0.35)',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,59,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(108,59,255,0.25) 0%, rgba(108,59,255,0.1) 100%)',
              borderBottom: '1px solid rgba(108,59,255,0.2)',
            }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(108,59,255,0.3)', border: '1px solid rgba(108,59,255,0.4)' }}
            >
              <Bot size={15} color="#A07CFF" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#E2D9FF' }}>Soporte Centinelia</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>En línea</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                    style={{ background: 'rgba(108,59,255,0.2)', border: '1px solid rgba(108,59,255,0.3)' }}
                  >
                    <Bot size={11} color="#A07CFF" />
                  </div>
                )}
                <div
                  className="max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                  style={
                    msg.role === 'user'
                      ? {
                          background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
                          color: '#fff',
                          borderBottomRightRadius: 4,
                        }
                      : {
                          background: 'rgba(255,255,255,0.05)',
                          color: 'rgba(255,255,255,0.85)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderBottomLeftRadius: 4,
                        }
                  }
                >
                  {msg.content || (
                    <span className="flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      <Loader size={11} className="animate-spin" /> Escribiendo…
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Escribe tu pregunta…"
              disabled={streaming}
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-sm"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '8px 12px',
                color: '#E2D9FF',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: input.trim() && !streaming ? '#6C3BFF' : 'rgba(108,59,255,0.2)',
                border: '1px solid rgba(108,59,255,0.4)',
                opacity: !input.trim() || streaming ? 0.5 : 1,
              }}
            >
              {streaming
                ? <Loader size={14} color="#A07CFF" className="animate-spin" />
                : <Send size={14} color="#fff" />
              }
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-4 left-4 md:left-56 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all"
        style={{
          background: open ? 'rgba(108,59,255,0.9)' : 'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
          boxShadow: '0 8px 32px rgba(108,59,255,0.45)',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
        aria-label="Soporte"
      >
        {open ? <X size={22} color="#fff" /> : <MessageCircle size={22} color="#fff" />}
      </button>
    </>
  );
}
