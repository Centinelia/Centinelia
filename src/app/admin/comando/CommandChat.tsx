'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Terminal, ChevronUp } from 'lucide-react';

interface Entry {
  id:        string;
  input:     string;
  trace?:    string;
  message?:  string;
  error?:    string;
  ok:       boolean;
  ms?:       number;
  ts:        number;
}

const HISTORY_KEY = 'centinelia.admin.command-history';
const MAX_HISTORY = 200;

/**
 * Render markdown-lite: **bold**, `code`. No usa una lib externa, mantenemos la
 * superficie chica.
 */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      nodes.push(<strong key={i} style={{ color: '#111827' }}>{p.slice(2, -2)}</strong>);
    } else if (p.startsWith('`') && p.endsWith('`')) {
      nodes.push(
        <code
          key={i}
          style={{
            background: '#F3F4F6',
            color: '#111827',
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {p.slice(1, -1)}
        </code>,
      );
    } else if (p) {
      nodes.push(<span key={i}>{p}</span>);
    }
  });
  return nodes;
}

function Markdown({ text }: { text: string }) {
  return (
    <div style={{ whiteSpace: 'pre-wrap', color: '#374151', lineHeight: 1.6, fontSize: 13 }}>
      {text.split('\n').map((line, i) => (
        <div key={i}>{renderInline(line) || <>&nbsp;</>}</div>
      ))}
    </div>
  );
}

export default function CommandChat() {
  const [entries, setEntries]   = useState<Entry[]>([]);
  const [input, setInput]       = useState('');
  const [running, setRunning]   = useState(false);
  const [histIdx, setHistIdx]   = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setEntries(JSON.parse(raw) as Entry[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      const trimmed = entries.slice(-MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch { /* ignore */ }
  }, [entries]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries.length, running]);

  const previousInputs = entries.map(e => e.input).filter(Boolean);

  const submit = async () => {
    const cmd = input.trim();
    if (!cmd || running) return;

    setRunning(true);
    setHistIdx(-1);
    const entry: Entry = { id: crypto.randomUUID(), input: cmd, ok: false, ts: Date.now() };
    setEntries(prev => [...prev, entry]);
    setInput('');

    try {
      const res  = await fetch('/api/admin/command', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ input: cmd }),
      });
      const data = await res.json();
      setEntries(prev => prev.map(e => e.id === entry.id ? {
        ...e,
        ok:      data.ok,
        trace:   data.trace,
        message: data.message ?? data.parseError,
        error:   data.error,
        ms:      data.ms,
      } : e));
      if (!data.ok && data.suggestion) {
        setEntries(prev => [...prev, {
          id:      crypto.randomUUID(),
          input:   '',
          ok:      true,
          message: `Sugerencia: ${data.suggestion}`,
          ts:      Date.now(),
        }]);
      }
    } catch (err) {
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ok: false, error: String(err) } : e));
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowUp' && !input && previousInputs.length > 0) {
      e.preventDefault();
      const next = histIdx < 0 ? previousInputs.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(previousInputs[next] ?? '');
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      e.preventDefault();
      const next = histIdx + 1;
      if (next >= previousInputs.length) { setHistIdx(-1); setInput(''); }
      else { setHistIdx(next); setInput(previousInputs[next] ?? ''); }
    }
  };

  const clearHistory = () => {
    if (!confirm('¿Borrar historial local?')) return;
    setEntries([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', color: '#111827', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid #E5E7EB',
          background: '#FFFFFF',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Terminal size={18} style={{ color: '#6C3BFF' }} />
          <span style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>Comando</span>
          <span style={{ color: '#6B7280', fontSize: 12 }}>determinístico, cero tokens si matchea</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={clearHistory}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#374151',
              fontSize: 12,
              fontWeight: 500,
              padding: '6px 12px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Limpiar
          </button>
          <a
            href="/admin/dashboard"
            style={{ color: '#6B7280', fontSize: 13, textDecoration: 'none' }}
          >
            ← Dashboard
          </a>
        </div>
      </header>

      {/* Scrollback */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6B7280', marginTop: 60, fontSize: 13 }}>
            Empieza escribiendo{' '}
            <code
              style={{
                background: '#F3F4F6',
                color: '#111827',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              help
            </code>{' '}
            para ver los comandos disponibles.
          </div>
        )}
        {entries.map(e => (
          <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {e.input && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{ color: '#6C3BFF', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>&gt;</span>
                <span style={{ color: '#111827', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{e.input}</span>
              </div>
            )}
            {e.trace && (
              <div style={{ paddingLeft: 22, color: '#9CA3AF', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
                parse: {e.trace}{typeof e.ms === 'number' ? ` · ${e.ms}ms` : ''}
              </div>
            )}
            {e.message && (
              <div
                style={{
                  paddingLeft: 22,
                  paddingTop: 4,
                  borderLeft: e.input ? `2px solid ${e.ok ? '#10B981' : '#EF4444'}` : 'none',
                  marginLeft: e.input ? 4 : 0,
                }}
              >
                <Markdown text={e.message} />
              </div>
            )}
            {e.error && (
              <div style={{ paddingLeft: 22, color: '#EF4444', fontSize: 13 }}>
                {e.error}
              </div>
            )}
          </div>
        ))}
        {running && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#6B7280', fontSize: 12 }}>
            <Loader2 size={13} className="animate-spin" /> Ejecutando...
          </div>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: '1px solid #E5E7EB',
          background: '#FFFFFF',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); if (histIdx >= 0) setHistIdx(-1); }}
              onKeyDown={handleKey}
              placeholder="Escribe un comando... (help, budget report, health <email>, reset ops <email>)"
              rows={1}
              autoFocus
              disabled={running}
              style={{
                width:          '100%',
                background:     '#FFFFFF',
                border:         '1px solid #E5E7EB',
                borderRadius:   12,
                padding:        '12px 44px 12px 14px',
                color:          '#111827',
                fontFamily:     'ui-monospace, monospace',
                fontSize:       13,
                resize:         'none',
                minHeight:      44,
                maxHeight:      140,
                outline:        'none',
              }}
            />
            <button
              onClick={submit}
              disabled={running || !input.trim()}
              style={{
                position:    'absolute',
                right:       8,
                bottom:      8,
                background:  '#6C3BFF',
                color:       '#FFFFFF',
                border:      'none',
                borderRadius: 8,
                padding:     '6px 10px',
                cursor:      running || !input.trim() ? 'not-allowed' : 'pointer',
                opacity:     running || !input.trim() ? 0.4 : 1,
                display:     'flex',
                alignItems:  'center',
                gap:         4,
                fontSize:    12,
              }}
            >
              <Send size={13} />
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, color: '#9CA3AF', fontSize: 11, display: 'flex', gap: 12 }}>
          <span>
            <ChevronUp size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> historial
          </span>
          <span>Shift+Enter = nueva línea</span>
          <span>Enter = ejecutar</span>
        </div>
      </div>
    </div>
  );
}
