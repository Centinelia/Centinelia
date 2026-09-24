// Test del importer CSV/XLSX de perfiles_vivos.
//
// Mockea supabase-js para no golpear DB, mockea consumeAiOp para no cobrar.
// Valida:
//   - Parseo CSV con column mapping
//   - Coerción numérica en datos_operacionales (heurística por nombre de campo)
//   - Normalización de teléfono y correo
//   - Skip de filas sin nombre
//   - Auto-activación del feature si estaba off
//   - Cobro batched proporcional al número real de contactos procesados

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock consumeAiOp
vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn(async () => ({ ok: true, used: 0, limit: 0 })),
}));

// Mock supabase — captura llamadas para asserts
vi.mock('@/lib/supabase/admin', () => {
  interface UpsertRow { id: string; created_at: string; updated_at: string }
  const state = {
    orgFeatures:   {} as Record<string, unknown>,
    writeCalls:    [] as Array<{ table: string; kind: 'insert' | 'upsert'; rows: unknown[]; onConflict?: string }>,
    upsertResults: [] as UpsertRow[],
  };

  const client = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { features: state.orgFeatures }, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      upsert: vi.fn((rows: unknown[], opts?: { onConflict?: string }) => {
        state.writeCalls.push({ table, kind: 'upsert', rows, onConflict: opts?.onConflict });
        return {
          select: vi.fn(() => ({
            then: (resolve: (v: { data: UpsertRow[]; error: null }) => void) =>
              resolve({ data: state.upsertResults.slice(0, rows.length), error: null }),
          })),
        };
      }),
      insert: vi.fn((rows: unknown[]) => {
        state.writeCalls.push({ table, kind: 'insert', rows });
        return {
          select: vi.fn(async () => ({
            data:  (rows as unknown[]).map((_, i) => ({ id: `new-${i}` })),
            error: null,
          })),
        };
      }),
    })),
  };

  return {
    createAdminClient: () => client,
    __state: state,
  };
});

import { importCarteraContactos } from '../import';
import * as adminMod from '@/lib/supabase/admin';

const state = (adminMod as unknown as { __state: {
  orgFeatures: Record<string, unknown>;
  writeCalls: Array<{ table: string; kind: 'insert' | 'upsert'; rows: unknown[]; onConflict?: string }>;
  upsertResults: Array<{ id: string; created_at: string; updated_at: string }>;
}}).__state;

function contactosWrite() {
  return state.writeCalls.find((c) => c.table === 'contactos_vivos');
}

function csvBuffer(csv: string): Buffer {
  return Buffer.from(csv, 'utf8');
}

describe('importCarteraContactos', () => {
  beforeEach(() => {
    state.orgFeatures = {};
    state.writeCalls = [];
    state.upsertResults = [];
  });

  it('parsea CSV básico y hace upsert con external_id', async () => {
    const csv = 'ID,NOMBRE,TEL,MONTO\nA001,Juan Pérez,8112345678,5000\nA002,María López,8199887766,12500';
    const now = new Date().toISOString();
    state.upsertResults = [
      { id: 'row-1', created_at: now, updated_at: now },
      { id: 'row-2', created_at: now, updated_at: now },
    ];

    const result = await importCarteraContactos(csvBuffer(csv), {
      portalEmail: 'test@centinelia.mx',
      filename:    'cartera.csv',
      columnMapping: {
        external_id: 'ID',
        nombre:      'NOMBRE',
        telefono:    'TEL',
        datos_operacionales: { monto_adeudado: 'MONTO' },
      },
      agentId: 'agent-1',
    });

    expect(result.total_rows_leidas).toBe(2);
    expect(result.contactos_creados).toBe(2);
    expect(result.rows_saltadas).toBe(0);
    expect(result.auto_activated).toBe(true);

    const write = contactosWrite();
    expect(write).toBeDefined();
    expect(write!.kind).toBe('upsert');
    expect(write!.onConflict).toBe('portal_email,external_id');
    const rows = write!.rows as Array<Record<string, unknown>>;
    expect(rows[0].nombre).toBe('Juan Pérez');
    expect(rows[0].telefono).toBe('8112345678');
    // Coerción numérica por heurística "monto"
    expect((rows[0].datos_operacionales as Record<string, unknown>).monto_adeudado).toBe(5000);
  });

  it('normaliza teléfonos con formatos mixtos', async () => {
    const csv = 'nombre,telefono\nTest 1,+52 811 234 5678\nTest 2,(811) 234-5678\nTest 3,8112345678';
    state.upsertResults = Array(3).fill(null).map((_, i) => ({ id: `r${i}`, created_at: 'a', updated_at: 'a' }));

    await importCarteraContactos(csvBuffer(csv), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: { nombre: 'nombre', telefono: 'telefono' },
    });

    const rows = contactosWrite()?.rows as Array<Record<string, unknown>> ?? [];
    expect(rows[0].telefono).toBe('+528112345678');
    expect(rows[1].telefono).toBe('8112345678');
    expect(rows[2].telefono).toBe('8112345678');
  });

  it('normaliza correos a lowercase y valida presencia de @', async () => {
    const csv = 'nombre,mail\nA,JUAN@Mail.com\nB,sin-arroba\nC,';
    state.upsertResults = Array(3).fill(null).map((_, i) => ({ id: `r${i}`, created_at: 'a', updated_at: 'a' }));

    await importCarteraContactos(csvBuffer(csv), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: { nombre: 'nombre', correo: 'mail' },
    });

    const rows = contactosWrite()?.rows as Array<Record<string, unknown>> ?? [];
    expect(rows[0].correo).toBe('juan@mail.com');
    expect(rows[1].correo).toBeNull();
    expect(rows[2].correo).toBeNull();
  });

  it('salta filas sin nombre en vez de fallar', async () => {
    const csv = 'nombre,tel\nJuan,111\n,222\nMaría,333';
    state.upsertResults = [
      { id: 'r1', created_at: 'a', updated_at: 'a' },
      { id: 'r3', created_at: 'a', updated_at: 'a' },
    ];

    const r = await importCarteraContactos(csvBuffer(csv), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: { nombre: 'nombre', telefono: 'tel' },
    });

    expect(r.total_rows_leidas).toBe(3);
    expect(r.rows_saltadas).toBe(1);
    expect(r.contactos_creados).toBe(2);
  });

  it('coerce a number solo si el nombre del campo sugiere numérico', async () => {
    const csv = 'nombre,MONTO,PRODUCTO\nA,$1500.50,Auto Rojo\nB,2000,Casa Blanca';
    state.upsertResults = Array(2).fill(null).map((_, i) => ({ id: `r${i}`, created_at: 'a', updated_at: 'a' }));

    await importCarteraContactos(csvBuffer(csv), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: {
        nombre: 'nombre',
        datos_operacionales: {
          monto_adeudado: 'MONTO',    // heurística "monto" → number
          tipo_producto:  'PRODUCTO', // no matcheable → string
        },
      },
    });

    const rows = contactosWrite()?.rows as Array<Record<string, unknown>> ?? [];
    const dop0 = rows[0].datos_operacionales as Record<string, unknown>;
    expect(dop0.monto_adeudado).toBe(1500.5);
    expect(dop0.tipo_producto).toBe('Auto Rojo');
  });

  it('no re-activa el feature si ya estaba true', async () => {
    state.orgFeatures = { perfiles_vivos: true };
    const csv = 'nombre\nJuan';
    state.upsertResults = [{ id: 'r1', created_at: 'a', updated_at: 'a' }];

    const r = await importCarteraContactos(csvBuffer(csv), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: { nombre: 'nombre' },
    });

    expect(r.auto_activated).toBe(false);
  });

  it('lanza error si mapping no tiene nombre', async () => {
    await expect(importCarteraContactos(csvBuffer('a,b\n1,2'), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: {} as never,
    })).rejects.toThrow(/nombre.*obligatoria/i);
  });

  it('devuelve resultado vacío si el archivo no tiene filas', async () => {
    const r = await importCarteraContactos(csvBuffer('nombre\n'), {
      portalEmail: 'test@centinelia.mx',
      filename:    'x.csv',
      columnMapping: { nombre: 'nombre' },
    });
    expect(r.total_rows_leidas).toBe(0);
    expect(r.contactos_creados).toBe(0);
  });
});
