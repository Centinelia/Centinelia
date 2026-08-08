'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import { JORNADA_CONFIG, NOX_MONTHLY_CONFIG, MINUTES_TIER_CONFIG } from '@/lib/billing/plans';
import type { JornadaType } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';

// ── Costos unitarios reales (agosto 2026) ─────────────────────────────────────
// Vapi: promedio $0.06 USD/min incluyendo STT + TTS + LLM + platform fee
//       (fuente: dashboard Vapi con 226 min → $13.71 en 30 días)
// Twilio: $0.02 USD/min avg mix inbound/outbound MX (rate cards oficiales)
// Anthropic direct: ~$0.05 USD/op basado en inbox_processor (avg 6 LLM calls
//       por email × $0.01/call). Ops de tools simples cuestan menos.
const COST_PER_MIN_VAPI     = 0.06;
const COST_PER_MIN_TWILIO   = 0.02;
const COST_PER_OP_ANTHROPIC = 0.05;
const SAFETY_BUFFER         = 1.30; // 30%
const MXN_PER_USD           = 19;   // tipo de cambio de referencia

type Kind = 'voice' | 'coordinator';

interface AgentSpec {
  id:      string;
  kind:    Kind;
  jornada: JornadaType;
  tier:    MinutesTier;
}

const JORNADA_LABELS: Record<JornadaType, string> = {
  combinada: 'Combinada (voz + oficina)',
  minutos:   'Minutos (mayormente voz)',
  tareas:    'Tareas (mayormente oficina)',
};

const TIER_ORDER: MinutesTier[] = ['starter', 'growth', 'scale'];

function allocationFor(spec: AgentSpec): { minutes: number; aiOps: number } {
  if (spec.kind === 'coordinator') {
    const cfg = NOX_MONTHLY_CONFIG[spec.tier];
    return { minutes: cfg.minutes, aiOps: cfg.aiOps };
  }
  return JORNADA_CONFIG[spec.jornada][spec.tier];
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtMxn(n: number): string {
  return `MXN $${Math.round(n).toLocaleString('es-MX')}`;
}

export function SaldosCalculator() {
  const [agents, setAgents] = useState<AgentSpec[]>([
    { id: crypto.randomUUID(), kind: 'voice', jornada: 'combinada', tier: 'starter' },
  ]);

  const addAgent = () => setAgents(prev => [...prev, {
    id: crypto.randomUUID(), kind: 'voice', jornada: 'combinada', tier: 'starter',
  }]);
  const removeAgent = (id: string) => setAgents(prev => prev.filter(a => a.id !== id));
  const updateAgent = (id: string, patch: Partial<AgentSpec>) =>
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));

  const totals = useMemo(() => {
    let totalMinutes = 0;
    let totalOps     = 0;
    for (const spec of agents) {
      const alloc = allocationFor(spec);
      totalMinutes += alloc.minutes;
      totalOps     += alloc.aiOps;
    }
    const vapiRaw     = totalMinutes * COST_PER_MIN_VAPI;
    const twilioRaw   = totalMinutes * COST_PER_MIN_TWILIO;
    const anthropicRaw = totalOps    * COST_PER_OP_ANTHROPIC;

    const vapi     = vapiRaw     * SAFETY_BUFFER;
    const twilio   = twilioRaw   * SAFETY_BUFFER;
    const anthropic = anthropicRaw * SAFETY_BUFFER;
    const total     = vapi + twilio + anthropic;

    return { totalMinutes, totalOps, vapi, twilio, anthropic, total, vapiRaw, twilioRaw, anthropicRaw };
  }, [agents]);

  return (
    <div className="flex flex-col gap-6">
      {/* Formulario de agentes */}
      <div className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Empleados que contrató el cliente</h2>
          <button
            onClick={addAgent}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold"
            style={{ background: '#6C3BFF', color: '#fff' }}
          >
            + Agregar empleado
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {agents.map((spec, idx) => {
            const alloc = allocationFor(spec);
            return (
              <div
                key={spec.id}
                className="rounded-lg p-3 flex flex-wrap items-end gap-3"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}
              >
                <span className="text-xs font-semibold w-6" style={{ color: 'var(--c-text-3)' }}>#{idx + 1}</span>

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--c-text-3)' }}>Tipo</span>
                  <select
                    value={spec.kind}
                    onChange={e => updateAgent(spec.id, { kind: e.target.value as Kind })}
                    className="px-2 py-1.5 rounded-md text-sm"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                  >
                    <option value="voice">Voz + Oficina (Nia/Noah/Sofia/etc)</option>
                    <option value="coordinator">Coordinador (Nox/Niva — solo ops)</option>
                  </select>
                </label>

                {spec.kind === 'voice' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--c-text-3)' }}>Jornada</span>
                    <select
                      value={spec.jornada}
                      onChange={e => updateAgent(spec.id, { jornada: e.target.value as JornadaType })}
                      className="px-2 py-1.5 rounded-md text-sm"
                      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                    >
                      {(Object.keys(JORNADA_LABELS) as JornadaType[]).map(j => (
                        <option key={j} value={j}>{JORNADA_LABELS[j]}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--c-text-3)' }}>Tier</span>
                  <select
                    value={spec.tier}
                    onChange={e => updateAgent(spec.id, { tier: e.target.value as MinutesTier })}
                    className="px-2 py-1.5 rounded-md text-sm"
                    style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color: 'var(--c-text)' }}
                  >
                    {TIER_ORDER.map(t => (
                      <option key={t} value={t}>
                        {spec.kind === 'coordinator'
                          ? `${NOX_MONTHLY_CONFIG[t].label} (${NOX_MONTHLY_CONFIG[t].aiOps} ops)`
                          : `${MINUTES_TIER_CONFIG[t].label} (${MINUTES_TIER_CONFIG[t].minutes} min)`}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="text-xs flex-1 min-w-[180px]" style={{ color: 'var(--c-text-3)' }}>
                  → {alloc.minutes > 0 && <><b>{alloc.minutes}</b> min </>}
                  {alloc.aiOps > 0 && <><b>{alloc.aiOps}</b> ops</>}
                </div>

                {agents.length > 1 && (
                  <button
                    onClick={() => removeAgent(spec.id)}
                    className="text-xs px-2 py-1 rounded-md"
                    style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.3)' }}
                  >
                    Quitar
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs mt-3" style={{ color: 'var(--c-text-4)' }}>
          Total: <b style={{ color: 'var(--c-text-2)' }}>{totals.totalMinutes} min</b> + <b style={{ color: 'var(--c-text-2)' }}>{totals.totalOps} ops</b> al mes (pool compartido de la organización).
        </p>
      </div>

      {/* Recomendación de saldos */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <div className="px-5 py-4" style={{ background: 'rgba(108,59,255,0.08)', borderBottom: '1px solid var(--c-border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Saldo recomendado para el primer mes</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
            Incluye buffer del 30% sobre consumo estimado. Cheat sheet para agregar en cada dashboard.
          </p>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
          <PlatformRow
            name="Vapi"
            dashboardUrl="https://dashboard.vapi.ai/org/billing"
            usdRaw={totals.vapiRaw}
            usd={totals.vapi}
            note="Incluye STT + TTS + LLM + platform fee. Cárgalo como credits."
          />
          <PlatformRow
            name="Twilio"
            dashboardUrl="https://console.twilio.com/us1/billing/manage-billing/billing-overview"
            usdRaw={totals.twilioRaw}
            usd={totals.twilio}
            note="Minutos de llamada (los números ya se cobran fijo aparte)."
          />
          <PlatformRow
            name="Anthropic (Claude API)"
            dashboardUrl="https://console.anthropic.com/settings/billing"
            usdRaw={totals.anthropicRaw}
            usd={totals.anthropic}
            note="Cubre inbox_processor, delegar_tarea, chat de agentes, Nash."
          />
        </div>

        <div className="px-5 py-4 flex flex-wrap items-baseline justify-between gap-4" style={{ borderTop: '1px solid var(--c-border)', background: 'rgba(108,59,255,0.05)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>TOTAL a agregar</span>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold" style={{ color: '#6C3BFF' }}>{fmtUsd(totals.total)}</span>
            <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>≈ {fmtMxn(totals.total * MXN_PER_USD)} (TC {MXN_PER_USD})</span>
          </div>
        </div>
      </div>

      {/* Notas */}
      <div className="rounded-xl p-4 flex gap-3" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' }}>
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
        <div className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
          <p className="mb-2">
            <b>Costos unitarios (agosto 2026):</b> Vapi $0.06/min (incluye STT+TTS+LLM+platform), Twilio $0.02/min avg MX,
            Anthropic $0.05/op. Buffer +30% para picos del primer mes.
          </p>
          <p className="mb-2">
            <b>No incluye:</b> ElevenLabs directo (solo si el cliente pide voz clonada custom), CloudConvert (solo si usa
            plantillas .pptx/.xlsx), fees fijos de números Twilio ($6.50 MX / $1.50 US al mes por número).
          </p>
          <p>
            <b>Tip:</b> si el cliente arranca en lunes, agrega el saldo el viernes anterior. Vapi tarda 1-2h en reflejar la
            recarga, Anthropic hasta 24h en cuentas nuevas.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlatformRow({ name, dashboardUrl, usdRaw, usd, note }: {
  name:         string;
  dashboardUrl: string;
  usdRaw:       number;
  usd:          number;
  note:         string;
}) {
  return (
    <div className="px-5 py-4 flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{name}</span>
          <a
            href={dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs"
            style={{ color: '#6C3BFF' }}
          >
            dashboard <ExternalLink size={10} />
          </a>
        </div>
        <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{note}</p>
      </div>
      <div className="flex flex-col items-end">
        <span className="text-lg font-bold" style={{ color: 'var(--c-text)' }}>{fmtUsd(usd)}</span>
        <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>consumo est. {fmtUsd(usdRaw)} + 30%</span>
      </div>
    </div>
  );
}
