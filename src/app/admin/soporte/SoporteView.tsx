'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, Bot, CheckCircle2, ExternalLink, GitBranch, Pause, Play, Plus, RefreshCw, User } from 'lucide-react';

type Group    = 'open' | 'claude_code' | 'resolved';
type Priority = 'low' | 'med' | 'high' | 'critical';
type Source   = 'bug_report' | 'error_log' | 'escalated_inbox' | 'failed_handoff' | 'agent_task' | 'nash_self_discovery' | 'manual';

interface Incident {
  id:                     string;
  created_at:             string;
  updated_at:             string;
  title:                  string;
  description:            string;
  priority:               Priority;
  status:                 string;
  source:                 Source;
  source_id:              string | null;
  affected_agent_id:      string | null;
  affected_portal_email:  string | null;
  assigned_to:            'nash' | 'owner' | 'claude_code';
  github_issue_url:       string | null;
  resolution:             string | null;
  meta:                   Record<string, unknown> | null;
}

const GROUP_LABELS: Record<Group, string> = {
  open:        'Abiertos',
  claude_code: 'En Claude Code',
  resolved:    'Resueltos',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  low:      'Baja',
  med:      'Media',
  high:     'Alta',
  critical: 'Crítica',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low:      '#64748b',
  med:      '#3b82f6',
  high:     '#f59e0b',
  critical: '#ef4444',
};

const SOURCE_LABEL: Record<Source, string> = {
  bug_report:          'Reporte de cliente',
  error_log:           'Error en logs',
  escalated_inbox:     'Bandeja escalada',
  failed_handoff:      'Handoff fallido',
  agent_task:          'Tarea fallida',
  nash_self_discovery: 'Nash detectó',
  manual:              'Creado manual',
};

const SOURCE_ICON: Record<Source, typeof Bot> = {
  bug_report:          User,
  error_log:           AlertOctagon,
  escalated_inbox:     User,
  failed_handoff:      AlertOctagon,
  agent_task:          Bot,
  nash_self_discovery: Bot,
  manual:              User,
};

const NASH_COLOR = '#0891B2';

export function SoporteView() {
  const [group,   setGroup]   = useState<Group>('open');
  const [items,   setItems]   = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [nashEnabled, setNashEnabled] = useState<boolean | null>(null);
  const [togglingNash, setTogglingNash] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/platform-incidents?group=${group}`, { cache: 'no-store' });
      const d = await r.json();
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [group]);

  const loadNashStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/nash-toggle', { cache: 'no-store' });
      const d = await r.json();
      if (typeof d.enabled === 'boolean') setNashEnabled(d.enabled);
    } catch {
      // silencioso: si falla, el toggle queda en null y muestra "..."
    }
  }, []);

  const toggleNash = useCallback(async () => {
    if (nashEnabled === null || togglingNash) return;
    const next = !nashEnabled;
    const confirmMsg = next
      ? 'Encender Nash: el cron correrá cada 10 minutos y consumirá tokens de Sonnet.'
      : 'Apagar Nash: dejará de procesar incidentes hasta que lo enciendas de nuevo.';
    if (!window.confirm(confirmMsg)) return;
    setTogglingNash(true);
    try {
      const r = await fetch('/api/admin/nash-toggle', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ enabled: next }),
      });
      const d = await r.json();
      if (typeof d.enabled === 'boolean') setNashEnabled(d.enabled);
    } finally {
      setTogglingNash(false);
    }
  }, [nashEnabled, togglingNash]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadNashStatus(); }, [loadNashStatus]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--c-surface-2)' }}>
          {(Object.keys(GROUP_LABELS) as Group[]).map(g => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: group === g ? NASH_COLOR : 'transparent',
                color:      group === g ? '#fff' : 'var(--c-text-3)',
              }}
            >
              {GROUP_LABELS[g]}
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={toggleNash}
            disabled={nashEnabled === null || togglingNash}
            title={nashEnabled ? 'Pausar el cron de Nash' : 'Reanudar el cron de Nash'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{
              background: nashEnabled ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.15)',
              color:      nashEnabled ? '#22c55e' : 'var(--c-text-3)',
              border:     `1px solid ${nashEnabled ? 'rgba(34,197,94,0.30)' : 'var(--c-border)'}`,
            }}
          >
            {nashEnabled === null ? (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-text-4)' }} />
                Cargando…
              </>
            ) : nashEnabled ? (
              <>
                <Pause size={12} /> Nash activo — pausar
              </>
            ) : (
              <>
                <Play size={12} /> Nash pausado — reanudar
              </>
            )}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
          >
            <RefreshCw size={12} /> Refrescar
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: NASH_COLOR, color: '#fff' }}
          >
            <Plus size={12} /> Crear incidente
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
          {group === 'open'
            ? 'No hay incidentes abiertos. Nash está al día.'
            : group === 'claude_code'
              ? 'Ningún incidente está en Claude Code ahora mismo.'
              : 'Aún no hay incidentes resueltos.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => <IncidentCard key={item.id} item={item} onChange={load} />)}
        </div>
      )}

      {showNew && <NewIncidentModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function IncidentCard({ item, onChange }: { item: Incident; onChange: () => void }) {
  const SIcon = SOURCE_ICON[item.source];
  const pColor = PRIORITY_COLOR[item.priority];
  const [busy, setBusy] = useState(false);

  const patch = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch('/api/admin/platform-incidents', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: item.id, ...patch }),
      });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}30` }}
            >
              {PRIORITY_LABEL[item.priority]}
            </span>
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
            >
              <SIcon size={11} /> {SOURCE_LABEL[item.source]}
            </span>
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${NASH_COLOR}15`, color: NASH_COLOR, border: `1px solid ${NASH_COLOR}30` }}
            >
              → {item.assigned_to === 'nash' ? 'Nash' : item.assigned_to === 'claude_code' ? 'Claude Code' : 'Owner'}
            </span>
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>{item.status}</span>
          </div>

          <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{item.title}</p>
          <p className="text-xs mt-1 whitespace-pre-wrap" style={{ color: 'var(--c-text-3)' }}>{item.description}</p>

          <div className="text-xs mt-3 flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--c-text-4)' }}>
            <span>Creado: {new Date(item.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            {item.affected_portal_email && <span>Afecta: {item.affected_portal_email}</span>}
            {item.github_issue_url && (
              <a href={item.github_issue_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: NASH_COLOR }}>
                <GitBranch size={11} /> issue <ExternalLink size={10} />
              </a>
            )}
          </div>

          {item.resolution && (
            <div className="mt-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#22c55e' }}>Resolución</p>
              <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--c-text-2)' }}>{item.resolution}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {item.status !== 'resolved' && item.status !== 'closed' && (
            <button
              onClick={() => patch({ status: 'resolved', resolution: item.resolution ?? 'Cerrado manualmente por owner.' })}
              disabled={busy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              <CheckCircle2 size={11} /> Marcar resuelto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NewIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle]         = useState('');
  const [desc, setDesc]           = useState('');
  const [priority, setPriority]   = useState<Priority>('med');
  const [email, setEmail]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/platform-incidents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title,
          description:           desc,
          priority,
          source:                'manual',
          affected_portal_email: email || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'error');
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--c-text)' }}>Crear incidente para Nash</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
          Usa esto para pedirle a Nash que investigue algo. Nash tomará el incidente en la próxima corrida y decidirá si escalar a Claude Code o resolverlo él mismo.
        </p>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Título</span>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              placeholder="Ej: bandeja de studio@pneuma no procesa correos desde ayer"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Descripción</span>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              rows={4}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              placeholder="Contexto, evidencia, links a logs, pasos para reproducir, etc."
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Prioridad</span>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
              >
                <option value="low">Baja</option>
                <option value="med">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Portal afectado (opcional)</span>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                placeholder="cliente@dominio.com"
              />
            </label>
          </div>
        </div>

        {err && (
          <p className="mt-3 text-xs" style={{ color: '#ef4444' }}>{err}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim() || !desc.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
            style={{ background: NASH_COLOR, color: '#fff' }}
          >
            {saving ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}
