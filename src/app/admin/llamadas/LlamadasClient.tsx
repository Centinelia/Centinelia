'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Mic, FileText, ExternalLink, Copy, Check, Phone,
} from 'lucide-react';
import type { VoiceCall } from '@/types/agent';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent  { id: string; business_name: string; timezone: string }
interface Filters { agentId: string; outcome: string; search: string }

interface Props {
  calls:          VoiceCall[];
  agents:         Agent[];
  totalCount:     number;
  page:           number;
  totalPages:     number;
  currentFilters: Filters;
}

// ── Outcome config ────────────────────────────────────────────────────────────

const OUTCOMES: { value: string; label: string; color?: string }[] = [
  { value: '',                     label: 'Todos' },
  { value: 'lead_created',         label: 'Lead',         color: '#22c55e' },
  { value: 'appointment_booked',   label: 'Cita',         color: '#3b82f6' },
  { value: 'order_taken',          label: 'Pedido',       color: '#f59e0b' },
  { value: 'transferred',          label: 'Transferido',  color: '#a855f7' },
  { value: 'info_provided',        label: 'Información',  color: '#6b7280' },
  { value: 'escalated_whatsapp',   label: 'WhatsApp',     color: '#25D366' },
  { value: 'other',                label: 'Otro',         color: '#4b5563' },
];

const OUTCOME_MAP = Object.fromEntries(OUTCOMES.map(o => [o.value, o]));

// ── Navigation helper ─────────────────────────────────────────────────────────

function buildUrl(filters: Filters, page: number) {
  const params = new URLSearchParams();
  if (filters.agentId) params.set('agentId', filters.agentId);
  if (filters.outcome) params.set('outcome', filters.outcome);
  if (filters.search)  params.set('search',  filters.search);
  if (page > 1)        params.set('page',    String(page));
  const qs = params.toString();
  return '/admin/llamadas' + (qs ? '?' + qs : '');
}

// ── Agent combobox ────────────────────────────────────────────────────────────

function AgentCombobox({
  agents, selectedId, onSelect, pending,
}: { agents: Agent[]; selectedId: string; onSelect: (id: string) => void; pending: boolean }) {
  const [query, setQuery]   = useState('');
  const [open,  setOpen]    = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const selectedAgent = agents.find(a => a.id === selectedId);

  const filtered = agents
    .filter(a => !query || a.business_name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (selectedAgent) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm min-w-0"
        style={{ background: 'rgba(108,59,255,0.1)', border: '1px solid rgba(108,59,255,0.3)' }}>
        <span className="flex-1 truncate font-medium" style={{ color: '#9B6DFF' }}>
          {selectedAgent.business_name}
        </span>
        <button
          onClick={() => onSelect('')}
          title="Quitar filtro"
          className="flex-shrink-0 rounded transition-opacity hover:opacity-70"
          style={{ color: '#9B6DFF' }}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-3)' }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Filtrar por agente…"
          disabled={pending}
          className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
        />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1.5 left-0 right-0 rounded-xl shadow-xl overflow-hidden"
          style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border-2)', minWidth: '200px' }}>
          {filtered.map(a => (
            <button
              key={a.id}
              onClick={() => { onSelect(a.id); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-[var(--c-surface-2)]"
              style={{ color: 'var(--c-text)' }}
            >
              {a.business_name}
            </button>
          ))}
        </div>
      )}

      {open && filtered.length === 0 && query && (
        <div className="absolute z-50 top-full mt-1.5 left-0 right-0 rounded-xl shadow-xl px-3 py-3 text-xs"
          style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border-2)', color: 'var(--c-text-3)' }}>
          Sin resultados para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}

// ── Outcome badge ─────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOME_MAP[outcome] ?? OUTCOME_MAP.other;
  const c = o?.color ?? '#4b5563';
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0"
      style={{ background: `${c}22`, color: c }}>
      {o?.label ?? 'Otro'}
    </span>
  );
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, title }: { text: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      title={title ?? 'Copiar'}
      className="p-1 rounded transition-colors hover:bg-[var(--c-surface-2)]"
      style={{ color: copied ? '#22c55e' : 'var(--c-text-3)' }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ── Flat call row ─────────────────────────────────────────────────────────────

function FlatCallRow({ call, agentName, timezone }: { call: VoiceCall; agentName: string; timezone: string }) {
  const [open, setOpen] = useState(false);
  const hasDetails = call.summary || call.transcript || call.recording_url;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      {/* Row header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 ${hasDetails ? 'cursor-pointer select-none' : ''}`}
        onClick={() => hasDetails && setOpen(o => !o)}
      >
        {/* Caller + agent */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate" style={{ color: 'var(--c-text)' }}>
            {call.caller_number || 'Desconocido'}
          </div>
          <div className="text-xs truncate mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {agentName}
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {call.recording_url && <span title="Tiene grabación"><Mic size={12} style={{ color: '#a855f7' }} /></span>}
          {call.transcript    && <span title="Tiene transcripción"><FileText size={12} style={{ color: '#3b82f6' }} /></span>}
          <OutcomeBadge outcome={call.outcome} />
          <span className="text-xs tabular-nums hidden sm:block" style={{ color: 'var(--c-text-2)' }}>
            {Math.ceil(call.duration_seconds / 60)} min
          </span>
          <span className="text-xs hidden md:block" style={{ color: 'var(--c-text-4)' }}>
            {new Date(call.created_at).toLocaleString('es-MX', {
              timeZone: timezone,
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
          {hasDetails && (
            open
              ? <ChevronUp  size={13} style={{ color: 'var(--c-text-3)' }} />
              : <ChevronDown size={13} style={{ color: 'var(--c-text-3)' }} />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {open && hasDetails && (
        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: '1px solid var(--c-divider)' }}>
          {call.summary && (
            <div className="pt-3">
              <div className="text-xs font-semibold mb-1.5 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Resumen</div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{call.summary}</p>
            </div>
          )}

          {call.recording_url && (
            <div>
              <div className="text-xs font-semibold mb-1.5 tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Grabación</div>
              <div className="flex items-center gap-2">
                <audio controls src={call.recording_url} className="w-full h-8" style={{ accentColor: '#a855f7' }} />
                <a href={call.recording_url} target="_blank" rel="noopener noreferrer"
                  title="Abrir en nueva pestaña"
                  className="flex-shrink-0 p-1.5 rounded hover:bg-[var(--c-surface-2)] transition-colors"
                  style={{ color: 'var(--c-text-2)' }}>
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          )}

          {call.transcript && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--c-text-3)' }}>Transcripción</div>
                <CopyButton text={call.transcript} title="Copiar transcripción" />
              </div>
              <div className="text-xs leading-relaxed rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap"
                style={{ background: 'var(--c-code-bg)', color: 'var(--c-text-2)', fontFamily: 'monospace' }}>
                {call.transcript}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LlamadasClient({
  calls, agents, totalCount, page, totalPages, currentFilters,
}: Props) {
  const router               = useRouter();
  const [pending, startTransition] = useTransition();

  // Phone search: local state, navigate on Enter or blur
  const [phoneInput, setPhoneInput] = useState(currentFilters.search);

  // Keep phoneInput in sync if server re-renders with different value
  useEffect(() => { setPhoneInput(currentFilters.search); }, [currentFilters.search]);

  const agentMap = Object.fromEntries(agents.map(a => [a.id, a]));

  const navigate = (overrides: Partial<Filters & { page: number }>) => {
    startTransition(() => {
      const filters = { ...currentFilters, ...overrides };
      const p       = 'page' in overrides ? overrides.page! : 1;
      router.push(buildUrl(filters, p));
    });
  };

  const commitSearch = () => {
    if (phoneInput !== currentFilters.search) navigate({ search: phoneInput });
  };

  const hasFilters = currentFilters.agentId || currentFilters.outcome || currentFilters.search;

  const clearAll = () => {
    setPhoneInput('');
    startTransition(() => router.push('/admin/llamadas'));
  };

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-3 mb-5">

        {/* Row 1: phone search + agent combobox */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Phone number search */}
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-3)' }} />
            <input
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && commitSearch()}
              onBlur={commitSearch}
              placeholder="Buscar por número… (Enter)"
              className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
            />
          </div>

          {/* Agent combobox */}
          <div className="sm:w-56 sm:flex-shrink-0">
            <AgentCombobox
              agents={agents}
              selectedId={currentFilters.agentId}
              onSelect={id => navigate({ agentId: id })}
              pending={pending}
            />
          </div>
        </div>

        {/* Row 2: outcome pills + clear */}
        <div className="flex items-center gap-2 flex-wrap">
          {OUTCOMES.map(o => {
            const active = currentFilters.outcome === o.value;
            const c      = o.color ?? '#6C3BFF';
            return (
              <button
                key={o.value}
                onClick={() => navigate({ outcome: o.value })}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap"
                style={{
                  background: active ? `${c}18` : 'var(--c-surface)',
                  color:      active ? c         : 'var(--c-text-3)',
                  border:     `1px solid ${active ? `${c}40` : 'var(--c-border)'}`,
                }}
              >
                {o.label}
              </button>
            );
          })}

          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 ml-auto text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-[var(--c-surface-2)]"
              style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
            >
              <X size={11} /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Result count */}
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
          {hasFilters
            ? `${totalCount.toLocaleString('es-MX')} resultado${totalCount !== 1 ? 's' : ''}`
            : `${totalCount.toLocaleString('es-MX')} llamada${totalCount !== 1 ? 's' : ''} en total`}
          {totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
      </div>

      {/* ── Call list ── */}
      {calls.length === 0 ? (
        <div className="p-12 rounded-xl text-center" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <Phone size={28} className="mx-auto mb-3 opacity-20" style={{ color: 'var(--c-text-3)' }} />
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
            {hasFilters ? 'Sin resultados para los filtros aplicados' : 'Sin llamadas registradas aún'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {calls.map(call => {
            const agent = agentMap[call.agent_id];
            return (
              <FlatCallRow
                key={call.id}
                call={call}
                agentName={agent?.business_name ?? '—'}
                timezone={agent?.timezone ?? 'America/Monterrey'}
              />
            );
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <button
            onClick={() => navigate({ page: page - 1 })}
            disabled={page <= 1 || pending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            <ChevronLeft size={13} /> Anterior
          </button>

          <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-3)' }}>
            {page} / {totalPages}
          </span>

          <button
            onClick={() => navigate({ page: page + 1 })}
            disabled={page >= totalPages || pending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30"
            style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
          >
            Siguiente <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
