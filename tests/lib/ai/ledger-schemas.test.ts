/**
 * Unit tests para ledger-schemas.ts (Fase 7 Task 7.1).
 *
 * Verifica:
 * - validateLedgerEntry con reason valido + metadata completa -> ok: true
 * - validateLedgerEntry con metadata incompleta -> ok: false (warning)
 * - validateLedgerEntry con reason invalido -> ok: false (warning)
 * - Extra keys en metadata -> ok: true (no falla)
 * - resolveReason priorizacion reason > source
 *
 * NO son integration tests (no tocan Supabase). assertNotProdOrAllowed no aplica.
 */

import { describe, it, expect } from 'vitest';
import {
  validateLedgerEntry,
  resolveReason,
  LEDGER_REASONS,
  type LedgerReason,
} from '@/lib/ai/ledger-schemas';

describe('validateLedgerEntry', () => {
  it('acepta reason valido con metadata completa', () => {
    const result = validateLedgerEntry('rule_setup', {
      rule_id:    'abc-123',
      applies_to: ['nala'],
    });
    expect(result.ok).toBe(true);
  });

  it('acepta metadata con keys extra (no debe fallar)', () => {
    const result = validateLedgerEntry('task_setup', {
      task_id:      'task-1',
      trigger_type: 'cron',
      extra_key:    'ignorado',
      otro_extra:   42,
    });
    expect(result.ok).toBe(true);
  });

  it('retorna ok: false con mensaje cuando faltan keys en metadata', () => {
    const result = validateLedgerEntry('task_execution_start', {
      task_id: 'task-1',
      // faltan run_id y trigger_source
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('run_id');
      expect(result.error).toContain('trigger_source');
    }
  });

  it('retorna ok: false cuando reason no esta en el catalogo', () => {
    const result = validateLedgerEntry('reason_inexistente', {
      algo: 'valor',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('reason_inexistente');
    }
  });

  it('acepta ficha_setup con metadata minima', () => {
    const result = validateLedgerEntry('ficha_setup', { ficha_id: 'ficha-abc' });
    expect(result.ok).toBe(true);
  });

  it('acepta ficha_retrieval con ficha_ids', () => {
    const result = validateLedgerEntry('ficha_retrieval', {
      ficha_ids: ['f1', 'f2'],
    });
    expect(result.ok).toBe(true);
  });

  it('acepta ficha_autotag_migration con ficha_id', () => {
    const result = validateLedgerEntry('ficha_autotag_migration', {
      ficha_id: 'ficha-migration-1',
    });
    expect(result.ok).toBe(true);
  });

  it('acepta task_action con metadata completa', () => {
    const result = validateLedgerEntry('task_action', {
      task_id:      'task-99',
      run_id:       'run-123',
      action_types: ['email', 'invoice'],
    });
    expect(result.ok).toBe(true);
  });

  it('retorna ok: false para task_action con metadata incompleta', () => {
    const result = validateLedgerEntry('task_action', {
      task_id: 'task-99',
      // faltan run_id y action_types
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('run_id');
      expect(result.error).toContain('action_types');
    }
  });
});

describe('LEDGER_REASONS', () => {
  it('contiene todos los reasons esperados del spec', () => {
    const expectedReasons: LedgerReason[] = [
      'rule_setup',
      'task_setup',
      'task_execution_start',
      'task_action',
      'ficha_setup',
      'ficha_retrieval',
      'ficha_autotag_migration',
    ];
    for (const reason of expectedReasons) {
      expect(LEDGER_REASONS).toHaveProperty(reason);
    }
  });

  it('cada reason tiene description y metadata array', () => {
    for (const [reason, schema] of Object.entries(LEDGER_REASONS)) {
      expect(typeof schema.description).toBe('string');
      expect(schema.description.length).toBeGreaterThan(0);
      expect(Array.isArray(schema.metadata)).toBe(true);
    }
  });
});

describe('resolveReason', () => {
  it('prioriza reason sobre source cuando ambos presentes', () => {
    expect(resolveReason('rule_setup', 'heartbeat')).toBe('rule_setup');
  });

  it('usa source cuando reason no esta presente', () => {
    expect(resolveReason(undefined, 'heartbeat')).toBe('heartbeat');
  });

  it('usa reason cuando source no esta presente', () => {
    expect(resolveReason('task_setup', undefined)).toBe('task_setup');
  });

  it('devuelve unknown cuando ninguno esta presente', () => {
    expect(resolveReason(undefined, undefined)).toBe('unknown');
  });

  it('devuelve unknown para strings vacios', () => {
    // Strings vacios son falsy — resolveReason los ignora como undefined
    expect(resolveReason('', '')).toBe('unknown');
  });
});
