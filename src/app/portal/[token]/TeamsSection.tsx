'use client';

import { useState, useEffect, useCallback } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

interface TeamsMessage {
  id:              string;
  conversation_id: string;
  sender_name:     string | null;
  sender_email:    string | null;
  chat_type:       string | null;
  message:         string;
  reply:           string;
  created_at:      string;
}

export default function TeamsSection({ token }: { token: string }) {
  const [messages, setMessages]       = useState<TeamsMessage[]>([]);
  const [userEmail, setUserEmail]     = useState('');
  const [savedEmail, setSavedEmail]   = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [copied, setCopied]           = useState(false);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [showSetup, setShowSetup]     = useState(false);

  const baseUrl    = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx');
  const webhookUrl = `${baseUrl}/api/teams/webhook/${token}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/portal/${token}/teams`);
      const data = await res.json();
      setMessages(data.messages ?? []);
      setSavedEmail(data.teams_user_email ?? null);
      setUserEmail(data.teams_user_email ?? '');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function copyUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/teams`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ teams_user_email: userEmail || null }),
      });
      setSavedEmail(userEmail || null);
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Webhook URL */}
      <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <div className="flex items-center gap-2 mb-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.053a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" fill="#5865F2"/>
          </svg>
          <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Microsoft Teams</h2>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--c-text-2)' }}>
          URL del webhook para configurar en Power Automate. Cópiala y pégala en el flujo.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 px-3 py-2.5 rounded-lg font-mono text-xs overflow-x-auto"
            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}>
            {webhookUrl}
          </div>
          <button onClick={copyUrl}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all"
            style={{ background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(108,59,255,0.1)', border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(108,59,255,0.25)', color: copied ? '#22c55e' : '#9B6DFF' }}>
            {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
          </button>
        </div>

        {/* Anti-loop email config */}
        <form onSubmit={saveEmail} className="flex flex-col gap-3">
          <div>
            <label className="text-xs block mb-1.5 font-medium" style={{ color: 'var(--c-text-2)' }}>
              Tu correo en Teams
              <span className="font-normal ml-1" style={{ color: 'var(--c-text-3)' }}>(evita que el agente responda tus propios mensajes)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={userEmail}
                onChange={e => setUserEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              />
              <button type="submit" disabled={saving}
                className="px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 transition-opacity hover:opacity-80"
                style={{ background: '#6C3BFF', color: '#fff' }}>
                {saving ? 'Guardando...' : savedEmail ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
            {savedEmail && (
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: '#22c55e' }}>
                <Check size={10} /> Configurado: {savedEmail}
              </p>
            )}
          </div>
        </form>
      </div>

      {/* Power Automate setup guide */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
        <button onClick={() => setShowSetup(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left transition-opacity hover:opacity-80"
          style={{ background: 'var(--c-surface)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>
              Cómo configurar Power Automate
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>
              Paso a paso
            </span>
          </div>
          {showSetup ? <ChevronUp size={14} style={{ color: 'var(--c-text-3)' }} /> : <ChevronDown size={14} style={{ color: 'var(--c-text-3)' }} />}
        </button>

        {showSetup && (
          <div className="px-5 pb-5" style={{ borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)' }}>
            <p className="text-xs mt-4 mb-4" style={{ color: 'var(--c-text-2)' }}>
              Entra a <strong>make.powerautomate.com</strong> con tu cuenta de Microsoft y crea un flujo nuevo (Automated cloud flow).
            </p>

            {[
              {
                n: 1,
                title: 'Trigger: mensaje nuevo en Teams',
                body: `Busca "Microsoft Teams" y elige el trigger:\n"When a new chat message is added"\n\nConecta con tu cuenta de Microsoft. Selecciona el chat específico que quieres monitorear (o déjalo en "All" para todos).`,
              },
              {
                n: 2,
                title: 'Condición: ignorar sus propios mensajes',
                body: `Agrega una acción "Condition":\n\nFrom > User Principal Name   is not equal to   nombre@empresa.com\n\nSolo continúa si es "Yes" (mensaje de otra persona).`,
              },
              {
                n: 3,
                title: 'HTTP: llamar al webhook de Centinelia',
                body: `Dentro del bloque "Yes", agrega la acción "HTTP".\n\nMétodo: POST\nURI: [pega aquí la URL del webhook de arriba]\n\nHeaders:\nContent-Type   application/json\n\nBody (pega este JSON exacto):\n{\n  "message": @{triggerOutputs()?['body/body/content']},\n  "sender_name": "@{triggerOutputs()?['body/from/user/displayName']}",\n  "sender_email": "@{triggerOutputs()?['body/from/user/userPrincipalName']}",\n  "conversation_id": "@{triggerOutputs()?['body/chatId']}",\n  "chat_type": "chat"\n}`,
                code: true,
              },
              {
                n: 4,
                title: 'Responder como tú (sin que se vea que es bot)',
                body: `Agrega la acción "Microsoft Teams - Post a message in a chat or channel".\n\nPost as: User  ← IMPORTANTE: elige "User", no "Flow bot"\nPost in: Chat with message sender\n\nMessage: @{body('HTTP')['reply']}\n\nCon "User" seleccionado y la conexión hecha con tu cuenta, el mensaje sale con tu nombre y foto de perfil. Tus contactos no ven ninguna diferencia.\n\nNota: Power Automate pedirá que autorices la conexión de Teams con tu cuenta de Microsoft la primera vez.`,
              },
              {
                n: 5,
                title: 'Guardar y probar',
                body: `Guarda el flujo. Pídele a alguien de confianza que te mande un mensaje de prueba.\nDebe aparecer la respuesta en segundos, con tu nombre y foto de perfil.\n\nSi el mensaje sale como "Flow bot" en lugar de tu nombre, ve a la acción del paso 4, haz clic en los tres puntos → "My connections" y asegúrate de que la conexión de Teams sea tu cuenta personal, no una compartida.`,
              },
            ].map(step => (
              <div key={step.n} className="flex gap-3 mb-4">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold"
                  style={{ background: 'rgba(108,59,255,0.15)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF', minWidth: 24 }}>
                  {step.n}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--c-text)' }}>{step.title}</p>
                  {step.code ? (
                    <>
                      {step.body.split('\n\n').map((block, i) => (
                        block.startsWith('{') || block.startsWith('"') ? (
                          <pre key={i} className="text-xs p-3 rounded-lg overflow-x-auto mb-2"
                            style={{ background: 'var(--c-bg)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {block}
                          </pre>
                        ) : (
                          <p key={i} className="text-xs mb-2 leading-relaxed whitespace-pre-line" style={{ color: 'var(--c-text-2)' }}>{block}</p>
                        )
                      ))}
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: 'var(--c-text-2)' }}>{step.body}</p>
                  )}
                </div>
              </div>
            ))}

            <div className="rounded-lg p-3 mt-2" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#f59e0b' }}>Posible bloqueo de IT</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                Si el trigger de Teams no está disponible o la acción HTTP está bloqueada, el departamento de IT deshabilitó esas funciones en Power Automate. En ese caso necesitarías pedirles que habiliten el conector de Teams y el conector HTTP para tu cuenta.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Message history */}
      <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}>
        <h2 className="text-xs font-semibold tracking-widest uppercase mb-4 flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
          <MessageSquare size={13} /> Mensajes recientes
        </h2>

        {loading ? (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <MessageSquare size={24} style={{ color: 'var(--c-text-3)', opacity: 0.3 }} />
            <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin mensajes todavía</p>
            <p className="text-xs text-center" style={{ color: 'var(--c-text-3)' }}>
              Cuando Power Automate mande el primer mensaje aparecerá aquí.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map(m => {
              const isOpen = expanded.has(m.id);
              return (
                <div key={m.id} className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid var(--c-border)' }}>
                  <button onClick={() => toggle(m.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-80"
                    style={{ background: 'var(--c-surface-2)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
                          {m.sender_name ?? m.sender_email ?? 'Contacto'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>{fmtTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-2)' }}>{m.message}</p>
                    </div>
                    {isOpen ? <ChevronUp size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
                  </button>

                  {isOpen && (
                    <div className="flex flex-col gap-3 p-4" style={{ borderTop: '1px solid var(--c-divider)' }}>
                      <div className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--c-text-3)' }}>
                          {m.sender_name ?? 'Contacto'}
                        </p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{m.message}</p>
                      </div>
                      <div className="rounded-lg p-3" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: '#9B6DFF' }}>Respuesta enviada</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)' }}>{m.reply}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
