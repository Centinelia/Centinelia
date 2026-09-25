/**
 * Unit tests para src/lib/agent-rules/validation.ts.
 * Mockea getAllRoles() para evitar conexión a DB en tests unitarios.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock de whitelist ANTES de importar el módulo bajo test.
vi.mock('@/lib/tags/whitelist', () => ({
  getAllRoles: vi.fn(),
}));

import { validateCreateRuleInput } from '@/lib/agent-rules/validation';
import { getAllRoles } from '@/lib/tags/whitelist';

const mockGetAllRoles = vi.mocked(getAllRoles);

const VALID_ROLES = ['nia', 'noah', 'nico', 'nelia', 'neo', 'nara', 'naia', 'nova', 'nala', 'nalu', 'nami', 'neka', 'nox', 'niva', 'nash'];

describe('validateCreateRuleInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllRoles.mockResolvedValue(VALID_ROLES);
  });

  it('acepta input válido sin applies_to', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: 'Nunca ofrecemos descuentos sin aprobación',
      applies_to: [],
    });
    expect(result.ok).toBe(true);
  });

  it('acepta input válido con applies_to de slugs conocidos', async () => {
    const result = await validateCreateRuleInput(
      {
        portalEmail: 'test@example.com',
        regla: 'Solo Nala y Nia atienden facturas',
        applies_to: ['nala', 'nia'],
      },
      { rosterCheck: true },
    );
    expect(result.ok).toBe(true);
  });

  it('rechaza regla vacía', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: '',
      applies_to: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('rechaza regla solo con espacios', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: '   ',
      applies_to: [],
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza regla de más de 500 caracteres', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: 'x'.repeat(501),
      applies_to: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/500/);
  });

  it('acepta regla de exactamente 500 caracteres', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: 'x'.repeat(500),
      applies_to: [],
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza detalles de más de 2000 caracteres', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: 'Regla válida',
      detalles: 'y'.repeat(2001),
      applies_to: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2000/);
  });

  it('acepta detalles de exactamente 2000 caracteres', async () => {
    const result = await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: 'Regla válida',
      detalles: 'y'.repeat(2000),
      applies_to: [],
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza applies_to con slug inválido cuando rosterCheck es true', async () => {
    const result = await validateCreateRuleInput(
      {
        portalEmail: 'test@example.com',
        regla: 'Regla de prueba',
        applies_to: ['nala', 'agente-fantasma'],
      },
      { rosterCheck: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('agente-fantasma');
  });

  it('no llama getAllRoles cuando rosterCheck es false (default)', async () => {
    await validateCreateRuleInput({
      portalEmail: 'test@example.com',
      regla: 'Regla sin check de roster',
      applies_to: ['slug-inexistente'],
    });
    expect(mockGetAllRoles).not.toHaveBeenCalled();
  });

  it('no llama getAllRoles cuando applies_to está vacío aunque rosterCheck sea true', async () => {
    await validateCreateRuleInput(
      {
        portalEmail: 'test@example.com',
        regla: 'Regla para todos',
        applies_to: [],
      },
      { rosterCheck: true },
    );
    expect(mockGetAllRoles).not.toHaveBeenCalled();
  });
});
