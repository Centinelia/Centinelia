'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader } from 'lucide-react';


type Message = { role: 'user' | 'assistant'; content: string };

// Paleta Nash — cyan #0891B2 (canónico del meerkat interno).
const NASH_CYAN        = '#0891B2';
const NASH_CYAN_LIGHT  = '#22D3EE';
const NASH_CYAN_BG     = 'rgba(8,145,178,0.25)';
const NASH_CYAN_BORDER = 'rgba(8,145,178,0.4)';
const NASH_AVATAR_SRC  = '/meerkats/nash.png';

const WELCOME: Message = {
  role: 'assistant',
  content: 'Hola, soy Nash. Estoy aquí para ayudarte con cualquier cosa del portal y/u oficina: minutos, empleados, configuración, documentos, etc… ¿En qué te apoyo?',
};

const ERROR_MSG      = 'Se me colgó una pieza. Dame un segundo y prueba de nuevo.';
const NO_CONNECT_MSG = 'No pude conectarme. Verifica tu conexión e intenta de nuevo.';

interface SupportChatProps {
  /** 'left' (default) posiciona el FAB tras el sidebar del portal.
   *  'right' lo posiciona en la esquina inferior derecha, donde tradicionalmente
   *  vivía el ops-agents FAB. Ver PortalChatDock para el switching por ruta. */
  position?: 'left' | 'right';
}

function NashAvatar({ size }: { size: number }) {
  return (
    <img
      src={NASH_AVATAR_SRC}
      alt="Nash"
      width={size}
      height={size}
      style={{
        width:        size,
        height:       size,
        borderRadius: '50%',
        objectFit:    'cover',
        objectPosition: 'center 42%',
        display:      'block',
      }}
    />
  );
}

export default function SupportChat({ position = 'left' }: SupportChatProps = {}) {
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
        setMessages(prev => [...prev, { role: 'assistant', content: ERROR_MSG }]);
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
      setMessages(prev => [...prev, { role: 'assistant', content: NO_CONNECT_MSG }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className={`fixed bottom-20 z-50 flex flex-col overflow-hidden ${
            position === 'right' ? 'right-4' : 'left-4 md:left-[276px]'
          }`}
          style={{
            width: 'min(360px, calc(100vw - 32px))',
            height: 480,
            background: '#1A0B38',
            border: `1px solid ${NASH_CYAN_BORDER}`,
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(8,145,178,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${NASH_CYAN_BG} 0%, rgba(8,145,178,0.08) 100%)`,
              borderBottom: '1px solid rgba(8,145,178,0.2)',
            }}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ background: '#FAFBFF', border: `1px solid ${NASH_CYAN_BORDER}` }}
            >
              <NashAvatar size={36} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#E6FBFF' }}>Nash</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: NASH_CYAN_LIGHT }} />
                <p className="text-xs" style={{ color: 'rgba(226,251,255,0.6)' }}>Tu Centinelia-rep · En línea</p>
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
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 overflow-hidden"
                    style={{ background: '#FAFBFF', border: `1px solid ${NASH_CYAN_BORDER}` }}
                  >
                    <NashAvatar size={28} />
                  </div>
                )}
                <div
                  className="max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
                  style={
                    msg.role === 'user'
                      ? {
                          background: `linear-gradient(135deg, ${NASH_CYAN}, ${NASH_CYAN_LIGHT})`,
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
              placeholder="Escríbele a Nash…"
              disabled={streaming}
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-sm"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '8px 12px',
                color: '#E6FBFF',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: input.trim() && !streaming ? NASH_CYAN : 'rgba(8,145,178,0.2)',
                border: `1px solid ${NASH_CYAN_BORDER}`,
                opacity: !input.trim() || streaming ? 0.5 : 1,
              }}
            >
              {streaming
                ? <Loader size={14} color={NASH_CYAN_LIGHT} className="animate-spin" />
                : <Send size={14} color="#fff" />
              }
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-4 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all overflow-hidden ${
          position === 'right' ? 'right-4' : 'left-4 md:left-[276px]'
        }`}
        style={{
          background: open ? 'rgba(8,145,178,0.9)' : '#FAFBFF',
          boxShadow: '0 8px 32px rgba(8,145,178,0.45)',
          border: `1px solid ${NASH_CYAN_BORDER}`,
        }}
        aria-label="Nash"
      >
        {open
          ? <X size={22} color="#fff" />
          : <NashAvatar size={56} />
        }
      </button>
    </>
  );
}
