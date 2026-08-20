import { describe, it, expect } from 'vitest';
import { getDefaultPolicy, getToolCapability, TOOL_CAPABILITIES } from './engine';

// ---------------------------------------------------------------------------
// Capability defaults
// ---------------------------------------------------------------------------

describe('getDefaultPolicy', () => {
  it('sheets.read default policy is allow', () => {
    expect(getDefaultPolicy('sheets.read')).toBe('allow');
  });

  it('sheets.write default policy is requires_approval', () => {
    expect(getDefaultPolicy('sheets.write')).toBe('requires_approval');
  });

  it('unknown capability falls back to allow', () => {
    expect(getDefaultPolicy('totally.unknown')).toBe('allow');
  });

  it('email default policy is allow', () => {
    expect(getDefaultPolicy('email')).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// Tool → capability mappings
// ---------------------------------------------------------------------------

describe('getToolCapability', () => {
  it('sheets_agregar_fila maps to sheets.write capability', () => {
    expect(getToolCapability('sheets_agregar_fila')).toBe('sheets.write');
  });

  it('sheets_actualizar_fila maps to sheets.write capability', () => {
    expect(getToolCapability('sheets_actualizar_fila')).toBe('sheets.write');
  });

  it('sheets_leer maps to sheets.read capability', () => {
    expect(getToolCapability('sheets_leer')).toBe('sheets.read');
  });

  it('sheets_buscar maps to sheets.read capability', () => {
    expect(getToolCapability('sheets_buscar')).toBe('sheets.read');
  });

  it('returns undefined for unknown tool', () => {
    expect(getToolCapability('herramienta_desconocida')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TOOL_CAPABILITIES integrity — pre-existing tools still registered
// ---------------------------------------------------------------------------

describe('TOOL_CAPABILITIES pre-existing entries', () => {
  it('enviar_correo maps to email', () => {
    expect(TOOL_CAPABILITIES['enviar_correo']).toBe('email');
  });

  it('trigger_outbound_call maps to phone', () => {
    expect(TOOL_CAPABILITIES['trigger_outbound_call']).toBe('phone');
  });
});
