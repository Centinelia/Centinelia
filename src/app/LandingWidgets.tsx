'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Send, ChevronDown } from 'lucide-react';

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
  content: '¡Hola! Soy el asistente de Centinelia 👋\n\n¿Tienes dudas sobre los planes, el precio o cómo funciona tu empleado digital? Pregúntame lo que sea.',
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
          content: 'Lo siento, ocurrió un error. Intenta de nuevo.',
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
              boxShadow:      '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(108,59,255,0.15)',
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
                background:     'rgba(108,59,255,0.12)',
                flexShrink:     0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width:           34,
                  height:          34,
                  borderRadius:    10,
                  background:      'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  flexShrink:      0,
                }}>
                  <MessageCircle size={15} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.2 }}>
                    Asistente Centinelia
                  </p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
                    Respuesta inmediata
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
                    style={{
                      maxWidth:     '84%',
                      padding:      '9px 13px',
                      borderRadius: m.role === 'user'
                        ? '16px 16px 4px 16px'
                        : '4px 16px 16px 16px',
                      fontSize:     13,
                      lineHeight:   1.55,
                      whiteSpace:   'pre-wrap',
                      wordBreak:    'break-word',
                      background:   m.role === 'user'
                        ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)'
                        : 'rgba(255,255,255,0.07)',
                      color:        '#fff',
                      border:       m.role === 'user'
                        ? 'none'
                        : '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    {m.content
                      ? m.content
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
                      background:   'rgba(108,59,255,0.1)',
                      border:       '1px solid rgba(108,59,255,0.22)',
                      borderRadius: 10,
                      padding:      '7px 12px',
                      fontSize:     12,
                      color:        '#9B6DFF',
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
                    ? 'linear-gradient(135deg, #6C3BFF, #9B6DFF)'
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
          title="Chat con el asistente"
          style={{
            width:          56,
            height:         56,
            borderRadius:   '50%',
            background:     chatOpen
              ? 'rgba(255,255,255,0.08)'
              : 'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
            border:         chatOpen
              ? '1px solid rgba(255,255,255,0.15)'
              : 'none',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      chatOpen
              ? 'none'
              : '0 4px 28px rgba(108,59,255,0.6)',
            transition:     'all 0.2s',
          }}
        >
          {chatOpen
            ? <ChevronDown size={22} color="rgba(255,255,255,0.8)" />
            : <MessageCircle size={22} color="#fff" />
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
    </>
  );
}
