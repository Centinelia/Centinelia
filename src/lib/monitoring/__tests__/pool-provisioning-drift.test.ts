// Regression: AC Proyectos 2026-09-30 — Nami active=true pero pool sin
// sembrar → cada chat 429. Este test asegura que un detector encuentra ese
// estado antes de que el owner reporte "no funciona".

import { describe, it, expect } from 'vitest';
import { detectPoolProvisioningAnomalies } from '../pool-provisioning-drift';

interface MockState {
  activeAgents:        Array<{ portal_email: string; active: boolean }>;
  balanceByOrg:        Map<string, number>;
  grantExistsByOrg:    Map<string, boolean>;
  opsUsedByOrg:        Map<string, number>;
  billingPausedByOrg?: Map<string, string | null>;  // 2026-10-10: orgs con pago pausado se skipean
}

function mockSupabase(state: MockState) {
  return {
    from(table: string) {
      if (table === 'voice_agents') {
        return {
          select: () => ({
            eq: () => ({
              not: () => Promise.resolve({ data: state.activeAgents }),
            }),
          }),
        };
      }
      if (table === 'ops_ledger') {
        return {
          select: () => ({
            eq: (_col: string, portalEmail: string) => ({
              in: () => ({
                limit: () => Promise.resolve({
                  data: state.grantExistsByOrg.get(portalEmail) ? [{ id: 'grant-uuid' }] : [],
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: (_col: string, portalEmail: string) => ({
              maybeSingle: () => Promise.resolve({
                data: { billing_paused_at: state.billingPausedByOrg?.get(portalEmail) ?? null },
              }),
            }),
          }),
        };
      }
      if (table === 'account_ops') {
        return {
          select: () => ({
            eq: (_col: string, portalEmail: string) => ({
              maybeSingle: () => Promise.resolve({
                data: { ops_used: state.opsUsedByOrg.get(portalEmail) ?? 0 },
              }),
            }),
          }),
        };
      }
      return {};
    },
    rpc(name: string, args: { p_portal_email: string }) {
      if (name === 'get_ops_pool_balance') {
        return Promise.resolve({ data: state.balanceByOrg.get(args.p_portal_email) ?? 0 });
      }
      return Promise.resolve({ data: null });
    },
  } as unknown as Parameters<typeof detectPoolProvisioningAnomalies>[0];
}

describe('detectPoolProvisioningAnomalies', () => {
  it('AC Proyectos scenario: active agent + never seeded → flag never_seeded', async () => {
    const supa = mockSupabase({
      activeAgents:     [{ portal_email: 'camila@acproyectos.com', active: true }],
      balanceByOrg:     new Map([['camila@acproyectos.com', -16]]),
      grantExistsByOrg: new Map(),
      opsUsedByOrg:     new Map([['camila@acproyectos.com', 16]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toHaveLength(1);
    expect(result[0].portal_email).toBe('camila@acproyectos.com');
    expect(result[0].reason).toBe('never_seeded');
    expect(result[0].ledger_balance).toBe(-16);
  });

  it('org saludable con balance positivo → no flag', async () => {
    const supa = mockSupabase({
      activeAgents:     [{ portal_email: 'ok@example.com', active: true }],
      balanceByOrg:     new Map([['ok@example.com', 300]]),
      grantExistsByOrg: new Map([['ok@example.com', true]]),
      opsUsedByOrg:     new Map([['ok@example.com', 200]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toEqual([]);
  });

  it('org con grant previo pero balance <= 0 → flag exhausted_no_refill (distinto de never_seeded)', async () => {
    const supa = mockSupabase({
      activeAgents:     [{ portal_email: 'exhausted@example.com', active: true }],
      balanceByOrg:     new Map([['exhausted@example.com', 0]]),
      grantExistsByOrg: new Map([['exhausted@example.com', true]]),
      opsUsedByOrg:     new Map([['exhausted@example.com', 500]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('exhausted_no_refill');
  });

  it('agrupa por portal_email cuando la org tiene múltiples agentes activos', async () => {
    const supa = mockSupabase({
      activeAgents: [
        { portal_email: 'multi@example.com', active: true },
        { portal_email: 'multi@example.com', active: true },
        { portal_email: 'multi@example.com', active: true },
      ],
      balanceByOrg:     new Map([['multi@example.com', -5]]),
      grantExistsByOrg: new Map(),
      opsUsedByOrg:     new Map([['multi@example.com', 5]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toHaveLength(1);
    expect(result[0].active_agents).toBe(3);
  });

  // Regression 2026-10-03: alert ruidosa de 20 orgs — 17 eran test fixtures y
  // demos zombie (active=true pero ops_used=0, nadie ha intentado consumir).
  // El comentario del detector dice "flag solo si ops_used > 0", pero el código
  // no lo verificaba. Sin consumo real no hay dolor del cliente → no flag.
  it('zombie org (active agent, no pool, ops_used=0) → no flag', async () => {
    const supa = mockSupabase({
      activeAgents:     [{ portal_email: 'nazre20+navi-test-123@gmail.com', active: true }],
      balanceByOrg:     new Map([['nazre20+navi-test-123@gmail.com', 0]]),
      grantExistsByOrg: new Map(),
      opsUsedByOrg:     new Map([['nazre20+navi-test-123@gmail.com', 0]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toEqual([]);
  });

  it('zombie exhausted-looking org con ops_used=0 → no flag (idle, sin dolor real)', async () => {
    const supa = mockSupabase({
      activeAgents:     [{ portal_email: 'idle-demo@centinelia.mx', active: true }],
      balanceByOrg:     new Map([['idle-demo@centinelia.mx', 0]]),
      grantExistsByOrg: new Map([['idle-demo@centinelia.mx', true]]),
      opsUsedByOrg:     new Map([['idle-demo@centinelia.mx', 0]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toEqual([]);
  });

  // 2026-10-10: AC Proyectos post-Fase 1 esperando pago Mes 2. Pool vaciado
  // intencional + billing_paused_at seteado. consumeAiOp bypass garantiza
  // que no haya decremento → no hay dolor del cliente. Alertar aquí sería
  // ruido (ya sabemos que la org está en pausa a propósito). Ver
  // `.brain/policies/billing-bypass-from-claude-code.md`.
  it('org con billing_paused_at seteado → no flag (bypass intencional)', async () => {
    const supa = mockSupabase({
      activeAgents:        [{ portal_email: 'camila@acproyectos.com', active: true }],
      balanceByOrg:        new Map([['camila@acproyectos.com', 0]]),
      grantExistsByOrg:    new Map([['camila@acproyectos.com', true]]),
      opsUsedByOrg:        new Map([['camila@acproyectos.com', 1097]]),
      billingPausedByOrg:  new Map([['camila@acproyectos.com', '2026-10-10T17:30:00Z']]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toEqual([]);
  });

  it('org sin billing_paused_at pero balance <=0 → sí flag (regresión inversa)', async () => {
    const supa = mockSupabase({
      activeAgents:        [{ portal_email: 'real-problem@example.com', active: true }],
      balanceByOrg:        new Map([['real-problem@example.com', -3]]),
      grantExistsByOrg:    new Map([['real-problem@example.com', true]]),
      opsUsedByOrg:        new Map([['real-problem@example.com', 500]]),
      billingPausedByOrg:  new Map([['real-problem@example.com', null]]),
    });
    const result = await detectPoolProvisioningAnomalies(supa);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('exhausted_no_refill');
  });
});
