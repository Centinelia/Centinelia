import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';
import Link from 'next/link';
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  ArrowLeft, Info, Terminal,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const DEMO_EMAILS = ['demo@centinelia.mx', 'centinelia.dev@gmail.com'];

// ── Modelo de costos (todo en USD, convertimos al final) ────────────────────
// Voz por minuto incluye Vapi + Twilio + ElevenLabs + Deepgram (aprox).
// Estos números son estimaciones — ajusta VOICE_COST_USD_PER_MIN si la
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
  // Solo cambia el costo; el ingreso ya está bloqueado.
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
  if (pct < 0)      return '#ef4444';   // pérdida
  if (pct < 0.3)    return '#f59e0b';   // margen bajo
  return '#22c55e';                     // saludable
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
    <div className="p-4 md:p-8 max-w-6xl" style={{ background: '#120726', minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/inicio" className="inline-flex items-center gap-1.5 text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>
            <ArrowLeft size={12} /> Inicio
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>Ledger</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            Día {daysElapsed} de {daysInMonth} · FX {FX} MXN/USD · Solo agentes activos con plan
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
        >
          <Terminal size={14} />
          Comando
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          icon={<DollarSign size={14} />}
          label="Revenue mes"
          value={fmtMxn(totalRevenue)}
          sub={`${rows.length} agentes con plan`}
          color="#22c55e"
        />
        <SummaryCard
          icon={<TrendingDown size={14} />}
          label="Costo estimado"
          value={fmtMxn(totalCost)}
          sub={`Voz ${fmtMxn(totalVoiceCost)} · Claude ${fmtMxn(totalClaudeCost)}`}
          color="#f59e0b"
        />
        <SummaryCard
          icon={<TrendingUp size={14} />}
          label="Margen actual"
          value={fmtMxn(totalMargin)}
          sub={fmtPct(totalMarginPct)}
          color={marginColor(totalMarginPct)}
        />
        <SummaryCard
          icon={<AlertTriangle size={14} />}
          label="Margen proyectado"
          value={fmtMxn(projTotalMargin)}
          sub={fmtPct(projTotalMarginPct)}
          color={marginColor(projTotalMarginPct)}
        />
      </div>

      {/* Loss alerts */}
      {(nowLoss > 0 || projLoss > 0) && (
        <div className="mb-6 p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <div className="flex-1">
            {nowLoss > 0 && <p className="text-sm font-semibold" style={{ color: '#fff' }}>{nowLoss} agente{nowLoss > 1 ? 's' : ''} en pérdida hoy.</p>}
            {projLoss > 0 && <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>{projLoss} agente{projLoss > 1 ? 's' : ''} más proyectado{projLoss > 1 ? 's' : ''} a pérdida al cierre del mes si mantiene el ritmo.</p>}
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="p-8 text-center rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>Sin agentes activos con plan mensual.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
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
                {rows.map(r => (
                  <tr key={r.agent.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-3 py-3" style={{ color: 'var(--c-text)' }}>
                      <div className="font-semibold">{r.agent.business_name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>{r.agent.agent_name ?? '—'} · {r.agent.portal_email}</div>
                    </td>
                    <td className="px-3 py-3 text-center" style={{ color: 'var(--c-text-2)' }}>
                      {r.agent.plan} / {r.agent.minutes_plan}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div style={{ color: 'var(--c-text-2)' }}>{Math.round(r.minutesPct * 100)}% min</div>
                      <div className="text-xs" style={{ color: 'var(--c-text-4)' }}>{Math.round(r.opsPct * 100)}% ops</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--c-text-2)' }}>{fmtMxn(r.revenueMxn)}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: 'var(--c-text-3)' }}>{fmtMxn(r.totalCostMxn)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: marginColor(r.marginPct) }}>
                      {fmtMxn(r.marginMxn)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: marginColor(r.marginPct) }}>
                      {fmtPct(r.marginPct)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: marginColor(r.projMarginPct) }}>
                      {fmtPct(r.projMarginPct)}
                      {r.projMarginPct < 0 && r.marginPct >= 0 && (
                        <span className="ml-1" title="Proyectado a pérdida">⚠️</span>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Totales */}
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderTop: '2px solid rgba(255,255,255,0.1)' }}>
                  <td className="px-3 py-3 font-semibold" style={{ color: 'var(--c-text)' }}>Total</td>
                  <td></td>
                  <td></td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--c-text)' }}>{fmtMxn(totalRevenue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold" style={{ color: 'var(--c-text-2)' }}>{fmtMxn(totalCost)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold" style={{ color: marginColor(totalMarginPct) }}>{fmtMxn(totalMargin)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold" style={{ color: marginColor(totalMarginPct) }}>{fmtPct(totalMarginPct)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold" style={{ color: marginColor(projTotalMarginPct) }}>{fmtPct(projTotalMarginPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assumptions */}
      <div className="mt-6 p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--c-border)' }}>
        <Info size={14} style={{ color: 'var(--c-text-4)', flexShrink: 0, marginTop: 2 }} />
        <div className="text-xs" style={{ color: 'var(--c-text-3)', lineHeight: 1.7 }}>
          <p className="font-semibold mb-1" style={{ color: 'var(--c-text-2)' }}>Modelo de costos usado</p>
          <p>· Voz: <strong>${VOICE_COST_USD_PER_MIN.toFixed(2)} USD/min</strong> incluye Vapi + Twilio + ElevenLabs + Deepgram (aprox promedio).</p>
          <p>· Claude: <strong>${CLAUDE_COST_USD_PER_OP.toFixed(4)} USD por op</strong> (Haiku 4.5, con caching activo puede ser menos).</p>
          <p>· FX: <strong>{FX} MXN/USD</strong> (env <code>CENTINELIA_FX_MXN_USD</code> para override).</p>
          <p>· Proyección: extrapolación lineal del ritmo actual hasta cerrar el mes ({daysInMonth} días).</p>
          <p className="mt-1">Los números son <em>estimaciones internas</em> para orientar decisiones. Cuando tengas datos reales de Vapi por agente los sustituimos.</p>
        </div>
      </div>
    </div>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className="px-3 py-2.5 text-xs font-semibold uppercase tracking-widest"
      style={{ color: 'var(--c-text-4)', textAlign: align }}
    >
      {children}
    </th>
  );
}

function SummaryCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color }}>{icon}</span>
        <p className="text-xs font-semibold" style={{ color: 'var(--c-text-3)' }}>{label}</p>
      </div>
      <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-4)' }}>{sub}</p>}
    </div>
  );
}
