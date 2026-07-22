'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, FileText, Download, Zap } from 'lucide-react';

const FILE_URL_RE = /https?:\/\/[^\s]+\.(?:pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|zip|txt|csv|mp3|mp4|webm|wav|ogg)(?:\?[^\s]*)?/gi;

type ContentPart = string | { url: string; name: string };

function parseContent(text: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let last = 0;
  FILE_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILE_URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'archivo');
    parts.push({ url, name });
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const COLORS = ['#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b', '#22c55e', '#a855f7', '#ef4444', '#06b6d4'];
function agentColor(id: string): string {
  const hash = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORS[hash % COLORS.length];
}

export interface AgentOption {
  id:            string;
  agent_name:    string | null;
  role:          string | null;
  business_name: string;
  avatar_url?:   string | null;
  role_color?:   string | null;
  genero?:       'M' | 'F';
}

type Message = { role: 'user' | 'assistant'; content: string };

function welcomeMsg(agent: AgentOption): Message {
  const name = agent.agent_name?.trim() || 'Centinelia';
  const role = agent.role?.trim();
  return {
    role: 'assistant',
    content: `Hola, soy ${name}${role ? `, ${role} de ${agent.business_name}` : ''}. Tengo acceso completo a la operación de ${agent.business_name}: llamadas recientes, bandeja de entrada, juntas, contratos y manual de la organización. ¿En qué te puedo ayudar?`,
  };
}

// ── Bubble messages ───────────────────────────────────────────────────────────

type MsgFn = (name: string, genero: 'M' | 'F') => string;

function greeting() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

const BUBBLE_MSGS: MsgFn[] = [
  (name)       => `${greeting()}, jefe. Aquí ${name}.`,
  (name)       => `${greeting()}. ¿En qué te puedo ayudar hoy?`,
  ()           => '¿Hay más trabajo para nosotros?',
  (name)       => `${name} por aquí. Aquí cuando me necesites.`,
  ()           => 'Todo en orden por el momento.',
  ()           => 'Sin incidentes por aquí.',
  ()           => 'Acabo de terminar con lo de antes.',
  ()           => '¿Checamos la bandeja juntos?',
  ()           => 'Detecté algo interesante. ¿Lo revisamos?',
  ()           => '¿Quieres un resumen de lo que pasó hoy?',
  ()           => '¿En qué podemos ayudarte hoy?',
  (name, g)    => `Soy ${name}. ${g === 'F' ? 'Lista' : 'Listo'} para lo que sigue.`,
];

interface BubbleState {
  text:     string;
  agent:    AgentOption;
  key:      number;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  token:  string;
  agents: AgentOption[];
}

export default function OpsAgentChatFab({ token, agents }: Props) {
  const [open, setOpen]           = useState(false);
  const [selectedId, setSelectedId] = useState<string>(agents[0]?.id ?? '');
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);

  // Bubble state
  const [bubble,        setBubble]        = useState<BubbleState | null>(null);
  const [bubbleVisible, setBubbleVisible] = useState(false);
  const openRef    = useRef(open);
  const bubbleKey  = useRef(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const selectedAgent = agents.find(a => a.id === selectedId) ?? agents[0];
  const messages: Message[] = chatHistory[selectedId] ?? (selectedAgent ? [welcomeMsg(selectedAgent)] : []);

  useEffect(() => { openRef.current = open; }, [open]);

  // Bubble timer — starts once, runs independently of open state
  useEffect(() => {
    if (agents.length === 0) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    function showBubble() {
      if (!openRef.current) {
        const agent = agents[Math.floor(Math.random() * agents.length)];
        const fn    = BUBBLE_MSGS[Math.floor(Math.random() * BUBBLE_MSGS.length)];
        const name  = agent.agent_name?.trim() || 'tu empleado';

        setBubble({ text: fn(name, agent.genero ?? 'M'), agent, key: ++bubbleKey.current });
        setBubbleVisible(true);

        setTimeout(() => {
          setBubbleVisible(false);
          setTimeout(() => setBubble(null), 400);
        }, 5_500);
      }

      // Next bubble: 3–4 minutes (randomized)
      const delay = (180 + Math.floor(Math.random() * 60)) * 1_000;
      timeoutId = setTimeout(showBubble, delay);
    }

    // First bubble: 20 seconds after mount
    timeoutId = setTimeout(showBubble, 20_000);
    return () => clearTimeout(timeoutId);
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, selectedId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !selectedAgent) return;

    const current = chatHistory[selectedId] ?? [welcomeMsg(selectedAgent)];
    const next: Message[] = [...current, { role: 'user', content: text }];

    setChatHistory(prev => ({ ...prev, [selectedId]: next }));
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch(`/api/portal/${token}/agent-chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: next.map(m => ({ role: m.role, content: m.content })), agentId: selectedId }),
      });

      if (!res.ok || !res.body) {
        setChatHistory(prev => ({ ...prev, [selectedId]: [...next, { role: 'assistant', content: 'Ocurrió un error. Intenta de nuevo.' }] }));
        return;
      }

      setChatHistory(prev => ({ ...prev, [selectedId]: [...next, { role: 'assistant', content: '' }] }));

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
              setChatHistory(prev => {
                const hist = prev[selectedId] ?? [];
                const last = hist[hist.length - 1];
                if (last?.role === 'assistant') {
                  return { ...prev, [selectedId]: [...hist.slice(0, -1), { role: 'assistant', content: last.content + chunk }] };
                }
                return prev;
              });
            }
          } catch { /* ignore malformed chunks */ }
        }
      }
    } catch {
      setChatHistory(prev => ({
        ...prev,
        [selectedId]: [...(prev[selectedId] ?? [welcomeMsg(selectedAgent)]), { role: 'assistant', content: 'No pude conectarme. Verifica tu conexión.' }],
      }));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, selectedAgent, selectedId, chatHistory, token]);

  if (!selectedAgent) return null;

  const color   = selectedAgent.role_color || agentColor(selectedAgent.id);
  const initial = (selectedAgent.agent_name?.trim() || selectedAgent.business_name).charAt(0).toUpperCase();

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex flex-col overflow-hidden"
          style={{
            width:     'min(380px, calc(100vw - 32px))',
            height:    500,
            background: 'var(--c-modal)',
            border:    `1px solid ${color}50`,
            borderRadius: 20,
            boxShadow: `0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px ${color}18, inset 0 1px 0 rgba(255,255,255,0.05)`,
          }}
        >
          {/* Agent selector (multi-agent only) */}
          {agents.length > 1 && (
            <div className="flex gap-1.5 px-3 pt-2.5 pb-2 flex-shrink-0 flex-wrap" style={{ borderBottom: '1px solid var(--c-border)' }}>
              {agents.map(a => {
                const c   = a.role_color || agentColor(a.id);
                const sel = a.id === selectedId;
                return (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedId(a.id); setInput(''); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: sel ? `${c}18` : 'var(--c-surface)',
                      border:     sel ? `1px solid ${c}40` : '1px solid var(--c-border)',
                      color:      sel ? c : 'var(--c-text-2)',
                    }}
                  >
                    <span className="w-4 h-4 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
                      style={{ background: `${c}25` }}>
                      {a.avatar_url
                        ? <img src={a.avatar_url} alt="" className="w-full h-full object-contain" />
                        : <span className="text-[9px] font-bold" style={{ color: c }}>{(a.agent_name?.trim() || a.business_name).charAt(0).toUpperCase()}</span>
                      }
                    </span>
                    {a.agent_name?.trim() || a.business_name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--c-border)', background: `${color}08` }}>
            <div className="w-8 h-8 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
              style={{ background: `${color}20`, border: `1px solid ${color}35` }}>
              {selectedAgent.avatar_url
                ? <img src={selectedAgent.avatar_url} alt="" className="w-full h-full object-contain p-0.5" />
                : <span className="text-sm font-bold" style={{ color }}>{initial}</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                {selectedAgent.agent_name?.trim() || 'Agente'}
              </p>
              {selectedAgent.role && (
                <p className="text-xs truncate" style={{ color: selectedAgent.role_color || 'var(--c-text-3)' }}>{selectedAgent.role}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>En línea</span>
              <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--c-text-3)' }}>
                <Zap size={9} style={{ color: '#9B6DFF' }} />
                3–13 tareas/msg
              </span>
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--c-surface-2)]"
                style={{ color: 'var(--c-text-3)', marginLeft: 4 }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg flex-shrink-0 mt-0.5 overflow-hidden flex items-center justify-center"
                    style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
                    {selectedAgent.avatar_url
                      ? <img src={selectedAgent.avatar_url} alt="" className="w-full h-full object-contain" />
                      : <span className="text-xs font-bold" style={{ color }}>{initial}</span>
                    }
                  </div>
                )}
                <div
                  className="max-w-[80%] rounded-2xl text-sm leading-relaxed"
                  style={msg.role === 'user'
                    ? { background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff', borderBottomRightRadius: 4, padding: '8px 12px' }
                    : { background: 'var(--c-bg)', color: 'var(--c-text)', border: '1px solid var(--c-border)', borderBottomLeftRadius: 4, padding: '8px 12px' }}
                >
                  {!msg.content ? (
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
                      <Loader2 size={11} className="animate-spin" /> Pensando…
                    </span>
                  ) : msg.role === 'user' ? (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {parseContent(msg.content).map((part, pi) =>
                        typeof part === 'string' ? (
                          <span key={pi} className="whitespace-pre-wrap">{part}</span>
                        ) : (
                          <a key={pi} href={part.url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium no-underline self-start"
                            style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.25)' }}>
                            <FileText size={10} />
                            <span className="max-w-[180px] truncate">{part.name}</span>
                            <Download size={9} style={{ opacity: 0.7 }} />
                          </a>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid var(--c-border)' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Pregunta a tu empleado… (Enter)"
              disabled={streaming}
              rows={1}
              className="flex-1 text-sm outline-none resize-none leading-relaxed"
              style={{
                background:   'var(--c-input-bg)',
                border:       '1px solid var(--c-input-border)',
                borderRadius: 12,
                padding:      '8px 12px',
                color:        'var(--c-text)',
                maxHeight:    100,
                overflowY:    'auto',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
              style={{
                background: input.trim() && !streaming ? '#6C3BFF' : 'rgba(108,59,255,0.15)',
                border:     '1px solid rgba(108,59,255,0.3)',
                opacity:    !input.trim() || streaming ? 0.5 : 1,
              }}
            >
              {streaming
                ? <Loader2 size={14} color="#A07CFF" className="animate-spin" />
                : <Send size={14} color={input.trim() ? '#fff' : '#A07CFF'} />
              }
            </button>
          </div>
        </div>
      )}

      {/* Floating bubble — appears above the FAB */}
      {bubble && !open && (
        <div
          key={bubble.key}
          className="fixed right-4 z-50 flex items-end gap-2"
          style={{
            bottom:     84,
            maxWidth:   240,
            opacity:    bubbleVisible ? 1 : 0,
            transform:  bubbleVisible ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
            transition: bubbleVisible
              ? 'opacity 0.25s ease, transform 0.25s ease'
              : 'opacity 0.35s ease, transform 0.35s ease',
            pointerEvents: 'none',
          }}
        >
          {/* Avatar */}
          <div
            className="flex-shrink-0 overflow-hidden flex items-center justify-center"
            style={{
              width:        28,
              height:       28,
              borderRadius: 8,
              background:   `${bubble.agent.role_color || agentColor(bubble.agent.id)}20`,
              border:       `1px solid ${bubble.agent.role_color || agentColor(bubble.agent.id)}35`,
            }}
          >
            {bubble.agent.avatar_url
              ? <img src={bubble.agent.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 11, fontWeight: 700, color: bubble.agent.role_color || agentColor(bubble.agent.id) }}>
                  {(bubble.agent.agent_name?.trim() || bubble.agent.business_name).charAt(0).toUpperCase()}
                </span>
            }
          </div>

          {/* Speech bubble */}
          <div
            style={{
              background:    'var(--c-modal)',
              border:        '1px solid var(--c-border)',
              borderRadius:  14,
              borderBottomRightRadius: 4,
              padding:       '8px 12px',
              boxShadow:     '0 4px 20px rgba(0,0,0,0.18)',
              fontSize:      13,
              lineHeight:    1.4,
              color:         'var(--c-text)',
              wordBreak:     'break-word',
            }}
          >
            {bubble.text}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center transition-all"
        style={{
          background: 'linear-gradient(135deg, #5B28FF 0%, #8B3FFF 100%)',
          boxShadow:  '0 8px 32px rgba(108,59,255,0.45)',
          border:     '1px solid rgba(255,255,255,0.15)',
        }}
        aria-label="Consultar empleado"
      >
        {open ? (
          <X size={22} color="#fff" />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/logo-icon.png"
            alt="Centinelia"
            style={{ width: 36, height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
          />
        )}
      </button>
    </>
  );
}
