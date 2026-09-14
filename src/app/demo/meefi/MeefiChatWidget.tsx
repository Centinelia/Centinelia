'use client';
import { useState, useRef, useEffect } from 'react';
import type { Scenario } from './scenarios';

type Attachment = { name: string; size: number };
type Msg = { role: 'user' | 'assistant'; content: string; attachments?: Attachment[] };

// Persistencia: guardamos el estado del chat (mensajes + open + sessionId) en
// sessionStorage por scenario. Sobrevive refresh de página y navegación,
// pero se limpia al cerrar la pestaña. Cada scenario tiene su propia sesión
// para no contaminar los casos entre demos.
type PersistedState = {
  messages: Msg[];
  open:     boolean;
  sessionId: string;
};

function storageKey(scenarioId: number): string {
  return `meefi_demo_chat_scenario_${scenarioId}`;
}

function loadPersisted(scenarioId: number): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(scenarioId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.messages) || typeof parsed.sessionId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(scenarioId: number, state: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey(scenarioId), JSON.stringify(state));
  } catch {
    // sessionStorage lleno o desactivado por privacy mode — no bloquea.
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MeefiChatWidget({ scenario }: { scenario: Scenario }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const sessionId = useRef<string>(`demo_${Date.now()}`);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    const persisted = loadPersisted(scenario.id);
    if (persisted) {
      setMessages(persisted.messages);
      setOpen(persisted.open);
      sessionId.current = persisted.sessionId;
    }
    hydrated.current = true;
  }, [scenario.id]);

  useEffect(() => {
    if (!hydrated.current) return;
    savePersisted(scenario.id, {
      messages,
      open,
      sessionId: sessionId.current,
    });
  }, [messages, open, scenario.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const next: Attachment[] = Array.from(files).map(f => ({
      name: f.name,
      size: f.size,
    }));
    setPendingAttachments(prev => [...prev, ...next]);
    // Reset input para permitir re-seleccionar el mismo archivo si el usuario quiere.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(idx: number) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx));
  }

  async function send(text: string, extraAttachments?: Attachment[]) {
    const attachments = extraAttachments ?? pendingAttachments;
    const hasContent = text.trim().length > 0 || attachments.length > 0;
    if (!hasContent || loading) return;

    const userMsg: Msg = {
      role: 'user',
      content: text.trim(),
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const history: Msg[] = [
      ...messages.filter(m => m.content.trim() !== '' || (m.attachments && m.attachments.length > 0)),
      userMsg,
    ];

    setMessages(m => [...m, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    setPendingAttachments([]);
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

  const hasPendingAttachments = pendingAttachments.length > 0;

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
                  ? 'inline-block bg-[#2E5BFF] text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-[85%] text-sm text-left'
                  : 'inline-block bg-white border border-neutral-200 rounded-2xl rounded-tl-sm px-4 py-2 max-w-[85%] text-sm whitespace-pre-wrap text-left'
              }
            >
              {m.content && <div>{m.content}</div>}
              {(m.attachments?.length ?? 0) > 0 && (
                <div className={`mt-${m.content ? '2' : '0'} flex flex-col gap-1`}>
                  {m.attachments!.map((a, ai) => (
                    <div
                      key={ai}
                      className={
                        m.role === 'user'
                          ? 'flex items-center gap-2 bg-white/15 rounded-lg px-2 py-1.5'
                          : 'flex items-center gap-2 bg-neutral-100 rounded-lg px-2 py-1.5'
                      }
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span className="text-xs font-medium truncate max-w-[180px]">{a.name}</span>
                      <span className={`text-[10px] ${m.role === 'user' ? 'opacity-70' : 'text-neutral-500'}`}>{formatSize(a.size)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!m.content && !m.attachments?.length && loading && i === messages.length - 1 ? '...' : null}
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

      {hasPendingAttachments && (
        <div className="px-3 pt-2 pb-1 border-t bg-white flex flex-wrap gap-1.5">
          {pendingAttachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-neutral-100 rounded-lg pl-2 pr-1 py-1 text-xs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-600">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span className="font-medium truncate max-w-[120px]">{a.name}</span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                aria-label={`Quitar ${a.name}`}
                className="w-4 h-4 rounded-full hover:bg-neutral-300 flex items-center justify-center text-neutral-600 text-[10px] font-bold"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 p-3 border-t bg-white items-center"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          aria-label="Adjuntar archivos"
          className="w-9 h-9 rounded-full border border-neutral-300 hover:bg-neutral-50 flex items-center justify-center text-neutral-600 disabled:opacity-50 flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Escribe tu mensaje"
          disabled={loading}
          className="flex-1 px-3 py-2 rounded-full border border-neutral-300 outline-none focus:border-[#2E5BFF] text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || (!input.trim() && !hasPendingAttachments)}
          className="px-4 py-2 rounded-full bg-[#2E5BFF] text-white disabled:opacity-50 text-sm"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
