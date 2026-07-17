'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface Goal {
  id: string;
  title: string;
  metric: string;
  target: number;
  current: number;
  period: string;
  progress: number;
}

const METRIC_OPTIONS = [
  { value: 'leads',        label: 'Leads capturados',      group: 'Voz' },
  { value: 'appointments', label: 'Citas agendadas',       group: 'Voz' },
  { value: 'orders',       label: 'Pedidos tomados',       group: 'Voz' },
  { value: 'calls',        label: 'Llamadas atendidas',    group: 'Voz' },
  { value: 'documentos',   label: 'Documentos generados',  group: 'Oficina' },
  { value: 'tareas',       label: 'Tareas completadas',    group: 'Oficina' },
  { value: 'correos',      label: 'Correos procesados',    group: 'Oficina' },
  { value: 'custom',       label: 'Meta personalizada',    group: 'Otro' },
];

const PERIOD_OPTIONS = [
  { value: 'month', label: 'Este mes' },
  { value: 'week',  label: 'Esta semana' },
];

const EMPTY_FORM = { title: '', metric: 'leads', target: '', period: 'month' };

export default function GoalsSection({
  token,
  roleColor,
}: {
  token: string;
  roleColor: string;
}) {
  const [goals, setGoals]   = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState(EMPTY_FORM);

  useEffect(() => {
    fetch(`/api/portal/${token}/goals`)
      .then(r => r.json())
      .then(d => setGoals(d.goals ?? []))
      .finally(() => setLoading(false));
  }, [token]);

  async function addGoal() {
    if (!form.title.trim() || !form.target) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${token}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target: Number(form.target) }),
      });
      const data = await res.json();
      if (data.goal) {
        setGoals(prev => [...prev, { ...data.goal, progress: 0 }]);
        setForm(EMPTY_FORM);
        setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteGoal(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id));
    await fetch(`/api/portal/${token}/goals/${id}`, { method: 'DELETE' });
  }

  async function updateCustomProgress(id: string, current: number) {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, progress: current } : g));
    await fetch(`/api/portal/${token}/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current }),
    });
  }

  const metricLabel = (m: string) => METRIC_OPTIONS.find(o => o.value === m)?.label ?? m;
  const periodLabel = (p: string) => p === 'month' ? 'este mes' : 'esta semana';

  const inputStyle: React.CSSProperties = {
    background: 'var(--c-surface)',
    border: '1px solid var(--c-border)',
    color: 'var(--c-text)',
    borderRadius: 8,
    fontSize: 13,
    padding: '7px 10px',
    width: '100%',
    outline: 'none',
  };

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando metas...</p>
      )}

      {!loading && goals.length === 0 && !adding && (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          Sin metas activas. Agrega una para que el empleado sepa hacia qué trabajar.
        </p>
      )}

      {goals.map(goal => {
        const pct  = Math.min(100, Math.round((goal.progress / goal.target) * 100));
        const done = goal.progress >= goal.target;
        return (
          <div
            key={goal.id}
            className="flex flex-col gap-2 p-3 rounded-xl"
            style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--c-text)' }}>
                  {goal.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
                  {metricLabel(goal.metric)} · {periodLabel(goal.period)}
                </p>
              </div>
              <button
                onClick={() => deleteGoal(goal.id)}
                className="shrink-0 p-1 rounded-lg transition-opacity hover:opacity-60"
                style={{ color: 'var(--c-text-3)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="flex-1 h-1.5 rounded-full overflow-hidden"
                style={{ background: 'var(--c-border)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: done ? '#22c55e' : roleColor }}
                />
              </div>
              <span
                className="text-xs tabular-nums shrink-0"
                style={{ color: done ? '#22c55e' : 'var(--c-text-2)' }}
              >
                {goal.progress}/{goal.target}
              </span>
            </div>

            {goal.metric === 'custom' && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                  Progreso actual:
                </span>
                <input
                  type="number"
                  min={0}
                  defaultValue={goal.current}
                  onBlur={e => updateCustomProgress(goal.id, Number(e.target.value))}
                  style={{ ...inputStyle, width: 64, padding: '4px 8px' }}
                />
              </div>
            )}
          </div>
        );
      })}

      {adding && (
        <div
          className="flex flex-col gap-2.5 p-3 rounded-xl"
          style={{ background: 'var(--c-surface-2)', border: `1px solid ${roleColor}50` }}
        >
          <input
            autoFocus
            placeholder="Ej: Capturar 20 leads este mes"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            style={inputStyle}
          />
          <div className="flex gap-2">
            <select
              value={form.metric}
              onChange={e => setForm(f => ({ ...f, metric: e.target.value }))}
              style={{ ...inputStyle, width: undefined, flex: 1 }}
            >
              {METRIC_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={form.period}
              onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
              style={{ ...inputStyle, width: undefined, flex: 1 }}
            >
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <input
            type="number"
            min={1}
            placeholder="Objetivo (número)"
            value={form.target}
            onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
            style={inputStyle}
          />
          <div className="flex gap-2">
            <button
              onClick={addGoal}
              disabled={saving || !form.title.trim() || !form.target}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: roleColor, color: '#fff' }}
            >
              {saving ? 'Guardando...' : 'Agregar meta'}
            </button>
            <button
              onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}
              className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-70"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70 w-fit"
          style={{ color: roleColor }}
        >
          <Plus size={14} />
          Agregar meta
        </button>
      )}
    </div>
  );
}
