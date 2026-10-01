// Regression: AC Proyectos 2026-09-30 — Nami active=true pero pool sin
// sembrar → cada chat 429. Este test asegura que un detector encuentra ese
// estado antes de que el owner reporte "no funciona".

import { describe, it, expect } from 'vitest';
import { detectPoolProvisioningAnomalies } from '../pool-provisioning-drift';

interface MockState {
  activeAgents:      Array<{ portal_email: string; active: boolean }>;
  balanceByOrg:      Map<string, number>;
  grantExistsByOrg:  Map<string, boolean>;
  opsUsedByOrg:      Map<string, number>;
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
});
