'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, ChevronDown } from 'lucide-react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

// Paleta Noah — verde ventas #22c55e (canónico del meerkat comercial).
const NOAH_GREEN       = '#22c55e';
const NOAH_GREEN_DARK  = '#16A34A';
const NOAH_GREEN_BG    = 'rgba(34,197,94,0.12)';
const NOAH_GREEN_TINT  = 'rgba(34,197,94,0.22)';
const NOAH_AVATAR_SRC  = '/meerkats/noah.png';

function NoahAvatar({ size }: { size: number }) {
  // noah.png = retrato completo 352×721. Cara centrada en (x≈52%, y≈13%).
  // Anclamos con top/left al 50% del contenedor y translate negativo hacia
  // la cara (52%/13%), así queda centrada sin importar el `size`.
  return (
    <div
      style={{
        width:          size,
        height:         size,
        borderRadius:   '50%',
        overflow:       'hidden',
        display:        'block',
        position:       'relative',
        background:     '#FAFBFF',
      }}
    >
      <img
        src={NOAH_AVATAR_SRC}
        alt="Noah"
        style={{
          position:  'absolute',
          left:      '50%',
          top:       '50%',
          width:     `${size * 1.4}px`,
          maxWidth:  'none',
          height:    'auto',
          transform: 'translate(-51%, -18%)',
          display:   'block',
        }}
      />
    </div>
  );
}

// ─── WhatsApp SVG (lucide doesn't include it) ────────────────────────────────

function WhatsAppIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string };

const WELCOME: Message = {
  role:    'assistant',
  content: '¡Hola! Soy Noah, empleado de ventas de Centinelia.\n\nCuéntame de tu negocio y te digo si nuestros empleados digitales te sirven: cuánto ahorras, qué haría cada uno por ti, si el pricing te encaja. ¿Qué haces?',
};

const QUICK_QUESTIONS = [
  '¿Cuánto cuesta el plan Estándar?',
  '¿En cuánto tiempo se activa el empleado?',
  '¿Cómo se usan los minutos?',
];

const WA_NUMBER = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
const WA_LINK   = WA_NUMBER
  ? `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('¡Hola! Quiero saber cómo puedo contratar un agente 24/7 para mi organización.')}`
  : 'https://wa.me';

// ─── Main component ───────────────────────────────────────────────────────────

export default function LandingWidgets() {
  const [chatOpen,  setChatOpen]  = useState(false);
  const [messages,  setMessages]  = useState<Message[]>([WELCOME]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [pastHero,  setPastHero]  = useState(false);

  useEffect(() => {
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.7);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [chatOpen]);

  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const outgoing: Message[] = [...messages, { role: 'user', content: text.trim() }];
    setMessages([...outgoing, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/chat/sales', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: outgoing.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.body) return;

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer      = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text: chunk } = JSON.parse(payload) as { text?: string };
            if (chunk) {
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + chunk,
                };
                return updated;
              });
            }
          } catch { /* ignore malformed SSE chunks */ }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: 'Perdón, se me trabó. ¿Puedes repetir tu pregunta?',
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [messages, streaming]);

  const send = () => sendText(input);

  const showQuickQ = messages.length === 1;

  return (
    <>
      {/* ── Chat widget, bottom LEFT ──────────────────────────────────────── */}
      <div style={{
        position:   'fixed', bottom: 24, left: 24, zIndex: 9999,
        opacity:    pastHero ? 1 : 0,
        transform:  pastHero ? 'translateY(0)' : 'translateY(12px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        pointerEvents: pastHero ? 'auto' : 'none',
      }}>

        {/* Chat panel */}
        {chatOpen && (
          <div
            style={{
              position:       'absolute',
              bottom:         68,
              left:           0,
              width:          'min(360px, calc(100vw - 48px))',
              height:         'min(480px, calc(100dvh - 120px))',
              display:        'flex',
              flexDirection:  'column',
              overflow:       'hidden',
              background:     'rgba(10,4,28,0.97)',
              backdropFilter: 'blur(24px)',
              border:         '1px solid rgba(255,255,255,0.1)',
              borderRadius:   20,
              boxShadow:      `0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px ${NOAH_GREEN_TINT}`,
            }}
          >
            {/* Header */}
            <div
              style={{
                padding:        '13px 14px',
                borderBottom:   '1px solid rgba(255,255,255,0.07)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                background:     NOAH_GREEN_BG,
                flexShrink:     0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width:           36,
                  height:          36,
                  borderRadius:    '50%',
                  background:      '#FAFBFF',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  flexShrink:      0,
                  overflow:        'hidden',
                  border:          `1px solid ${NOAH_GREEN_TINT}`,
                }}>
                  <NoahAvatar size={36} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2 }}>
                    Noah
                  </p>
                  <p style={{ fontSize: 11, color: NOAH_GREEN, margin: 0 }}>
                    Ventas · Responde en segundos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border:     '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  width:      28,
                  height:     28,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor:     'pointer',
                  color:      'rgba(255,255,255,0.5)',
                  flexShrink: 0,
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Messages */}
            <div
              style={{
                flex:           1,
                overflowY:      'auto',
                padding:        '14px 13px',
                display:        'flex',
                flexDirection:  'column',
                gap:            10,
              }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    display:        'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    className={m.role === 'assistant' ? 'chat-md-dark' : undefined}
                    style={{
                      maxWidth:     '84%',
                      padding:      '9px 13px',
                      borderRadius: m.role === 'user'
                        ? '16px 16px 4px 16px'
                        : '4px 16px 16px 16px',
                      fontSize:     13,
                      lineHeight:   1.55,
                      whiteSpace:   m.role === 'user' ? 'pre-wrap' : 'normal',
                      wordBreak:    'break-word',
                      background:   m.role === 'user'
                        ? `linear-gradient(135deg, ${NOAH_GREEN}, ${NOAH_GREEN_DARK})`
                        : 'rgba(255,255,255,0.07)',
                      color:        '#fff',
                      border:       m.role === 'user'
                        ? 'none'
                        : '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    {m.content
                      ? (m.role === 'assistant'
                          ? <div dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }} />
                          : m.content)
                      : (streaming && i === messages.length - 1)
                        ? <span style={{ opacity: 0.4, letterSpacing: 2 }}>···</span>
                        : null
                    }
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick questions, only before first user message */}
            {showQuickQ && (
              <div style={{ padding: '0 13px 10px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                {QUICK_QUESTIONS.map(q => (
                  <button
                    key={q}
                    onClick={() => sendText(q)}
                    style={{
                      background:   NOAH_GREEN_BG,
                      border:       `1px solid ${NOAH_GREEN_TINT}`,
                      borderRadius: 10,
                      padding:      '7px 12px',
                      fontSize:     12,
                      color:        NOAH_GREEN,
                      cursor:       'pointer',
                      textAlign:    'left',
                      transition:   'background 0.15s',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div
              style={{
                padding:      '10px 12px',
                borderTop:    '1px solid rgba(255,255,255,0.06)',
                display:      'flex',
                gap:          7,
                alignItems:   'center',
                flexShrink:   0,
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Escribe tu pregunta…"
                style={{
                  flex:         1,
                  background:   'rgba(255,255,255,0.06)',
                  border:       '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding:      '9px 13px',
                  fontSize:     13,
                  color:        '#E2D9FF',
                  outline:      'none',
                  minWidth:     0,
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || streaming}
                style={{
                  width:          36,
                  height:         36,
                  borderRadius:   10,
                  background:     (input.trim() && !streaming)
                    ? `linear-gradient(135deg, ${NOAH_GREEN}, ${NOAH_GREEN_DARK})`
                    : 'rgba(255,255,255,0.06)',
                  border:         'none',
                  cursor:         (input.trim() && !streaming) ? 'pointer' : 'default',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  flexShrink:     0,
                  transition:     'background 0.2s',
                }}
              >
                <Send size={14} color={(input.trim() && !streaming) ? '#fff' : 'rgba(255,255,255,0.28)'} />
              </button>
            </div>
          </div>
        )}

        {/* Chat toggle button */}
        <button
          onClick={() => setChatOpen(o => !o)}
          title="Habla con Noah"
          style={{
            width:          56,
            height:         56,
            borderRadius:   '50%',
            background:     chatOpen
              ? 'rgba(255,255,255,0.08)'
              : '#FAFBFF',
            border:         chatOpen
              ? '1px solid rgba(255,255,255,0.15)'
              : `1px solid ${NOAH_GREEN_TINT}`,
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      chatOpen
              ? 'none'
              : '0 4px 28px rgba(34,197,94,0.55)',
            transition:     'all 0.2s',
            overflow:       'hidden',
          }}
        >
          {chatOpen
            ? <ChevronDown size={22} color="rgba(255,255,255,0.8)" />
            : <NoahAvatar size={56} />
          }
        </button>
      </div>

      {/* ── WhatsApp button, bottom RIGHT ────────────────────────────────── */}
      <a
        href={WA_LINK}
        target="_blank"
        rel="noopener noreferrer"
        title="Escríbenos por WhatsApp"
        style={{
          position:       'fixed',
          bottom:         24,
          right:          24,
          zIndex:         9999,
          opacity:        pastHero ? 1 : 0,
          transform:      pastHero ? 'translateY(0)' : 'translateY(12px)',
          transition:     'opacity 0.3s ease, transform 0.3s ease, box-shadow 0.2s',
          pointerEvents:  pastHero ? 'auto' : 'none',
          width:          56,
          height:         56,
          borderRadius:   '50%',
          background:     '#25D366',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          boxShadow:      '0 4px 24px rgba(37,211,102,0.45)',
          color:          '#fff',
          textDecoration: 'none',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.transform  = 'scale(1.1)';
          (e.currentTarget as HTMLAnchorElement).style.boxShadow  = '0 6px 32px rgba(37,211,102,0.65)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.transform  = 'scale(1)';
          (e.currentTarget as HTMLAnchorElement).style.boxShadow  = '0 4px 24px rgba(37,211,102,0.45)';
        }}
      >
        <WhatsAppIcon size={26} />
      </a>

      {/* Estilos markdown para chat con fondo dark */}
      <style jsx global>{`
        .chat-md-dark p { margin: 0.35em 0; }
        .chat-md-dark p:first-child { margin-top: 0; }
        .chat-md-dark p:last-child { margin-bottom: 0; }
        .chat-md-dark ul, .chat-md-dark ol { margin: 0.4em 0; padding-left: 1.15em; }
        .chat-md-dark li { margin: 0.12em 0; }
        .chat-md-dark h1, .chat-md-dark h2, .chat-md-dark h3, .chat-md-dark h4 {
          font-size: 0.95em; font-weight: 600; margin: 0.6em 0 0.25em; color: #fff;
        }
        .chat-md-dark h1:first-child, .chat-md-dark h2:first-child, .chat-md-dark h3:first-child { margin-top: 0; }
        .chat-md-dark strong { font-weight: 600; color: #fff; }
        .chat-md-dark em { font-style: italic; }
        .chat-md-dark code {
          background: rgba(34,197,94,0.18);
          padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.9em;
        }
        .chat-md-dark a { color: #22c55e; text-decoration: underline; }
        .chat-md-dark hr { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 0.5em 0; }
        .chat-md-dark table { border-collapse: collapse; margin: 0.4em 0; font-size: 0.92em; }
        .chat-md-dark th, .chat-md-dark td { border: 1px solid rgba(255,255,255,0.15); padding: 0.25em 0.5em; }
      `}</style>
    </>
  );
}
