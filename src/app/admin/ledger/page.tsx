import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Info, Terminal,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const DEMO_EMAILS = ['demo@centinelia.mx', 'centinelia.dev@gmail.com'];

// ── Modelo de costos (todo en USD, convertimos al final) ────────────────────
// Voz por minuto incluye Vapi + Twilio + ElevenLabs + Deepgram (aprox).
// Estos números son estimaciones. Ajusta VOICE_COST_USD_PER_MIN si la
// realidad de tu factura Vapi/Twilio difiere mucho.
const VOICE_COST_USD_PER_MIN = 0.13;
const CLAUDE_COST_USD_PER_OP = 0.0024;

// FX MXN/USD. Env var opcional para overrides; default conservador.
const FX = parseFloat(process.env.CENTINELIA_FX_MXN_USD ?? '19');

interface AgentRow {
  id:               string;
  business_name:    string;
  agent_name:       string | null;
  plan:             string | null;
  minutes_plan:     string | null;
  minutes_used:     number | null;
  minutes_included: number | null;
  ai_ops_used:      number | null;
  ai_ops_limit:     number | null;
  billing_status:   string | null;
  active:           boolean;
  portal_email:     string | null;
  created_at:       string;
}

function fmtMxn(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  const rounded = Math.round(n * 100);
  return `${rounded}%`;
}

interface LedgerRow {
  agent:            AgentRow;
  revenueMxn:       number;
  voiceCostMxn:     number;
  claudeCostMxn:    number;
  totalCostMxn:     number;
  marginMxn:        number;
  marginPct:        number;
  minutesPct:       number;
  opsPct:           number;
  projMarginPct:    number;
}

function computeLedger(agent: AgentRow, daysElapsed: number, daysInMonth: number): LedgerRow {
  const cfg = agent.plan && agent.minutes_plan
    ? MONTHLY_CONFIG[agent.plan as Plan]?.[agent.minutes_plan as MinutesTier]
    : undefined;
  const revenueMxn = cfg?.mxn ?? 0;

  const minutesUsed = agent.minutes_used     ?? 0;
  const minutesInc  = agent.minutes_included ?? 0;
  const opsUsed     = agent.ai_ops_used      ?? 0;
  const opsLimit    = agent.ai_ops_limit     ?? 0;

  const voiceCostUsd  = minutesUsed * VOICE_COST_USD_PER_MIN;
  const claudeCostUsd = opsUsed     * CLAUDE_COST_USD_PER_OP;
  const voiceCostMxn  = voiceCostUsd  * FX;
  const claudeCostMxn = claudeCostUsd * FX;
  const totalCostMxn  = voiceCostMxn + claudeCostMxn;
  const marginMxn     = revenueMxn - totalCostMxn;
  const marginPct     = revenueMxn > 0 ? marginMxn / revenueMxn : 0;

  const minutesPct = minutesInc > 0 ? minutesUsed / minutesInc : 0;
  const opsPct     = opsLimit   > 0 ? opsUsed     / opsLimit   : 0;

  // Proyección lineal: si consumes al ritmo actual, ¿cómo termina el mes?
  const projMultiplier = daysElapsed > 0 ? daysInMonth / daysElapsed : 1;
  const projCostMxn    = totalCostMxn * projMultiplier;
  const projMarginMxn  = revenueMxn - projCostMxn;
  const projMarginPct  = revenueMxn > 0 ? projMarginMxn / revenueMxn : 0;

  return {
    agent, revenueMxn, voiceCostMxn, claudeCostMxn, totalCostMxn,
    marginMxn, marginPct, minutesPct, opsPct, projMarginPct,
  };
}

function marginColor(pct: number): string {
  if (pct < 0)      return '#EF4444';   // pérdida
  if (pct < 0.3)    return '#F59E0B';   // margen bajo
  return '#10B981';                     // saludable
}

export default async function LedgerPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/ledger');
  }

  const supabase = createAdminClient();
  const now  = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = endMonth.getDate();
  const daysElapsed = Math.max(1, Math.floor((now.getTime() - startMonth.getTime()) / 86_400_000) + 1);

  const demoExcl = `(${DEMO_EMAILS.map(e => `"${e}"`).join(',')})`;
  const { data: agentsData } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, plan, minutes_plan, minutes_used, minutes_included, ai_ops_used, ai_ops_limit, billing_status, active, portal_email, created_at')
    .not('portal_email', 'in', demoExcl)
    .eq('active', true)
    .order('created_at', { ascending: false });

  const agents = (agentsData ?? []) as AgentRow[];

  const rows = agents
    .filter(a => a.billing_status === 'activo' && a.plan && a.minutes_plan && a.minutes_plan !== 'enterprise')
    .map(a => computeLedger(a, daysElapsed, daysInMonth))
    .sort((a, b) => a.marginPct - b.marginPct);   // peor margen primero

  // Aggregates
  const totalRevenue      = rows.reduce((s, r) => s + r.revenueMxn, 0);
  const totalVoiceCost    = rows.reduce((s, r) => s + r.voiceCostMxn, 0);
  const totalClaudeCost   = rows.reduce((s, r) => s + r.claudeCostMxn, 0);
  const totalCost         = totalVoiceCost + totalClaudeCost;
  const totalMargin       = totalRevenue - totalCost;
  const totalMarginPct    = totalRevenue > 0 ? totalMargin / totalRevenue : 0;

  // Proyección total
  const projMultiplier    = daysInMonth / daysElapsed;
  const projTotalCost     = totalCost * projMultiplier;
  const projTotalMargin   = totalRevenue - projTotalCost;
  const projTotalMarginPct = totalRevenue > 0 ? projTotalMargin / totalRevenue : 0;

  // Cuentas en pérdida (actual o proyectada)
  const nowLoss  = rows.filter(r => r.marginMxn     < 0).length;
  const projLoss = rows.filter(r => r.projMarginPct < 0 && r.marginPct >= 0).length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Ledger</h1>
          <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
            Día {daysElapsed} de {daysInMonth}. FX {FX} MXN/USD. Solo agentes activos con plan.
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
        >
          <Terminal size={13} />
          Comando
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign size={13} />}
          label="Revenue mes"
          value={fmtMxn(totalRevenue)}
          sub={`${rows.length} agentes con plan`}
          color="#10B981"
        />
        <SummaryCard
          icon={<TrendingDown size={13} />}
          label="Costo estimado"
          value={fmtMxn(totalCost)}
          sub={`Voz ${fmtMxn(totalVoiceCost)} · Claude ${fmtMxn(totalClaudeCost)}`}
          color="#F59E0B"
        />
        <SummaryCard
          icon={<TrendingUp size={13} />}
          label="Margen actual"
          value={fmtMxn(totalMargin)}
          sub={fmtPct(totalMarginPct)}
          color={marginColor(totalMarginPct)}
        />
        <SummaryCard
          icon={<AlertTriangle size={13} />}
          label="Margen proyectado"
          value={fmtMxn(projTotalMargin)}
          sub={fmtPct(projTotalMarginPct)}
          color={marginColor(projTotalMarginPct)}
        />
      </div>

      {/* Loss alerts */}
      {(nowLoss > 0 || projLoss > 0) && (
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <AlertTriangle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            {nowLoss > 0 && (
              <p className="text-[13px] font-semibold" style={{ color: '#111827' }}>
                {nowLoss} agente{nowLoss > 1 ? 's' : ''} en pérdida hoy.
              </p>
            )}
            {projLoss > 0 && (
              <p className="text-[13px] mt-1" style={{ color: '#4B5563' }}>
                {projLoss} agente{projLoss > 1 ? 's' : ''} más proyectado{projLoss > 1 ? 's' : ''} a pérdida al cierre del mes si mantiene el ritmo.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div
          className="p-8 text-center rounded-xl bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <p className="text-[13px]" style={{ color: '#6B7280' }}>Sin agentes activos con plan mensual.</p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden bg-white"
          style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <Th align="left">Agente</Th>
                  <Th>Plan</Th>
                  <Th>Uso</Th>
                  <Th>Revenue</Th>
                  <Th>Costo</Th>
                  <Th>Margen</Th>
                  <Th>%</Th>
                  <Th>Proyección %</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.agent.id} style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : '1px solid #F3F4F6' }} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5" style={{ color: '#111827' }}>
                      <div className="font-medium">{r.agent.business_name}</div>
                      <div className="text-[11px] mt-0.5" style={{ color: '#9CA3AF' }}>
                        {r.agent.agent_name ?? '.'} · {r.agent.portal_email}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center" style={{ color: '#4B5563' }}>
                      {r.agent.plan} / {r.agent.minutes_plan}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div style={{ color: '#374151' }} className="tabular-nums">{Math.round(r.minutesPct * 100)}% min</div>
                      <div className="text-[11px] tabular-nums" style={{ color: '#9CA3AF' }}>{Math.round(r.opsPct * 100)}% ops</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#374151' }}>{fmtMxn(r.revenueMxn)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#6B7280' }}>{fmtMxn(r.totalCostMxn)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: marginColor(r.marginPct) }}>
                      {fmtMxn(r.marginMxn)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold" style={{ color: marginColor(r.marginPct) }}>
                      {fmtPct(r.marginPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: marginColor(r.projMarginPct) }}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {fmtPct(r.projMarginPct)}
                        {r.projMarginPct < 0 && r.marginPct >= 0 && (
                          <AlertTriangle size={11} style={{ color: '#EF4444' }} />
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totales */}
                <tr style={{ background: '#F9FAFB', borderTop: '2px solid #E5E7EB' }}>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#111827' }}>Total</td>
                  <td></td>
                  <td></td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: '#111827' }}>{fmtMxn(totalRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold" style={{ color: '#374151' }}>{fmtMxn(totalCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: marginColor(totalMarginPct) }}>{fmtMxn(totalMargin)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: marginColor(totalMarginPct) }}>{fmtPct(totalMarginPct)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold" style={{ color: marginColor(projTotalMarginPct) }}>{fmtPct(projTotalMarginPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assumptions */}
      <div
        className="p-4 rounded-xl flex items-start gap-3 bg-white"
        style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
      >
        <Info size={14} style={{ color: '#9CA3AF', flexShrink: 0, marginTop: 2 }} />
        <div className="text-[12px]" style={{ color: '#6B7280', lineHeight: 1.7 }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: '#111827' }}>Modelo de costos usado</p>
          <p>Voz: <strong style={{ color: '#374151' }}>${VOICE_COST_USD_PER_MIN.toFixed(2)} USD/min</strong> incluye Vapi + Twilio + ElevenLabs + Deepgram (aprox promedio).</p>
          <p>Claude: <strong style={{ color: '#374151' }}>${CLAUDE_COST_USD_PER_OP.toFixed(4)} USD por op</strong> (Haiku 4.5, con caching activo puede ser menos).</p>
          <p>FX: <strong style={{ color: '#374151' }}>{FX} MXN/USD</strong> (env <code className="font-mono text-[11px]" style={{ color: '#4B5563' }}>CENTINELIA_FX_MXN_USD</code> para override).</p>
          <p>Proyección: extrapolación lineal del ritmo actual hasta cerrar el mes ({daysInMonth} días).</p>
          <p className="mt-1">Los números son <em>estimaciones internas</em> para orientar decisiones. Cuando tengas datos reales de Vapi por agente los sustituimos.</p>
        </div>
      </div>
    </div>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider"
      style={{ color: '#6B7280', textAlign: align }}
    >
      {children}
    </th>
  );
}

function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div
      className="rounded-xl bg-white px-5 py-4"
      style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>{label}</p>
      </div>
      <p className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: '#111827' }}>{value}</p>
      {sub && <p className="text-[12px] mt-1.5" style={{ color: '#6B7280' }}>{sub}</p>}
    </div>
  );
}
