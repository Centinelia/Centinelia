'use client';

import { useState, useRef } from 'react';
import { Pencil, Check } from 'lucide-react';

export default function AgentNameEditor({
  token,
  agentId,
  initialName,
}: {
  token: string;
  agentId?: string;
  initialName: string;
}) {
  const [name,    setName]    = useState(initialName || 'Centinelia');
  const [editing, setEditing] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    setEditing(false);
    const trimmed = name.trim() || 'Centinelia';
    setName(trimmed);
    const res = await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...(agentId ? { agentId } : {}), agent_name: trimmed }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') { setName(initialName || 'Centinelia'); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="text-sm font-semibold bg-transparent outline-none border-b"
        style={{
          color:       'var(--c-text)',
          borderColor: '#6C3BFF',
          minWidth:    60,
          maxWidth:    200,
        }}
      />
    );
  }

  return (
    <span className="flex items-center gap-1.5 group">
      <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
        {name}
      </span>
      {saved
        ? <Check size={12} color="#22c55e" />
        : (
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            style={{ color: 'var(--c-text-3)', lineHeight: 1 }}
          >
            <Pencil size={12} />
          </button>
        )
      }
    </span>
  );
}
