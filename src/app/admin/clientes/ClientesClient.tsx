'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, ChevronDown, ExternalLink, Settings, KeyRound,
  Eye, EyeOff, Check, X, Plus, Users, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { PLAN_LABELS } from '@/types/agent';
import type { Plan } from '@/types/agent';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentRow = {
  id: string;
  business_name: string;
  plan: string;
  active: boolean;
  billing_status: string | null;
  minutes_used: number;
  minutes_included: number;
  portal_email: string | null;
  portal_token: string | null;
};

type ClientGroup = {
  key: string;
  client_name: string;
  client_email: string | null;
  portal_email: string | null;
  agents: AgentRow[];
};

type CredForm = {
  email: string;
  pw: string;
  confirm: string;
  showPw: boolean;
  saving: boolean;
  msg: { ok: boolean; text: string } | null;
};

interface Props {
  clients:       ClientGroup[];
  totalCount:    number;
  totalAgents:   number;
  totalActive:   number;
  page:          number;
  totalPages:    number;
  currentSearch: string;
}

const PLAN_COLORS: Record<string, string> = { comercial: '#3b82f6', pro: '#a855f7' };

// ── URL helper ────────────────────────────────────────────────────────────────

function buildUrl(search: string, page: number) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return '/admin/clientes' + (qs ? '?' + qs : '');
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ClientesClient({
  clients, totalCount, totalAgents, totalActive, page, totalPages, currentSearch,
}: Props) {
  const router  = useRouter();
  const [pending, startTransition] = useTransition();
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [credOpen,   setCredOpen]   = useState<Set<string>>(new Set());
  const [credForms,  setCredForms]  = useState<Record<string, CredForm>>({});

  useEffect(() => { setSearchInput(currentSearch); }, [currentSearch]);

  const navigate = (search: string, p: number) => {
    startTransition(() => router.push(buildUrl(search, p)));
  };

  const commitSearch = () => {
    if (searchInput !== currentSearch) navigate(searchInput, 1);
  };

  const clearSearch = () => {
    setSearchInput('');
    startTransition(() => router.push('/admin/clientes'));
  };

  const toggle = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const openCred = (agentId: string, currentEmail: string | null) => {
    setCredOpen(prev => { const n = new Set(prev); n.add(agentId); return n; });
    setCredForms(prev => ({
      ...prev,
      [agentId]: { email: currentEmail ?? '', pw: '', confirm: '', showPw: false, saving: false, msg: null },
    }));
  };

  const closeCred = (agentId: string) =>
    setCredOpen(prev => { const n = new Set(prev); n.delete(agentId); return n; });

  const updateForm = (agentId: string, patch: Partial<CredForm>) =>
    setCredForms(prev => ({ ...prev, [agentId]: { ...prev[agentId], ...patch } }));

  const saveCred = async (agentId: string) => {
    const form = credForms[agentId];
    if (!form?.email) return;
    if (form.pw && form.pw !== form.confirm) {
      updateForm(agentId, { msg: { ok: false, text: 'Las contraseñas no coinciden' } });
      return;
    }
    if (form.pw && form.pw.length < 8) {
      updateForm(agentId, { msg: { ok: false, text: 'Mínimo 8 caracteres' } });
      return;
    }
    updateForm(agentId, { saving: true, msg: null });
    const body: Record<string, string> = { email: form.email };
    if (form.pw) body.password = form.pw;
    const res = await fetch(`/api/admin/agentes/${agentId}/portal-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      closeCred(agentId);
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Error al guardar' }));
      updateForm(agentId, { saving: false, msg: { ok: false, text: error } });
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl" style={{ opacity: pending ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Clientes</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          {totalCount} cliente{totalCount !== 1 ? 's' : ''} · {totalAgents} agentes · {totalActive} activos
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--c-text-3)' }} />
          <input
            type="text"
            placeholder="Buscar por cliente, email o negocio… (Enter)"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitSearch()}
            onBlur={commitSearch}
            disabled={pending}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
          />
        </div>
        {currentSearch && (
          <button
            onClick={clearSearch}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs transition-colors hover:bg-[var(--c-surface-2)]"
            style={{ color: 'var(--c-text-3)', border: '1px solid var(--c-border)' }}
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Result count when searching */}
      {currentSearch && (
        <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
          {totalCount} resultado{totalCount !== 1 ? 's' : ''} para &ldquo;{currentSearch}&rdquo;
          {totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
      )}

      {/* Client list */}
      <div className="flex flex-col gap-3">
        {clients.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--c-text-3)' }}>
            <Users size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {currentSearch ? 'Sin resultados para esa búsqueda' : 'Sin clientes registrados'}
            </p>
          </div>
        ) : clients.map(client => {
          const open        = expanded.has(client.key);
          const activeCount = client.agents.filter(a => a.active).length;
          const pausedCount = client.agents.length - activeCount;
          const initials    = client.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

          return (
            <div key={client.key} className="rounded-xl overflow-hidden"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>

              {/* Client header row */}
              <button
                onClick={() => toggle(client.key)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--c-surface-2)]"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                  style={{ background: 'rgba(108,59,255,0.15)', color: '#9B6DFF' }}>
                  {initials}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm" style={{ color: 'var(--c-text)' }}>{client.client_name}</span>
                    <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-3)' }}>
                      <Users size={10} /> {client.agents.length} {client.agents.length === 1 ? 'agente' : 'agentes'}
                    </span>
                    {activeCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a' }}>
                        {activeCount} activo{activeCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {pausedCount > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
                        {pausedCount} pausado{pausedCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {client.client_email && (
                    <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--c-text-3)' }}>
                      {client.client_email}
                    </p>
                  )}
                </div>

                <ChevronDown size={15} className="flex-shrink-0 transition-transform"
                  style={{ color: 'var(--c-text-3)', transform: open ? 'rotate(180deg)' : undefined }} />
              </button>

              {/* Expanded: agents */}
              {open && (
                <div style={{ borderTop: '1px solid var(--c-divider)' }}>
                  {client.agents.map((agent, i) => {
                    const planColor  = PLAN_COLORS[agent.plan] ?? '#6b7280';
                    const pct        = agent.minutes_included > 0
                      ? Math.round((agent.minutes_used / agent.minutes_included) * 100) : 0;
                    const credIsOpen = credOpen.has(agent.id);
                    const form       = credForms[agent.id];

                    return (
                      <div key={agent.id}>
                        <div
                          className="flex items-center gap-3 px-5 py-3"
                          style={{ borderTop: i > 0 ? '1px solid var(--c-divider)' : undefined, background: 'var(--c-surface-2)' }}
                        >
                          <div className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: agent.active ? '#22c55e' : '#ef4444' }} />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>{agent.business_name}</span>
                              <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: `${planColor}18`, color: planColor, border: `1px solid ${planColor}30` }}>
                                {PLAN_LABELS[agent.plan as Plan] ?? agent.plan}
                              </span>
                              {agent.billing_status === 'pago_fallido' && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full"
                                  style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
                                  Pago fallido
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 max-w-[80px] h-1 rounded-full" style={{ background: 'var(--c-border)' }}>
                                <div className="h-1 rounded-full"
                                  style={{ width: `${Math.min(pct, 100)}%`, background: pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e' }} />
                              </div>
                              <span className="text-xs tabular-nums" style={{ color: 'var(--c-text-4)' }}>
                                {agent.minutes_used}/{agent.minutes_included} min
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {agent.portal_token && (
                              <Link href={`/portal/${agent.portal_token}`} target="_blank"
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text-2)' }}>
                                <ExternalLink size={11} /><span className="hidden sm:inline"> Portal</span>
                              </Link>
                            )}
                            <Link href={`/admin/agentes/${agent.id}/editar`}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                              style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}>
                              <Settings size={11} /><span className="hidden sm:inline"> Editar</span>
                            </Link>
                            <button
                              onClick={() => credIsOpen ? closeCred(agent.id) : openCred(agent.id, agent.portal_email)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                              style={{
                                background: credIsOpen ? 'rgba(245,158,11,0.12)' : 'var(--c-surface)',
                                color: credIsOpen ? '#f59e0b' : (agent.portal_email ? '#16a34a' : 'var(--c-text-3)'),
                                border: `1px solid ${credIsOpen ? 'rgba(245,158,11,0.25)' : 'var(--c-border)'}`,
                              }}>
                              <KeyRound size={11} />
                              <span className="hidden sm:inline"> {agent.portal_email ? 'Acceso' : 'Sin acceso'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Credentials form */}
                        {credIsOpen && form && (
                          <div className="px-5 py-4 flex flex-col gap-3"
                            style={{ background: 'rgba(245,158,11,0.04)', borderTop: '1px solid rgba(245,158,11,0.15)' }}>
                            <p className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
                              Acceso al portal —{' '}
                              <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>{agent.business_name}</span>
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Email de acceso</label>
                                <input type="email" value={form.email}
                                  onChange={e => updateForm(agent.id, { email: e.target.value })}
                                  placeholder="cliente@negocio.com"
                                  className="w-full text-sm outline-none rounded-lg px-3 py-2"
                                  style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>
                                  {agent.portal_email ? 'Nueva contraseña (vacío = sin cambio)' : 'Contraseña (mín. 8 caracteres)'}
                                </label>
                                <div className="relative">
                                  <input type={form.showPw ? 'text' : 'password'} value={form.pw}
                                    onChange={e => updateForm(agent.id, { pw: e.target.value })}
                                    placeholder="••••••••"
                                    className="w-full text-sm outline-none rounded-lg px-3 py-2 pr-9"
                                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
                                  />
                                  <button type="button" onClick={() => updateForm(agent.id, { showPw: !form.showPw })}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                    style={{ color: 'var(--c-text-4)' }}>
                                    {form.showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                                  </button>
                                </div>
                              </div>
                              {form.pw && (
                                <div className="sm:col-start-2">
                                  <label className="block text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>Confirmar contraseña</label>
                                  <input type={form.showPw ? 'text' : 'password'} value={form.confirm}
                                    onChange={e => updateForm(agent.id, { confirm: e.target.value })}
                                    placeholder="••••••••"
                                    className="w-full text-sm outline-none rounded-lg px-3 py-2"
                                    style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
                                  />
                                </div>
                              )}
                            </div>
                            {form.msg && (
                              <p className="text-xs" style={{ color: form.msg.ok ? '#16a34a' : '#dc2626' }}>{form.msg.text}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveCred(agent.id)} disabled={form.saving || !form.email}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-50"
                                style={{ background: '#6C3BFF', color: '#FAFBFF' }}>
                                <Check size={12} />
                                {form.saving ? 'Guardando…' : 'Guardar'}
                              </button>
                              <button onClick={() => closeCred(agent.id)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity hover:opacity-70"
                                style={{ color: 'var(--c-text-3)' }}>
                                <X size={12} /> Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Agregar empresa */}
                  <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid var(--c-divider)' }}>
                    <Link
                      href={`/admin/agentes/nuevo?client_name=${encodeURIComponent(client.client_name)}&client_email=${encodeURIComponent(client.client_email ?? '')}&portal_email=${encodeURIComponent(client.portal_email ?? '')}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)' }}
                    >
                      <Plus size={11} /> Agregar empresa
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <button
            onClick={() => navigate(currentSearch, page - 1)}
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
            onClick={() => navigate(currentSearch, page + 1)}
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
