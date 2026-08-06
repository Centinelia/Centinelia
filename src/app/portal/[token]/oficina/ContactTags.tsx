'use client';

/**
 * ContactTags — chips editables para tags de un contacto outbound.
 *
 * Muestra tags actuales como chips lila con X para remover, y un input
 * inline para agregar tags nuevos. Autocomplete con sugerencias comunes
 * (compró, cotizó, interesado, etc.).
 *
 * onChange dispara con el array actualizado; el consumer (ContactRow)
 * hace el fetch al PATCH endpoint.
 */

import { useState, useRef, useEffect } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';

export const SUGGESTED_TAGS = [
  'compró',
  'cotizó',
  'interesado',
  'no interesado',
  'seguimiento',
  'vencido',
  'nuevo',
  'vip',
];

interface Props {
  tags:      string[];
  onChange:  (next: string[]) => void | Promise<void>;
  readOnly?: boolean;
  size?:     'sm' | 'md';
}

function slugify(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 40);
}

export default function ContactTags({ tags, onChange, readOnly = false, size = 'sm' }: Props) {
  const [draft, setDraft]     = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async (next: string[]) => {
    setSaving(true);
    try { await onChange(next); } finally { setSaving(false); }
  };

  const addTag = async (raw: string) => {
    const t = slugify(raw);
    if (!t) { setDraft(''); return; }
    if (tags.includes(t)) { setDraft(''); return; }
    await commit([...tags, t]);
    setDraft('');
  };

  const removeTag = async (tag: string) => {
    await commit(tags.filter(x => x !== tag));
  };

  const chipPad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  const suggestionsToShow = SUGGESTED_TAGS
    .filter(s => !tags.includes(s))
    .filter(s => draft.trim() === '' || s.includes(draft.trim().toLowerCase()))
    .slice(0, 4);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(tag => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 rounded-full font-medium ${chipPad}`}
          style={{ background: 'rgba(108,59,255,0.08)', color: '#6C3BFF', border: '1px solid rgba(108,59,255,0.22)' }}
        >
          <TagIcon size={10} strokeWidth={2} style={{ opacity: 0.7 }} />
          {tag}
          {!readOnly && (
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={saving}
              className="hover:opacity-70 disabled:opacity-40 ml-0.5"
              aria-label={`Quitar tag ${tag}`}
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}

      {!readOnly && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`inline-flex items-center gap-1 rounded-full font-medium transition-colors ${chipPad}`}
          style={{
            background:  '#ffffff',
            color:       '#6B6480',
            border:      '1px dashed #C4B8DE',
            cursor:      'pointer',
          }}
        >
          <Plus size={10} strokeWidth={2.5} />
          {tags.length === 0 ? 'Agregar tag' : 'Más'}
        </button>
      )}

      {!readOnly && editing && (
        <div className="inline-flex flex-col relative">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(draft); }
              if (e.key === 'Escape') { setDraft(''); setEditing(false); }
            }}
            onBlur={() => {
              // Delay para permitir click en sugerencia
              setTimeout(() => setEditing(false), 150);
            }}
            placeholder="tag..."
            className="rounded-full px-2.5 py-0.5 text-[11px] outline-none"
            style={{
              background:  '#ffffff',
              border:      '1px solid #6C3BFF',
              color:       '#1A0A3B',
              minWidth:    100,
              maxWidth:    140,
            }}
          />
          {suggestionsToShow.length > 0 && (
            <div
              className="absolute top-full left-0 mt-1 flex flex-col gap-0.5 rounded-lg p-1 shadow-lg z-10 min-w-[140px]"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5' }}
            >
              {suggestionsToShow.map(s => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); addTag(s); }}
                  className="text-left rounded px-2 py-1 text-[11px] transition-colors"
                  style={{ color: '#1A0A3B' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#F5F0FF'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
