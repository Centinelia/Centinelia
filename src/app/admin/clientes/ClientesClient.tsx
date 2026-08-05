'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, ChevronDown, ExternalLink, Settings, KeyRound,
  Eye, EyeOff, Check, X, Plus, Users,
} from 'lucide-react';
import MinutesAdjuster from '../agentes/[id]/MinutesAdjuster';
import DailyCapEditor from '../agentes/[id]/DailyCapEditor';
import { Pagination } from '@/components/admin/Pagination';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentRow = {
  id: string;
  agent_name: string | null;
  business_name: string;
  plan: string;
  active: boolean;
  billing_status: string | null;
  portal_email: string | null;
  portal_token: string | null;
  daily_minutes_cap: number | null;
};

type ClientGroup = {
  key: string;
  client_name: string;
  client_email: string | null;
  portal_email: string | null;
  agents: AgentRow[];
  acct_minutes_used: number | null;
  acct_minutes_included: number | null;
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

  const inputStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    color: '#111827',
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ opacity: pending ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Clientes</h1>
          <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
            {totalCount} cliente{totalCount !== 1 ? 's' : ''} · {totalAgents} empleado{totalAgents !== 1 ? 's' : ''} · {totalActive} activo{totalActive !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/admin/demo"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151' }}
          >
            Demo
          </Link>
          <Link
            href="/admin/demo-personalizado"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151' }}
          >
            Demo personalizado
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#9CA3AF' }}
          />
          <input
            type="text"
            placeholder="Buscar por cliente, email o negocio... (Enter)"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitSearch()}
            onBlur={commitSearch}
            disabled={pending}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-[13px] outline-none"
            style={inputStyle}
          />
        </div>
        {currentSearch && (
          <button
            onClick={clearSearch}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
            style={{ color: '#374151', border: '1px solid #E5E7EB', background: '#FFFFFF' }}
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Result count when searching */}
      {currentSearch && (
        <p className="text-[12px]" style={{ color: '#6B7280' }}>
          {totalCount} resultado{totalCount !== 1 ? 's' : ''} para &ldquo;{currentSearch}&rdquo;
          {totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
      )}

      {/* Client list */}
      <div className="flex flex-col gap-3">
        {clients.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl bg-white"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <Users size={36} className="mx-auto mb-3" style={{ color: '#D1D5DB' }} />
            <p className="text-[13px]" style={{ color: '#6B7280' }}>
              {currentSearch ? 'Sin resultados para esa búsqueda' : 'Sin clientes registrados'}
            </p>
          </div>
        ) : clients.map(client => {
          const open        = expanded.has(client.key);
          const activeCount = client.agents.filter(a => a.active).length;
          const pausedCount = client.agents.length - activeCount;
          const initials    = client.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

          const acctUsed     = client.acct_minutes_used;
          const acctIncluded = client.acct_minutes_included;
          const acctPct      = acctIncluded && acctIncluded > 0 ? Math.round((acctUsed! / acctIncluded) * 100) : 0;
          const acctBarColor = acctPct > 90 ? '#EF4444' : acctPct > 70 ? '#F59E0B' : '#10B981';

          return (
            <div
              key={client.key}
              className="rounded-xl overflow-hidden bg-white"
              style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
            >

              {/* Client header row */}
              <button
                onClick={() => toggle(client.key)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-semibold"
                  style={{ background: '#F5F0FF', color: '#6C3BFF' }}
                >
                  {initials}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold" style={{ color: '#111827' }}>{client.client_name}</span>
                    <span
                      className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-md font-medium"
                      style={{ background: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB' }}
                    >
                      <Users size={10} /> {client.agents.length} {client.agents.length === 1 ? 'empleado' : 'empleados'}
                    </span>
                    {activeCount > 0 && (
                      <span
                        className="text-[12px] px-2 py-0.5 rounded-md font-medium"
                        style={{ background: '#ECFDF5', color: '#10B981', border: '1px solid #A7F3D0' }}
                      >
                        {activeCount} activo{activeCount > 1 ? 's' : ''}
                      </span>
                    )}
                    {pausedCount > 0 && (
                      <span
                        className="text-[12px] px-2 py-0.5 rounded-md font-medium"
                        style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}
                      >
                        {pausedCount} pausado{pausedCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {client.client_email && (
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: '#6B7280' }}>
                      {client.client_email}
                    </p>
                  )}
                </div>

                {/* Account minutes mini-bar */}
                {acctIncluded != null && acctIncluded > 0 && (
                  <div className="hidden sm:flex flex-col items-end gap-1 mr-1 flex-shrink-0">
                    <span className="text-[12px] tabular-nums" style={{ color: '#6B7280' }}>
                      {acctUsed}/{acctIncluded} min
                    </span>
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(acctPct, 100)}%`, background: acctBarColor }}
                      />
                    </div>
                  </div>
                )}

                <ChevronDown
                  size={15}
                  className="flex-shrink-0 transition-transform"
                  style={{ color: '#9CA3AF', transform: open ? 'rotate(180deg)' : undefined }}
                />
              </button>

              {/* Expanded: agents */}
              {open && (
                <div style={{ borderTop: '1px solid #F3F4F6' }}>
                  {client.agents.map((agent, i) => {
                    const credIsOpen = credOpen.has(agent.id);
                    const form       = credForms[agent.id];

                    return (
                      <div key={agent.id}>
                        <div
                          className="flex items-center gap-3 px-5 py-3"
                          style={{
                            borderTop: i > 0 ? '1px solid #F3F4F6' : undefined,
                            background: '#F9FAFB',
                          }}
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: agent.active ? '#10B981' : '#EF4444' }}
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-medium" style={{ color: '#111827' }}>
                                {agent.agent_name?.trim() || agent.business_name}
                              </span>
                              {agent.agent_name?.trim() && (
                                <span className="text-[12px]" style={{ color: '#6B7280' }}>
                                  {agent.business_name}
                                </span>
                              )}
                              {agent.billing_status === 'pago_fallido' && (
                                <span
                                  className="text-[11px] px-1.5 py-0.5 rounded-md font-medium"
                                  style={{ background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA' }}
                                >
                                  Pago fallido
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {agent.portal_token && (
                              <Link
                                href={`/portal/${agent.portal_token}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50"
                                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151' }}
                              >
                                <ExternalLink size={11} /><span className="hidden sm:inline"> Portal</span>
                              </Link>
                            )}
                            <Link
                              href={`/admin/agentes/${agent.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-90"
                              style={{ background: '#6C3BFF', color: '#FFFFFF' }}
                            >
                              <Settings size={11} /><span className="hidden sm:inline"> Configurar</span>
                            </Link>
                            <button
                              onClick={() => credIsOpen ? closeCred(agent.id) : openCred(agent.id, agent.portal_email)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50"
                              style={{
                                background: credIsOpen ? '#FFFBEB' : '#FFFFFF',
                                color: credIsOpen ? '#F59E0B' : (agent.portal_email ? '#10B981' : '#6B7280'),
                                border: `1px solid ${credIsOpen ? '#FDE68A' : '#E5E7EB'}`,
                              }}
                            >
                              <KeyRound size={11} />
                              <span className="hidden sm:inline"> {agent.portal_email ? 'Acceso' : 'Sin acceso'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Credentials form */}
                        {credIsOpen && form && (
                          <div
                            className="px-5 py-4 flex flex-col gap-3"
                            style={{ background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}
                          >
                            <p className="text-[12px] font-semibold" style={{ color: '#374151' }}>
                              Acceso al portal.{' '}
                              <span style={{ color: '#6B7280', fontWeight: 400 }}>{agent.business_name}</span>
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div>
                                <label className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>Email de acceso</label>
                                <input
                                  type="email"
                                  value={form.email}
                                  onChange={e => updateForm(agent.id, { email: e.target.value })}
                                  placeholder="cliente@negocio.com"
                                  className="w-full text-[13px] outline-none rounded-lg px-3 py-2"
                                  style={inputStyle}
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>
                                  {agent.portal_email ? 'Nueva contraseña (vacío = sin cambio)' : 'Contraseña (mín. 8 caracteres)'}
                                </label>
                                <div className="relative">
                                  <input
                                    type={form.showPw ? 'text' : 'password'}
                                    value={form.pw}
                                    onChange={e => updateForm(agent.id, { pw: e.target.value })}
                                    placeholder="••••••••"
                                    className="w-full text-[13px] outline-none rounded-lg px-3 py-2 pr-9"
                                    style={inputStyle}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateForm(agent.id, { showPw: !form.showPw })}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                                    style={{ color: '#9CA3AF' }}
                                  >
                                    {form.showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                                  </button>
                                </div>
                              </div>
                              {form.pw && (
                                <div className="sm:col-start-2">
                                  <label className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9CA3AF' }}>Confirmar contraseña</label>
                                  <input
                                    type={form.showPw ? 'text' : 'password'}
                                    value={form.confirm}
                                    onChange={e => updateForm(agent.id, { confirm: e.target.value })}
                                    placeholder="••••••••"
                                    className="w-full text-[13px] outline-none rounded-lg px-3 py-2"
                                    style={inputStyle}
                                  />
                                </div>
                              )}
                            </div>
                            {form.msg && (
                              <p className="text-[12px]" style={{ color: form.msg.ok ? '#10B981' : '#EF4444' }}>{form.msg.text}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveCred(agent.id)}
                                disabled={form.saving || !form.email}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity disabled:opacity-50"
                                style={{ background: '#6C3BFF', color: '#FFFFFF' }}
                              >
                                <Check size={12} />
                                {form.saving ? 'Guardando...' : 'Guardar'}
                              </button>
                              <button
                                onClick={() => closeCred(agent.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-opacity hover:opacity-70"
                                style={{ color: '#6B7280' }}
                              >
                                <X size={12} /> Cancelar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Account minutes adjuster + daily cap */}
                  {client.agents[0] && (
                    <div className="px-5 py-5 flex flex-col gap-4" style={{ borderTop: '1px solid #F3F4F6' }}>
                      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
                        Pool de minutos de la cuenta
                      </p>
                      <MinutesAdjuster
                        agentId={client.agents[0].id}
                        minutesUsed={client.acct_minutes_used ?? 0}
                        minutesIncluded={client.acct_minutes_included ?? 0}
                        isAccountPool={client.acct_minutes_included != null}
                      />
                      <DailyCapEditor
                        agentId={client.agents[0].id}
                        initialCap={client.agents[0].daily_minutes_cap}
                        monthlyIncluded={client.acct_minutes_included ?? 0}
                      />
                    </div>
                  )}

                  {/* Agregar empresa */}
                  <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid #F3F4F6' }}>
                    <Link
                      href={`/admin/agentes/nuevo?client_name=${encodeURIComponent(client.client_name)}&client_email=${encodeURIComponent(client.client_email ?? '')}&portal_email=${encodeURIComponent(client.portal_email ?? '')}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50"
                      style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6C3BFF' }}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        disabled={pending}
        onNavigate={p => navigate(currentSearch, p)}
      />
    </div>
  );
}
