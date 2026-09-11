'use client';
import { useState, useRef, useEffect } from 'react';
import type { Scenario } from './scenarios';

type Msg = { role: 'user' | 'assistant'; content: string };

export function MeefiChatWidget({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`demo_${Date.now()}`);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: 'user', content: text };
    // Historial acumulado + nuevo mensaje del usuario. Nelia necesita el
    // contexto multi-turn para bloques como transferencia urgente (turn 2
    // depende del status revelado en turn 1) y 2FA recovery (checklist
    // presentado en turn 1, evidencia recibida en turn 2, escalamiento
    // en turn 3).
    const history: Msg[] = [...messages.filter(m => m.content.trim() !== ''), userMsg];
    setMessages(m => [...m, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/demo/meefi/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          scenario: scenario.id,
          user_email: scenario.user_email,
          session_id: sessionId.current,
        }),
      });

      if (!res.ok || !res.body) {
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: 'No pude procesar tu mensaje. Intenta de nuevo.' };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            const parsed = JSON.parse(payload) as { text?: string; error?: string };
            if (parsed.error) {
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', content: parsed.error! };
                return copy;
              });
              break;
            }
            if (parsed.text) {
              const chunk = parsed.text;
              setMessages(m => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = { role: 'assistant', content: last.content + chunk };
                }
                return copy;
              });
            }
          } catch {
            // ignorar linea mal formada
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-[#2E5BFF] shadow-2xl overflow-hidden flex items-center justify-center hover:scale-105 transition-transform"
        aria-label="Abrir asistente"
      >
        <span className="text-white text-2xl font-semibold">N</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-[380px] h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 p-4 bg-[#2E5BFF] text-white">
        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-semibold">N</div>
        <div className="flex-1">
          <div className="font-semibold">Nelia</div>
          <div className="text-xs opacity-80">Asistente Meefi &middot; en línea</div>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cerrar"
          className="w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center"
        >
          &times;
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-neutral-50">
        {messages.length === 0 && (
          <div className="text-sm text-neutral-500 py-4">
            Hola, soy Nelia. ¿En qué te ayudo hoy?
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <div
              className={
                m.role === 'user'
                  ? 'inline-block bg-[#2E5BFF] text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm'
                  : 'inline-block bg-white border border-neutral-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap'
              }
            >
              {m.content || (loading && i === messages.length - 1 ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 p-2 flex-wrap border-t bg-white">
        {scenario.shortcut_buttons.map(b => (
          <button
            key={b}
            onClick={() => send(b)}
            disabled={loading}
            className="text-xs px-3 py-1 rounded-full border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
          >
            {b}
          </button>
        ))}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 border-t bg-white"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Escribe tu mensaje"
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-full border border-neutral-300 outline-none focus:border-[#2E5BFF] text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-full bg-[#2E5BFF] text-white disabled:opacity-50 text-sm"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
