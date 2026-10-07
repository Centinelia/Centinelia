// Regression test fix-para-siempre: previene que un canal nuevo inicie
// conversación con un meerkat sin inyectar el role prompt.
//
// Historia:
//   2026-10-07 (AC Camila demo): Nami respondía con hallucinations
//   (menciona Google Sheets, pide conectar Excel, "no veo adjuntos" sin
//   verificar) a pesar de 4 commits previos reforzando el prompt. ROOT
//   CAUSE: el chat del portal (agent-chat/route.ts) NO inyectaba
//   promptPersonalidad del rol. Todos los refuerzos vivían en
//   meerkat-roles.ts promptPersonalidad, que solo era leído por canales
//   específicos (inbox-processor, nash-runner, neka). El chat usaba un
//   prompt genérico y Nami corría sin ninguna de sus reglas.
//
//   Fix sistémico: helper buildRolePromptBlock() en role-prompt-block.ts
//   más aplicación en TODOS los canales que inicien conversación meerkat
//   vs. dueño. Este test verifica que la lista de canales conocidos
//   (CHANNELS_REQUIRING_ROLE_PROMPT) tenga el import/call correcto.
//
//   Cada vez que se agregue un nuevo canal:
//     1. Agregarlo a CHANNELS_REQUIRING_ROLE_PROMPT en role-prompt-block.ts
//     2. Correr este test — fallará si el canal no invoca buildRolePromptBlock
//        O usa el patrón legacy MEERKAT_MAP[roleId]?.promptPersonalidad
//     3. Agregar el import/call en el canal nuevo

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CHANNELS_REQUIRING_ROLE_PROMPT, buildRolePromptBlock } from '../role-prompt-block';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

describe('buildRolePromptBlock', () => {
  it('devuelve string vacío si meerkatRoleId es null/undefined/invalid', () => {
    expect(buildRolePromptBlock({ meerkatRoleId: null })).toBe('');
    expect(buildRolePromptBlock({ meerkatRoleId: undefined })).toBe('');
    expect(buildRolePromptBlock({ meerkatRoleId: 'does_not_exist' })).toBe('');
  });

  it('devuelve bloque formatado para Nami', () => {
    const block = buildRolePromptBlock({ meerkatRoleId: 'nami' });
    expect(block).toContain('REGLAS Y PROCESO DE TU ROL');
    expect(block).toContain('Nami');
    expect(block).toContain('Inventarios');
    // Debe contener las reglas duras shippeadas durante el demo AC 2026-10-07
    expect(block).toContain('PROHIBIDO ABSOLUTO: NUNCA HABLES DE GOOGLE SHEETS');
  });

  it('devuelve bloque formatado para Niva (coordinador)', () => {
    const block = buildRolePromptBlock({ meerkatRoleId: 'niva' });
    if (block === '') return;  // niva puede no existir, test tolerante
    expect(block).toContain('Niva');
  });
});

describe('CHANNELS_REQUIRING_ROLE_PROMPT — fix-para-siempre regression', () => {
  it('cada canal listado existe en el repo', () => {
    for (const relPath of CHANNELS_REQUIRING_ROLE_PROMPT) {
      const abs = resolve(REPO_ROOT, relPath);
      expect(existsSync(abs), `canal declarado no existe: ${relPath}`).toBe(true);
    }
  });

  it('cada canal invoca buildRolePromptBlock o usa el patrón legacy válido', () => {
    for (const relPath of CHANNELS_REQUIRING_ROLE_PROMPT) {
      const abs = resolve(REPO_ROOT, relPath);
      const src = readFileSync(abs, 'utf8');
      // Patrón canónico: usa el helper
      const usesHelper = /buildRolePromptBlock\(/.test(src);
      // Patrón legacy válido: cualquier referencia a `.promptPersonalidad` dentro del archivo
      // (sea via MEERKAT_MAP[id], MEERKAT_ROLES.find, variable local NEKA, meerkat?., etc.)
      const usesLegacy = /\.promptPersonalidad/.test(src);
      expect(
        usesHelper || usesLegacy,
        `${relPath} debe invocar buildRolePromptBlock() o leer MEERKAT_MAP[...].promptPersonalidad. ` +
        `Si es un canal nuevo que inicia conversación con un meerkat, agrega el import ` +
        `de @/lib/portal/role-prompt-block y llama buildRolePromptBlock({ meerkatRoleId }). ` +
        `Si NO es un canal meerkat-vs-dueño, remuévelo de CHANNELS_REQUIRING_ROLE_PROMPT.`,
      ).toBe(true);
    }
  });
});
