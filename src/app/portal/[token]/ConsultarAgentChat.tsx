'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, FileText, Download, Zap, Wrench } from 'lucide-react';

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

const COLORS = [
  '#6C3BFF', '#9B6DFF', '#3b82f6', '#f59e0b',
  '#22c55e', '#a855f7', '#ef4444', '#06b6d4',
];

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
}

type Message = { role: 'user' | 'assistant'; content: string; tools?: string[] };

// Nombres legibles para los tools cuando aparecen en el chat
const TOOL_LABELS: Record<string, string> = {
  buscar_documento_oficina:       'Buscando documentos previos',
  enviar_documento_oficina:       'Enviando documento por correo',
  generar_propuesta_comercial:    'Generando propuesta comercial',
  generar_cotizacion:             'Generando cotización',
  generar_one_pager:              'Generando one-pager',
  generar_correo_estructurado:    'Redactando correo',
  generar_pitch_deck:             'Generando pitch deck',
  generar_reporte_metricas_excel: 'Generando reporte Excel',
  create_document:                'Generando documento',
  create_file:                    'Generando archivo',
  send_email:                     'Enviando correo',
  buscar_en_web:                  'Buscando en la web',
  read_url:                       'Leyendo página web',
  search_leads:                   'Investigando prospectos',
  crear_lead:                     'Registrando lead',
  agendar_cita:                   'Agendando cita',
  registrar_pedido:               'Registrando pedido',
  buscar_cliente:                 'Buscando cliente',
  delegate_task:                  'Delegando tarea',
  consult_agent:                  'Consultando compañero',
  create_contract_draft:          'Creando borrador de contrato',
  list_calendar_events:           'Consultando agenda',
  create_calendar_event:          'Agendando en calendario',
  reportar_falla:                 'Reportando falla al equipo',
  preparar_brief_del_dia:         'Preparando brief del día',
  revisar_desempeno_equipo:       'Revisando desempeño del equipo',
  aprobar_gasto:                  'Procesando aprobación de gasto',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Usando ${name.replace(/_/g, ' ')}`;
}

function welcomeMsg(agent: AgentOption, isOwner: boolean): Message {
  const name = agent.agent_name?.trim() || 'Centinelia';
  const role = agent.role?.trim();
  const who  = isOwner ? 'empleado' : 'compañero';
  return {
    role:    'assistant',
    content: `Hola, soy ${name}${role ? `, ${role} de ${agent.business_name}` : ''}. Soy tu ${who} digital y tengo acceso completo a la operación de ${agent.business_name}: llamadas recientes, bandeja de entrada, juntas, contratos y manual de la empresa. ¿En qué te puedo ayudar?`,
  };
}

interface Props {
  token:    string;
  agents:   AgentOption[];
  opsUsed?: number;
  opsLimit?: number;
  isOwner?: boolean;
}

export default function ConsultarAgentChat({ token, agents, opsUsed, opsLimit, isOwner = true }: Props) {
  const [selectedId, setSelectedId]   = useState<string>(agents[0]?.id ?? '');
  const [chatHistory, setChatHistory] = useState<Record<string, Message[]>>({});
  const [input, setInput]             = useState('');
  const [streaming, setStreaming]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const selectedAgent = agents.find(a => a.id === selectedId) ?? agents[0];
  const messages: Message[] = chatHistory[selectedId] ?? (selectedAgent ? [welcomeMsg(selectedAgent, isOwner)] : []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedId]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !selectedAgent) return;

    const current = chatHistory[selectedId] ?? [welcomeMsg(selectedAgent, isOwner)];
    const next: Message[] = [...current, { role: 'user', content: text }];

    setChatHistory(prev => ({ ...prev, [selectedId]: next }));
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch(`/api/portal/${token}/agent-chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          agentId:  selectedId,
        }),
      });

      if (!res.ok || !res.body) {
        const errMsg = res.status === 429
          ? 'Tu cuenta alcanzó el límite de tareas este mes. Compra más minutos desde Cuenta → Minutos y uso.'
          : 'Ocurrió un error. Intenta de nuevo.';
        setChatHistory(prev => ({
          ...prev,
          [selectedId]: [...next, { role: 'assistant', content: errMsg }],
        }));
        return;
      }

      setChatHistory(prev => ({
        ...prev,
        [selectedId]: [...next, { role: 'assistant', content: '' }],
      }));

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
            const parsed = JSON.parse(payload) as { text?: string; tool?: string };
            if (parsed.text) {
              const chunk = parsed.text;
              setChatHistory(prev => {
                const hist = prev[selectedId] ?? [];
                const last = hist[hist.length - 1];
                if (last?.role === 'assistant') {
                  return {
                    ...prev,
                    [selectedId]: [...hist.slice(0, -1), { ...last, content: last.content + chunk }],
                  };
                }
                return prev;
              });
            } else if (parsed.tool) {
              const toolName = parsed.tool;
              setChatHistory(prev => {
                const hist = prev[selectedId] ?? [];
                const last = hist[hist.length - 1];
                if (last?.role === 'assistant') {
                  const tools = [...(last.tools ?? []), toolName];
                  return {
                    ...prev,
                    [selectedId]: [...hist.slice(0, -1), { ...last, tools }],
                  };
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
        [selectedId]: [
          ...(prev[selectedId] ?? [welcomeMsg(selectedAgent, isOwner)]),
          { role: 'assistant', content: 'No pude conectarme. Verifica tu conexión.' },
        ],
      }));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, selectedAgent, selectedId, chatHistory, token]);

  if (!selectedAgent) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>No hay {isOwner ? 'empleados' : 'compañeros'} disponibles.</p>
      </div>
    );
  }

  const color   = selectedAgent.role_color || agentColor(selectedAgent.id);
  const initial = (selectedAgent.agent_name?.trim() || selectedAgent.business_name).charAt(0).toUpperCase();

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 101px)' }}>

      {/* Agent selector — only shown when multiple agents exist */}
      {agents.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3 flex-shrink-0">
          {agents.map(a => {
            const c   = agentColor(a.id);
            const sel = a.id === selectedId;
            return (
              <button
                key={a.id}
                onClick={() => { setSelectedId(a.id); setInput(''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                style={{
                  background: sel ? `${c}18` : 'var(--c-surface)',
                  border:     sel ? `1px solid ${c}40` : '1px solid var(--c-border)',
                  color:      sel ? c : 'var(--c-text-2)',
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center"
                  style={{ background: `${c}25` }}
                >
                  {a.avatar_url
                    ? <img src={a.avatar_url} alt="" className="w-full h-full object-contain" />
                    : <span className="text-[9px] font-bold" style={{ color: c }}>{(a.agent_name?.trim() || a.business_name).charAt(0).toUpperCase()}</span>
                  }
                </span>
                {a.agent_name?.trim() || a.business_name}
                {a.role && <span style={{ opacity: 0.55 }}>· {a.role}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Chat panel */}
      <div
        className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        {/* Agent header */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--c-border)', background: `${color}08` }}
        >
          <div
            className="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
            style={{ background: `${color}20`, border: `1px solid ${color}35` }}
          >
            {selectedAgent.avatar_url
              ? <img src={selectedAgent.avatar_url} alt="" className="w-full h-full object-contain p-0.5" />
              : <span className="text-sm font-bold" style={{ color }}>{initial}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              {selectedAgent.agent_name?.trim() || 'Centinelia'}
            </p>
            {selectedAgent.role && (
              <p className="text-xs truncate" style={{ color: 'var(--c-text-3)' }}>{selectedAgent.role}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {opsLimit !== undefined && opsLimit > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(108,59,255,0.1)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                {(opsLimit - (opsUsed ?? 0))} tareas restantes
              </span>
            )}
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--c-text-3)' }}>
              <Zap size={10} style={{ color: '#9B6DFF' }} />
              3–13 tareas/mensaje
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div
                  className="w-7 h-7 rounded-lg flex-shrink-0 mt-0.5 overflow-hidden flex items-center justify-center"
                  style={{ background: `${color}20`, border: `1px solid ${color}30` }}
                >
                  {selectedAgent.avatar_url
                    ? <img src={selectedAgent.avatar_url} alt="" className="w-full h-full object-contain" />
                    : <span className="text-xs font-bold" style={{ color }}>{initial}</span>
                  }
                </div>
              )}
              <div
                className="max-w-[78%] rounded-2xl text-sm leading-relaxed"
                style={
                  msg.role === 'user'
                    ? {
                        background:              'linear-gradient(135deg, #6C3BFF, #9B6DFF)',
                        color:                   '#fff',
                        borderBottomRightRadius: 4,
                        padding:                 '10px 14px',
                      }
                    : {
                        background:             'var(--c-bg)',
                        color:                  'var(--c-text)',
                        border:                 '1px solid var(--c-border)',
                        borderBottomLeftRadius: 4,
                        padding:                '10px 14px',
                      }
                }
              >
                {msg.role === 'assistant' && msg.tools && msg.tools.length > 0 && (
                  <div className="flex flex-col gap-1 mb-2">
                    {msg.tools.map((t, ti) => (
                      <div
                        key={ti}
                        className="inline-flex items-center gap-1.5 text-xs italic self-start"
                        style={{ color: 'var(--c-text-3)' }}
                      >
                        <Wrench size={10} />
                        <span>{toolLabel(t)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!msg.content
                  ? (
                    <span className="flex items-center gap-1.5" style={{ color: 'var(--c-text-3)' }}>
                      <Loader2 size={11} className="animate-spin" /> Pensando…
                    </span>
                  )
                  : msg.role === 'user'
                  ? <span className="whitespace-pre-wrap">{msg.content}</span>
                  : (
                    <div className="flex flex-col gap-2">
                      {parseContent(msg.content).map((part, pi) =>
                        typeof part === 'string' ? (
                          <span key={pi} className="whitespace-pre-wrap">{part}</span>
                        ) : (
                          <a
                            key={pi}
                            href={part.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 no-underline self-start"
                            style={{
                              background: 'rgba(108,59,255,0.1)',
                              color:      '#9B6DFF',
                              border:     '1px solid rgba(108,59,255,0.25)',
                            }}
                          >
                            <FileText size={11} />
                            <span className="max-w-[220px] truncate">{part.name}</span>
                            <Download size={10} style={{ opacity: 0.7, flexShrink: 0 }} />
                          </a>
                        )
                      )}
                    </div>
                  )
                }
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          className="flex items-end gap-2 px-3 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--c-border)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Pregúntale a tu ${isOwner ? 'empleado' : 'compañero'}… (Enter para enviar)`}
            disabled={streaming}
            rows={1}
            className="flex-1 text-sm outline-none resize-none leading-relaxed"
            style={{
              background:   'var(--c-input-bg)',
              border:       '1px solid var(--c-input-border)',
              borderRadius: 14,
              padding:      '10px 14px',
              color:        'var(--c-text)',
              maxHeight:    120,
              overflowY:    'auto',
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: input.trim() && !streaming ? '#6C3BFF' : 'rgba(108,59,255,0.15)',
              border:     '1px solid rgba(108,59,255,0.3)',
              opacity:    !input.trim() || streaming ? 0.5 : 1,
            }}
          >
            {streaming
              ? <Loader2 size={15} color="#A07CFF" className="animate-spin" />
              : <Send size={15} color={input.trim() ? '#fff' : '#A07CFF'} />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
