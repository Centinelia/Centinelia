'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Search, ChevronDown, Settings, KeyRound,
  Eye, EyeOff, Check, X, Plus, Users, Pencil, Bot, AlertTriangle, BarChart3, UserCheck, Building2,
} from 'lucide-react';
import MinutesAdjuster from '../agentes/[id]/MinutesAdjuster';
import TasksAdjuster from '../agentes/[id]/TasksAdjuster';
import DailyCapEditor from '../agentes/[id]/DailyCapEditor';
import { Pagination } from '@/components/admin/Pagination';
import { MEERKAT_MAP, type MeerkatRoleId } from '@/lib/portal/meerkat-roles';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentRow = {
  id: string;
  agent_name: string | null;
  business_name: string;
  meerkat_role_id: string | null;
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
  business_name: string | null;
  serial: string | null;
  agents: AgentRow[];
  acct_minutes_used: number | null;
  acct_minutes_included: number | null;
  acct_ops_used: number;
  acct_ops_limit: number;
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

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  // clientKey = client.key (portal_email o fallback). Un cliente = un login compartido.
  const openCred = (clientKey: string, currentEmail: string | null) => {
    setCredOpen(prev => { const n = new Set(prev); n.add(clientKey); return n; });
    setCredForms(prev => ({
      ...prev,
      [clientKey]: { email: currentEmail ?? '', pw: '', confirm: '', showPw: false, saving: false, msg: null },
    }));
  };

  const closeCred = (clientKey: string) =>
    setCredOpen(prev => { const n = new Set(prev); n.delete(clientKey); return n; });

  const updateForm = (clientKey: string, patch: Partial<CredForm>) =>
    setCredForms(prev => ({ ...prev, [clientKey]: { ...prev[clientKey], ...patch } }));

  const saveCred = async (clientKey: string, currentPortalEmail: string | null, fallbackAgentId: string) => {
    const form = credForms[clientKey];
    if (!form?.email) return;
    if (form.pw && form.pw !== form.confirm) {
      updateForm(clientKey, { msg: { ok: false, text: 'Las contraseñas no coinciden' } });
      return;
    }
    if (form.pw && form.pw.length < 8) {
      updateForm(clientKey, { msg: { ok: false, text: 'Mínimo 8 caracteres' } });
      return;
    }
    updateForm(clientKey, { saving: true, msg: null });

    // Si ya hay portal_email → bulk update sobre todos los empleados del pool.
    // Si no (onboarding), ruta legacy per-agent: deja el email en primer empleado.
    const useBulk = !!currentPortalEmail;
    const url  = useBulk ? '/api/admin/portal-credentials' : `/api/admin/agentes/${fallbackAgentId}/portal-credentials`;
    const body = useBulk
      ? { current_portal_email: currentPortalEmail, new_email: form.email, ...(form.pw ? { password: form.pw } : {}) }
      : { email: form.email, ...(form.pw ? { password: form.pw } : {}) };

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (res.ok) {
      closeCred(clientKey);
      router.refresh();
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Error al guardar' }));
      updateForm(clientKey, { saving: false, msg: { ok: false, text: error } });
    }
  };

  const inputStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E8E3F5',
    color: '#1A0A3B',
    height: 40,
    borderRadius: 12,
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ opacity: pending ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Cartera</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>
          Clientes
        </h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Cada cliente puede tener varios empleados. Expande el card para gestionar credenciales del portal, ajustar cupos de minutos y tareas, o entrar al detalle de cada empleado.
        </p>
      </div>

      {/* Stats */}
      {!currentSearch && clients.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ClientesStatCard label="Clientes totales" value={totalCount.toLocaleString('es-MX')} accent="#6C3BFF" icon={<Building2 size={16} />} />
          <ClientesStatCard label="Empleados totales" value={totalAgents.toLocaleString('es-MX')} accent="#9B6DFF" icon={<Users size={16} />} />
          <ClientesStatCard label="Empleados activos" value={totalActive.toLocaleString('es-MX')} accent="#22C55E" icon={<UserCheck size={16} />} hint={`${totalAgents - totalActive} pausados`} />
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#9B8FB5' }}
          />
          <input
            type="text"
            placeholder="Buscar por cliente, email o negocio…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitSearch()}
            onBlur={commitSearch}
            disabled={pending}
            className="w-full pl-10 pr-4 text-[13px] outline-none transition-shadow"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = '#6C3BFF'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,59,255,0.08)'; }}
            onBlurCapture={e => { e.currentTarget.style.borderColor = '#E8E3F5'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>
        {currentSearch && (
          <button
            onClick={clearSearch}
            className="inline-flex items-center gap-1.5 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ padding: '9px 14px', color: '#6B6480', border: '1px solid #E8E3F5', background: '#FFFFFF' }}
          >
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Result count when searching */}
      {currentSearch && (
        <p className="text-[12px]" style={{ color: '#6B6480' }}>
          {totalCount} resultado{totalCount !== 1 ? 's' : ''} para &ldquo;{currentSearch}&rdquo;
          {totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
      )}

      {/* Client list */}
      <div className="flex flex-col gap-3">
        {clients.length === 0 ? (
          <div
            className="text-center py-16 rounded-xl bg-white"
            style={{ border: '1px solid #E8E3F5', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <Users size={36} className="mx-auto mb-3" style={{ color: '#B9B0CF' }} />
            <p className="text-[13px]" style={{ color: '#6B6480' }}>
              {currentSearch ? 'Sin resultados para esa búsqueda' : 'Sin clientes registrados'}
            </p>
          </div>
        ) : clients.map(client => {
          const open        = expanded.has(client.key);
          const activeCount = client.agents.filter(a => a.active).length;
          const pausedCount = client.agents.length - activeCount;
          const failedCount = client.agents.filter(a => a.billing_status === 'pago_fallido').length;
          const initials    = client.client_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

          const acctUsed     = client.acct_minutes_used;
          const acctIncluded = client.acct_minutes_included;
          const acctPct      = acctIncluded && acctIncluded > 0 ? Math.round((acctUsed! / acctIncluded) * 100) : 0;
          const acctBarColor = acctPct > 90 ? '#EF4444' : acctPct > 70 ? '#F59E0B' : '#10B981';

          return (
            <div
              key={client.key}
              className="rounded-xl overflow-hidden bg-white"
              style={{ border: '1px solid #E8E3F5', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
            >

              {/* Client header row */}
              <div
                onClick={() => toggle(client.key)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 cursor-pointer select-none"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-semibold"
                  style={{ background: '#F5F0FF', color: '#6C3BFF' }}
                >
                  {initials}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  {/* Línea 1: nombre del contacto + serial + alerta pago fallido */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-semibold" style={{ color: '#1A0A3B' }}>
                      {client.client_name}
                    </span>
                    {client.serial && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
                        style={{ background: '#F3F0FF', color: '#6C3BFF', border: '1px solid #E9E1FF', letterSpacing: '0.06em' }}
                        title="Número de serie de la cuenta"
                      >
                        {client.serial}
                      </span>
                    )}
                    {failedCount > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-semibold"
                        style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}
                        title={`${failedCount} empleado${failedCount > 1 ? 's' : ''} con pago fallido`}
                      >
                        <AlertTriangle size={10} />
                        {failedCount} pago fallido
                      </span>
                    )}
                  </div>
                  {/* Línea 2: empresa + counts consolidados */}
                  <div className="flex items-center gap-1.5 mt-0.5 text-[12px] flex-wrap" style={{ color: '#6B6480' }}>
                    {client.business_name && (
                      <>
                        <span className="font-medium truncate" style={{ color: '#4A3B6B' }}>
                          {client.business_name}
                        </span>
                        <span style={{ color: '#B9B0CF' }}>·</span>
                      </>
                    )}
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Users size={11} /> {client.agents.length}
                    </span>
                    {activeCount > 0 && (
                      <>
                        <span style={{ color: '#B9B0CF' }}>·</span>
                        <span className="tabular-nums" style={{ color: '#10B981' }}>
                          {activeCount} activo{activeCount > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                    {failedCount > 0 && (
                      <>
                        <span style={{ color: '#B9B0CF' }}>·</span>
                        <span className="tabular-nums" style={{ color: '#B91C1C' }}>
                          {failedCount} pago fallido
                        </span>
                      </>
                    )}
                    {pausedCount > 0 && (
                      <>
                        <span style={{ color: '#B9B0CF' }}>·</span>
                        <span className="tabular-nums" style={{ color: '#6B6480' }}>
                          {pausedCount} pausado{pausedCount > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Account minutes mini-bar */}
                {acctIncluded != null && acctIncluded > 0 && (
                  <div className="hidden sm:flex flex-col items-end gap-1 mr-1 flex-shrink-0">
                    <span className="text-[12px] tabular-nums" style={{ color: '#6B6480' }}>
                      {acctUsed}/{acctIncluded} min
                    </span>
                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: '#F5F0FF' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(acctPct, 100)}%`, background: acctBarColor }}
                      />
                    </div>
                  </div>
                )}

                {/* Editar cliente (nivel cliente) */}
                <Link
                  href={`/admin/clientes/${encodeURIComponent(client.key)}/editar`}
                  onClick={e => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50 flex-shrink-0"
                  style={{ background: '#FFFFFF', color: '#4A3B6B', border: '1px solid #E8E3F5' }}
                  title="Editar datos del cliente"
                >
                  <Pencil size={11} />
                  <span className="hidden sm:inline"> Editar</span>
                </Link>

                {/* Consumo detallado (fix N1 audit — vista audit-ready) */}
                {client.portal_email && (
                  <Link
                    href={`/admin/consumo/${encodeURIComponent(client.portal_email)}`}
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50 flex-shrink-0"
                    style={{ background: '#FFFFFF', color: '#6C3BFF', border: '1px solid #E8E3F5' }}
                    title="Ver consumo detallado con filtros de fecha + export CSV"
                  >
                    <BarChart3 size={11} />
                    <span className="hidden sm:inline"> Consumo</span>
                  </Link>
                )}

                {/* Acceso al portal (nivel cliente) */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    if (credOpen.has(client.key)) closeCred(client.key);
                    else openCred(client.key, client.portal_email);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50 flex-shrink-0"
                  style={{
                    background: credOpen.has(client.key) ? '#FFFBEB' : '#FFFFFF',
                    color: credOpen.has(client.key) ? '#F59E0B' : (client.portal_email ? '#10B981' : '#6B6480'),
                    border: `1px solid ${credOpen.has(client.key) ? '#FDE68A' : '#E8E3F5'}`,
                  }}
                  title={client.portal_email ? `Editar acceso: ${client.portal_email}` : 'Sin acceso al portal'}
                >
                  <KeyRound size={11} />
                  <span className="hidden sm:inline"> {client.portal_email ? 'Acceso' : 'Sin acceso'}</span>
                </button>

                <ChevronDown
                  size={15}
                  className="flex-shrink-0 transition-transform"
                  style={{ color: '#9B8FB5', transform: open ? 'rotate(180deg)' : undefined }}
                />
              </div>

              {/* Credentials form (nivel cliente, aplica a TODOS los empleados del pool) */}
              {credOpen.has(client.key) && credForms[client.key] && (() => {
                const form = credForms[client.key];
                const firstAgentId = client.agents[0]?.id ?? '';
                return (
                  <div
                    className="px-5 py-4 flex flex-col gap-3"
                    style={{ background: '#FFFBEB', borderTop: '1px solid #FDE68A' }}
                  >
                    <p className="text-[12px] font-semibold" style={{ color: '#4A3B6B' }}>
                      Acceso al portal.{' '}
                      <span style={{ color: '#6B6480', fontWeight: 400 }}>
                        Aplica a los {client.agents.length} empleado{client.agents.length !== 1 ? 's' : ''} de este cliente.
                      </span>
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9B8FB5' }}>Email de acceso</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={e => updateForm(client.key, { email: e.target.value })}
                          placeholder="cliente@negocio.com"
                          className="w-full text-[13px] outline-none rounded-lg px-3 py-2"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9B8FB5' }}>
                          {client.portal_email ? 'Nueva contraseña (vacío = sin cambio)' : 'Contraseña (mín. 8 caracteres)'}
                        </label>
                        <div className="relative">
                          <input
                            type={form.showPw ? 'text' : 'password'}
                            value={form.pw}
                            onChange={e => updateForm(client.key, { pw: e.target.value })}
                            placeholder="••••••••"
                            className="w-full text-[13px] outline-none rounded-lg px-3 py-2 pr-9"
                            style={inputStyle}
                          />
                          <button
                            type="button"
                            onClick={() => updateForm(client.key, { showPw: !form.showPw })}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2"
                            style={{ color: '#9B8FB5' }}
                          >
                            {form.showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </div>
                      {form.pw && (
                        <div className="sm:col-start-2">
                          <label className="block text-[11px] uppercase tracking-wider font-medium mb-1" style={{ color: '#9B8FB5' }}>Confirmar contraseña</label>
                          <input
                            type={form.showPw ? 'text' : 'password'}
                            value={form.confirm}
                            onChange={e => updateForm(client.key, { confirm: e.target.value })}
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveCred(client.key, client.portal_email, firstAgentId)}
                        disabled={form.saving}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: '#6C3BFF', color: '#FFFFFF' }}
                      >
                        <Check size={12} /> {form.saving ? 'Guardando' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => closeCred(client.key)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50"
                        style={{ background: '#FFFFFF', color: '#4A3B6B', border: '1px solid #E8E3F5' }}
                      >
                        <X size={12} /> Cancelar
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Expanded: agents */}
              {open && (
                <div style={{ borderTop: '1px solid #F5F0FF' }}>
                  {client.agents.map((agent, i) => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-3 px-5 py-3"
                      style={{
                        borderTop: i > 0 ? '1px solid #F5F0FF' : undefined,
                        background: '#FAFAFB',
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: agent.active ? '#10B981' : '#EF4444' }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-medium flex items-center gap-1" style={{ color: '#1A0A3B' }}>
                            <Bot size={11} style={{ color: '#7C3AED' }} />
                            {agent.agent_name?.trim() || agent.business_name}
                          </span>
                          {(() => {
                            const role = agent.meerkat_role_id
                              ? MEERKAT_MAP[agent.meerkat_role_id as MeerkatRoleId]
                              : null;
                            if (!role) return null;
                            return (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md font-medium"
                                style={{
                                  background: `${role.color}14`,
                                  color:      role.color,
                                  border:     `1px solid ${role.color}30`,
                                }}
                              >
                                {role.rol}
                              </span>
                            );
                          })()}
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
                        <Link
                          href={`/admin/agentes/${agent.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-90"
                          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
                        >
                          <Settings size={11} /><span className="hidden sm:inline"> Configurar</span>
                        </Link>
                      </div>
                    </div>
                  ))}

                  {/* Pool de la cuenta: minutos + tareas en 2 columnas */}
                  {client.agents[0] && (
                    <div className="px-5 py-5 flex flex-col gap-4" style={{ borderTop: '1px solid #F5F0FF' }}>
                      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9B8FB5' }}>
                        Pool de la cuenta
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <MinutesAdjuster
                          agentId={client.agents[0].id}
                          minutesUsed={client.acct_minutes_used ?? 0}
                          minutesIncluded={client.acct_minutes_included ?? 0}
                          isAccountPool={client.acct_minutes_included != null}
                        />
                        <TasksAdjuster
                          agentId={client.agents[0].id}
                          opsUsed={client.acct_ops_used}
                          opsLimit={client.acct_ops_limit}
                          isAccountPool={!!client.portal_email}
                        />
                      </div>
                      <DailyCapEditor
                        agentId={client.agents[0].id}
                        initialCap={client.agents[0].daily_minutes_cap}
                        monthlyIncluded={client.acct_minutes_included ?? 0}
                      />
                    </div>
                  )}

                  {/* Agregar empresa */}
                  <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid #F5F0FF' }}>
                    <Link
                      href={`/admin/agentes/nuevo?client_name=${encodeURIComponent(client.client_name)}&client_email=${encodeURIComponent(client.client_email ?? '')}&portal_email=${encodeURIComponent(client.portal_email ?? '')}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:bg-gray-50"
                      style={{ background: '#FFFFFF', border: '1px solid #E8E3F5', color: '#6C3BFF' }}
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

// ─── Stats Card ──────────────────────────────────────────────────────────────

function ClientesStatCard({ label, value, accent, icon, hint }: { label: string; value: string; accent: string; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl transition-all" style={{ background: '#ffffff', border: '1px solid #E8E3F5', padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,5,34,0.04)' }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center justify-center rounded-lg" style={{ background: `${accent}1A`, color: accent, width: 28, height: 28 }}>
          {icon}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#6B6480' }}>{label}</p>
      </div>
      <p className="text-[24px] font-bold tracking-tight leading-none" style={{ color: '#1A0A3B' }}>{value}</p>
      {hint && <p className="text-[11px] mt-1" style={{ color: '#9B8FB5' }}>{hint}</p>}
    </div>
  );
}
