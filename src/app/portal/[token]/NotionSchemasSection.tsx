'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Database, Trash2, CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, X, Loader2 } from 'lucide-react';

interface RequiredProp { name: string; type: string }

interface NotionDbSchema {
  id:                string;
  agent_id:          string;
  db_name:           string;
  notion_db_id:      string;
  db_type:           'read' | 'write';
  required_props:    RequiredProp[];
  allowed_values:    Record<string, string[]>;
  description:       string | null;
  last_validated_at: string | null;
  last_violations:   Array<{ page_id: string; page_title: string; issues: string[] }>;
  active:            boolean;
}

const PROP_TYPES = ['title', 'rich_text', 'number', 'select', 'date', 'email', 'phone_number', 'url', 'checkbox'];

const empty = (): {
  db_name: string; notion_db_id: string; db_type: 'read' | 'write';
  description: string; required_props: RequiredProp[]; allowed_values: Record<string, string[]>;
  propNameInput: string; propTypeInput: string; avPropInput: string; avValInput: string;
} => ({
  db_name:        '',
  notion_db_id:   '',
  db_type:        'read',
  description:    '',
  required_props: [] as RequiredProp[],
  allowed_values: {} as Record<string, string[]>,
  propNameInput:  '',
  propTypeInput:  'rich_text',
  avPropInput:    '',
  avValInput:     '',
});

export default function NotionSchemasSection({ token }: { token: string }) {
  const [schemas, setSchemas]   = useState<NotionDbSchema[]>([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [expandedId, setExpanded]   = useState<string | null>(null);
  const [form, setForm]         = useState(empty());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/portal/${token}/notion-schemas`);
    if (res.ok) {
      const data = await res.json();
      setSchemas(data.schemas ?? []);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.db_name.trim() || !form.notion_db_id.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/portal/${token}/notion-schemas`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        db_name:        form.db_name,
        notion_db_id:   form.notion_db_id,
        db_type:        form.db_type,
        description:    form.description || null,
        required_props: form.required_props,
        allowed_values: form.allowed_values,
      }),
    });
    setSaving(false);
    if (res.ok) { setCreating(false); setForm(empty()); load(); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este schema?')) return;
    await fetch(`/api/portal/${token}/notion-schemas`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setSchemas(prev => prev.filter(s => s.id !== id));
  };

  const handleValidate = async (id: string, agentId: string) => {
    setValidating(id);
    await fetch(`/api/portal/${token}/notion-schemas`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, action: 'validate' }),
    });
    setValidating(null);
    load();
  };

  const addProp = () => {
    const name = form.propNameInput.trim();
    if (!name || form.required_props.some(p => p.name === name)) return;
    setForm(f => ({ ...f, required_props: [...f.required_props, { name, type: f.propTypeInput }], propNameInput: '' }));
  };

  const removeProp = (name: string) =>
    setForm(f => ({ ...f, required_props: f.required_props.filter(p => p.name !== name) }));

  const addAllowedValue = () => {
    const prop = form.avPropInput.trim();
    const val  = form.avValInput.trim();
    if (!prop || !val) return;
    setForm(f => ({
      ...f,
      allowed_values: {
        ...f.allowed_values,
        [prop]: [...(f.allowed_values[prop] ?? []).filter(v => v !== val), val],
      },
      avValInput: '',
    }));
  };

  const removeAllowedValue = (prop: string, val: string) =>
    setForm(f => {
      const updated = (f.allowed_values[prop] ?? []).filter(v => v !== val);
      const av = { ...f.allowed_values };
      if (updated.length) av[prop] = updated; else delete av[prop];
      return { ...f, allowed_values: av };
    });

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 size={18} className="animate-spin" style={{ color: 'var(--c-text-4)' }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} style={{ color: '#6C3BFF' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Schemas de Notion</span>
        </div>
        {!creating && (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
            style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#9B6DFF' }}>
            <Plus size={12} />Conectar base de datos
          </button>
        )}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-4)' }}>
        Define la estructura esperada de tus bases de datos de Notion. Tu empleado valida semanalmente que cada entrada cumpla el schema y te notifica si hay problemas.
      </p>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl p-4 flex flex-col gap-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B6DFF' }}>Nueva base de datos</p>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Nombre</label>
              <input value={form.db_name} onChange={e => setForm(f => ({ ...f, db_name: e.target.value }))}
                placeholder="Ej: Proveedores aprobados"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
            </div>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Tipo</label>
              <div className="flex gap-1.5">
                {(['read', 'write'] as const).map(t => (
                  <button key={t} onClick={() => setForm(f => ({ ...f, db_type: t }))}
                    className="px-3 py-2.5 rounded-xl text-xs font-medium"
                    style={{ background: form.db_type === t ? '#6C3BFF' : 'var(--c-surface)', color: form.db_type === t ? '#fff' : 'var(--c-text-3)', border: `1px solid ${form.db_type === t ? '#6C3BFF' : 'var(--c-border)'}` }}>
                    {t === 'read' ? 'Solo lectura' : 'Escritura'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>
              ID de la base de datos en Notion
              <span className="ml-1" style={{ color: 'var(--c-text-4)' }}>(URL o ID directo)</span>
            </label>
            <input value={form.notion_db_id} onChange={e => setForm(f => ({ ...f, notion_db_id: e.target.value }))}
              placeholder="https://notion.so/... o 1a2b3c4d5e6f..."
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-mono"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--c-text-3)' }}>Descripción (opcional)</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="¿Para qué sirve esta base de datos?"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
          </div>

          {/* Required properties */}
          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Campos obligatorios</label>
            <div className="flex gap-2 mb-2">
              <input value={form.propNameInput} onChange={e => setForm(f => ({ ...f, propNameInput: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addProp()}
                placeholder="Nombre del campo"
                className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              <select value={form.propTypeInput} onChange={e => setForm(f => ({ ...f, propTypeInput: e.target.value }))}
                className="rounded-xl px-2 py-2 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}>
                {PROP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={addProp}
                className="px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
                +
              </button>
            </div>
            {form.required_props.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.required_props.map(p => (
                  <span key={p.name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
                    <span style={{ color: 'var(--c-text-4)' }}>{p.type}</span> {p.name}
                    <button onClick={() => removeProp(p.name)} style={{ color: 'var(--c-text-4)' }}><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Allowed values */}
          <div>
            <label className="block text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>
              Valores permitidos en campos Select
            </label>
            <div className="flex gap-2 mb-2">
              <input value={form.avPropInput} onChange={e => setForm(f => ({ ...f, avPropInput: e.target.value }))}
                placeholder="Nombre del campo"
                className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              <input value={form.avValInput} onChange={e => setForm(f => ({ ...f, avValInput: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addAllowedValue()}
                placeholder="Valor permitido"
                className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
                style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }} />
              <button onClick={addAllowedValue}
                className="px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.25)', color: '#9B6DFF' }}>
                +
              </button>
            </div>
            {Object.entries(form.allowed_values).map(([prop, vals]) => (
              <div key={prop} className="mb-2">
                <span className="text-xs font-medium mr-2" style={{ color: 'var(--c-text-3)' }}>{prop}:</span>
                {vals.map(v => (
                  <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs mr-1"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
                    {v}
                    <button onClick={() => removeAllowedValue(prop, v)} style={{ color: 'var(--c-text-4)' }}><X size={10} /></button>
                  </span>
                ))}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !form.db_name.trim() || !form.notion_db_id.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: '#6C3BFF', color: '#fff' }}>
              {saving ? <><Loader2 size={13} className="animate-spin" />Guardando…</> : 'Guardar schema'}
            </button>
            <button onClick={() => { setCreating(false); setForm(empty()); }}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Schemas list */}
      {schemas.length === 0 && !creating && (
        <div className="text-center py-10" style={{ color: 'var(--c-text-4)' }}>
          <Database size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin bases de datos configuradas.</p>
        </div>
      )}

      {schemas.map(s => {
        const isExpanded      = expandedId === s.id;
        const hasViolations   = s.last_violations?.length > 0;
        const isValidating    = validating === s.id;

        return (
          <div key={s.id} className="rounded-xl overflow-hidden"
            style={{ border: `1px solid ${hasViolations ? 'rgba(245,158,11,0.3)' : isExpanded ? 'rgba(108,59,255,0.3)' : 'var(--c-border)'}`, background: 'var(--c-surface-2)' }}>

            <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
              onClick={() => setExpanded(isExpanded ? null : s.id)}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Database size={14} style={{ color: hasViolations ? '#f59e0b' : '#6C3BFF', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--c-text)' }}>{s.db_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: s.db_type === 'write' ? 'rgba(108,59,255,0.1)' : 'rgba(255,255,255,0.05)', color: s.db_type === 'write' ? '#9B6DFF' : 'var(--c-text-4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {s.db_type === 'write' ? 'Escritura' : 'Lectura'}
                  </span>
                  {s.last_validated_at && (
                    hasViolations
                      ? <span className="text-xs flex items-center gap-1" style={{ color: '#f59e0b' }}><AlertTriangle size={10} />{s.last_violations.length} problema{s.last_violations.length !== 1 ? 's' : ''}</span>
                      : <span className="text-xs flex items-center gap-1" style={{ color: '#22c55e' }}><CheckCircle2 size={10} />Sin problemas</span>
                  )}
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); handleValidate(s.id, s.agent_id); }}
                disabled={isValidating}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 mr-1"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--c-border)', color: 'var(--c-text-4)' }}>
                <RefreshCw size={10} className={isValidating ? 'animate-spin' : ''} />
                {isValidating ? 'Validando…' : 'Validar'}
              </button>
              {isExpanded ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--c-border)' }}>

                {s.description && (
                  <p className="text-xs mt-3 mb-3" style={{ color: 'var(--c-text-3)' }}>{s.description}</p>
                )}

                <p className="text-xs mt-3 mb-1" style={{ color: 'var(--c-text-4)' }}>
                  ID: <span className="font-mono" style={{ color: 'var(--c-text-3)' }}>{s.notion_db_id}</span>
                </p>

                {s.required_props?.length > 0 && (
                  <div className="mt-2 mb-2">
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--c-text-4)' }}>Campos obligatorios:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {s.required_props.map(p => (
                        <span key={p.name} className="text-xs px-2 py-0.5 rounded-lg"
                          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}>
                          <span style={{ color: 'var(--c-text-4)' }}>{p.type}</span> {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {hasViolations && (
                  <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(245,158,11,0.2)' }}>
                    <div className="px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)' }}>
                      <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                        Entradas con problemas ({s.last_violations.length})
                      </p>
                    </div>
                    {s.last_violations.slice(0, 5).map(v => (
                      <div key={v.page_id} className="px-3 py-2.5" style={{ borderTop: '1px solid rgba(245,158,11,0.1)' }}>
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--c-text-2)' }}>{v.page_title}</p>
                        {v.issues.map((issue, i) => (
                          <p key={i} className="text-xs" style={{ color: 'var(--c-text-4)' }}>• {issue}</p>
                        ))}
                      </div>
                    ))}
                    {s.last_violations.length > 5 && (
                      <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(245,158,11,0.1)' }}>
                        <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>…y {s.last_violations.length - 5} más</p>
                      </div>
                    )}
                  </div>
                )}

                {s.last_validated_at && (
                  <p className="text-xs mt-3" style={{ color: 'var(--c-text-4)' }}>
                    Última validación: {new Date(s.last_validated_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}

                <button onClick={() => handleDelete(s.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mt-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                  <Trash2 size={11} />Eliminar schema
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
