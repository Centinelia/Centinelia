// Invariantes meerkat-roles.ts (consumidores: admin, portal cards) vs
// meerkat-avatar-crop.ts (consumidor: FAB chat portal).
//
// Precedente del test: 2026-09-30 sesión AC — commit 873d9ebf actualizó Nami
// en meerkat-roles.ts a '30% 8%' / 1.35, pero meerkat-avatar-crop.ts se
// quedó en '32% 35%' / 1.6 (desalineado 27 puntos en Y). El FAB usa
// crop.ts, no roles.ts, por lo que el avatar de Nami salió descentrado en
// prod. Diagnosticar tomó leer dos archivos e inferir el patrón.
//
// Las entradas de nia/neo/nova difieren A PROPÓSITO entre ambos archivos
// (crop.ts usa shift+origin tuning que roles.ts no soporta), por lo que
// NO se exige paridad total. Se exigen dos invariantes distintas:
//   1. Nami (bug recurrente): paridad exacta en pos+scale.
//   2. Universal: todo meerkat con tuning avatar en roles.ts debe tener
//      entrada explícita en crop.ts (no fallback a DEFAULT_MEERKAT_CROP),
//      porque el fallback no respeta el tuning del landing/admin.

import { describe, it, expect } from 'vitest';
import { MEERKAT_ROLES } from '../meerkat-roles';
import { MEERKAT_AVATAR_CROP } from '../meerkat-avatar-crop';

describe('meerkat avatar tuning — invariantes cross-file', () => {
  it('nami: pos y scale en roles.ts coinciden con crop.ts (bug 2026-09-30)', () => {
    const nami     = MEERKAT_ROLES.find(r => r.id === 'nami');
    const namiCrop = MEERKAT_AVATAR_CROP['nami'];
    expect(nami,     'nami debe existir en meerkat-roles.ts').toBeDefined();
    expect(namiCrop, 'nami debe tener entrada en meerkat-avatar-crop.ts').toBeDefined();
    expect(namiCrop.pos,   'nami.pos (crop.ts) debe === nami.avatarPosition (roles.ts)').toBe(nami!.avatarPosition);
    expect(namiCrop.scale, 'nami.scale (crop.ts) debe === nami.avatarScale (roles.ts)').toBe(nami!.avatarScale);
  });

  it('cobertura: todo meerkat con avatarPosition/Scale en roles.ts tiene entrada explícita en crop.ts', () => {
    const missing = MEERKAT_ROLES
      .filter(r => r.avatarPosition != null || r.avatarScale != null)
      .filter(r => MEERKAT_AVATAR_CROP[r.id] == null)
      .map(r => r.id);
    expect(missing, `meerkats con tuning en roles.ts pero sin entrada en crop.ts: ${missing.join(', ')}`).toEqual([]);
  });
});
