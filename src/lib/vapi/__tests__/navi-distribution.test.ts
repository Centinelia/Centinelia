import { describe, it, expect } from 'vitest';
import { MEERKAT_VOICE_DISTRIBUTION } from '../sync';
import { CHAT_TOOL_BY_NAME } from '@/app/api/portal/[token]/agent-chat/route';
import { VOICE_TO_CHAT } from '@/lib/tools/channel-mapping';
import { TOOL_REGISTRY } from '@/lib/tools/registry';

const NAVI_STANDARD_COUNT  = 14;
const NAVI_AGENCIA_COUNT   = 16;

const NAVI_EXCLUSIVE_TOOLS = ['listar_cuentas_gestionadas', 'replicar_contenido_entre_cuentas'] as const;

describe('Navi voice distribution', () => {
  it('navi tiene exactamente 14 tools', () => {
    expect(MEERKAT_VOICE_DISTRIBUTION.navi).toHaveLength(NAVI_STANDARD_COUNT);
  });

  it('navi_agencia tiene exactamente 16 tools', () => {
    expect(MEERKAT_VOICE_DISTRIBUTION.navi_agencia).toHaveLength(NAVI_AGENCIA_COUNT);
  });

  it('las 14 tools de navi son el subset de navi_agencia (sin las 2 exclusivas)', () => {
    const naviSet    = new Set(MEERKAT_VOICE_DISTRIBUTION.navi);
    const agenciaSet = new Set(MEERKAT_VOICE_DISTRIBUTION.navi_agencia);
    for (const t of naviSet) {
      expect(agenciaSet.has(t), `navi_agencia deberia tener '${t}'`).toBe(true);
    }
  });

  it('las 2 tools exclusivas estan SOLO en navi_agencia, no en navi', () => {
    for (const tool of NAVI_EXCLUSIVE_TOOLS) {
      expect(MEERKAT_VOICE_DISTRIBUTION.navi).not.toContain(tool);
      expect(MEERKAT_VOICE_DISTRIBUTION.navi_agencia).toContain(tool);
    }
  });

  it('navi_agencia = navi + 2 exclusivas (exactamente)', () => {
    const naviSet    = new Set(MEERKAT_VOICE_DISTRIBUTION.navi);
    const agenciaSet = new Set(MEERKAT_VOICE_DISTRIBUTION.navi_agencia);
    const extra = [...agenciaSet].filter(t => !naviSet.has(t));
    expect(extra.sort()).toEqual([...NAVI_EXCLUSIVE_TOOLS].sort());
  });
});

describe('Navi channel mappings completas', () => {
  it('cada tool de navi tiene mapping en VOICE_TO_CHAT', () => {
    for (const tool of MEERKAT_VOICE_DISTRIBUTION.navi) {
      expect(
        tool in VOICE_TO_CHAT,
        `VOICE_TO_CHAT no tiene entrada para '${tool}'`,
      ).toBe(true);
    }
  });

  it('cada tool de navi_agencia tiene mapping en VOICE_TO_CHAT', () => {
    for (const tool of MEERKAT_VOICE_DISTRIBUTION.navi_agencia) {
      expect(
        tool in VOICE_TO_CHAT,
        `VOICE_TO_CHAT no tiene entrada para '${tool}'`,
      ).toBe(true);
    }
  });

  it('cada mapping de navi en VOICE_TO_CHAT apunta a schema en CHAT_TOOL_BY_NAME', () => {
    for (const tool of MEERKAT_VOICE_DISTRIBUTION.navi) {
      const chatName = VOICE_TO_CHAT[tool];
      if (chatName === null) continue; // voice-only intencional
      expect(
        chatName !== undefined,
        `VOICE_TO_CHAT['${tool}'] es undefined`,
      ).toBe(true);
      expect(
        chatName! in CHAT_TOOL_BY_NAME,
        `CHAT_TOOL_BY_NAME no tiene schema para '${chatName}' (voice: '${tool}')`,
      ).toBe(true);
    }
  });

  it('cada mapping de navi_agencia en VOICE_TO_CHAT apunta a schema en CHAT_TOOL_BY_NAME', () => {
    for (const tool of MEERKAT_VOICE_DISTRIBUTION.navi_agencia) {
      const chatName = VOICE_TO_CHAT[tool];
      if (chatName === null) continue;
      expect(
        chatName !== undefined,
        `VOICE_TO_CHAT['${tool}'] es undefined`,
      ).toBe(true);
      expect(
        chatName! in CHAT_TOOL_BY_NAME,
        `CHAT_TOOL_BY_NAME no tiene schema para '${chatName}' (voice: '${tool}')`,
      ).toBe(true);
    }
  });
});

describe('Navi TOOL_REGISTRY entries', () => {
  const NAVI_TOOLS_ALL = new Set([
    ...MEERKAT_VOICE_DISTRIBUTION.navi,
    ...MEERKAT_VOICE_DISTRIBUTION.navi_agencia,
  ]);

  it('todas las tools de Navi estan en TOOL_REGISTRY', () => {
    const registeredNames = new Set(TOOL_REGISTRY.map(t => t.name));
    for (const tool of NAVI_TOOLS_ALL) {
      expect(registeredNames.has(tool), `TOOL_REGISTRY no tiene '${tool}'`).toBe(true);
    }
  });

  it('todas las tools de Navi tienen gatedByFeature: social_publishing', () => {
    for (const tool of NAVI_TOOLS_ALL) {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      expect(entry, `TOOL_REGISTRY entry faltante para '${tool}'`).toBeDefined();
      expect(
        entry!.gatedByFeature,
        `'${tool}' no tiene gatedByFeature`,
      ).toBe('social_publishing');
    }
  });

  it('las 14 tools estandar tienen gatedByRole incluyendo navi y navi_agencia', () => {
    for (const tool of MEERKAT_VOICE_DISTRIBUTION.navi) {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      expect(entry, `entry faltante: '${tool}'`).toBeDefined();
      const roles = entry!.gatedByRole ?? [];
      expect(roles, `'${tool}' deberia incluir 'navi' en gatedByRole`).toContain('navi');
      expect(roles, `'${tool}' deberia incluir 'navi_agencia' en gatedByRole`).toContain('navi_agencia');
    }
  });

  it('las 2 tools exclusivas tienen gatedByRole: [navi_agencia] solamente', () => {
    for (const tool of NAVI_EXCLUSIVE_TOOLS) {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      expect(entry, `entry faltante: '${tool}'`).toBeDefined();
      const roles = entry!.gatedByRole ?? [];
      expect(roles, `'${tool}' NO debe incluir 'navi'`).not.toContain('navi');
      expect(roles, `'${tool}' debe incluir 'navi_agencia'`).toContain('navi_agencia');
    }
  });

  it('todas las tools de Navi declaran channels: voice + chat + email', () => {
    for (const tool of NAVI_TOOLS_ALL) {
      const entry = TOOL_REGISTRY.find(t => t.name === tool);
      expect(entry, `entry faltante: '${tool}'`).toBeDefined();
      expect(entry!.channels, `'${tool}' debe incluir voice`).toContain('voice');
      expect(entry!.channels, `'${tool}' debe incluir chat`).toContain('chat');
      expect(entry!.channels, `'${tool}' debe incluir email`).toContain('email');
    }
  });
});
