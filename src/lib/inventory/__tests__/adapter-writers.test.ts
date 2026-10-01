import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../graph-excel', () => ({
  listTableRows:  vi.fn(),
  getTableHeader: vi.fn(),
  addTableRow:    vi.fn(),
  withSession:    vi.fn(async (_token, _loc, fn) => fn({ id: 'session-1', persist: true, location: null })),
  patchCell:      vi.fn(),
  patchRange:     vi.fn(),
}));

const CTX = {
  portalEmail: 'camila@acproyectos.com',
  token: 't',
  config: {
    location: { scope: { type: 'me' as const }, itemId: 'ITEM-1' },
    sheets: { historico: { name: 'INVENTARIO', table: 'Tabla6' },
              stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
    columns_historico: {
      oc: 'OC', modelo: 'MODELO', serie: 'SERIE', estatus: 'ESTATUS',
      bodega: 'BODEGA', vendedor: 'VEND', cliente: 'CLIENTE',
      folio_venta: 'FOLIO', fecha_venta: 'FECHA DE VENTA',
      factura_venta: 'FACTURA', costo_venta_mx: 'COSTO VTA (MX)',
      tonelada: 'TON', usd: 'USD', tc: 'TC', costo_mx: 'COSTO MX',
      fecha_compra: 'FECHA COMPRA', folio_factura: 'FOLIO FACT', fecha_factura: 'FECHA FACT',
      descripcion: 'DESC', ref: 'REF', seer: 'SEER', volts: 'VOLTS',
    },
    estatus_validos:   ['ALMACEN', 'SEPARADO', 'ENTREGADO'],
    bodegas_canonicas: ['FLETEROS', 'CENIZO'],
  },
};

const HEADERS = ['OC','MODELO','SERIE','ESTATUS','BODEGA','TON','USD','TC','COSTO MX','FECHA COMPRA','FOLIO FACT','FECHA FACT','DESC','REF','SEER','VOLTS','VEND','CLIENTE','FOLIO','FECHA DE VENTA','FACTURA','COSTO VTA (MX)'];

async function mockHeaders(rows: unknown[][] = []) {
  const gx = await import('../graph-excel');
  (gx.getTableHeader as any).mockResolvedValue(HEADERS);
  (gx.listTableRows as any).mockResolvedValue(rows.map((r, i) => ({ index: i, values: r })));
}

describe('addEquipoRow', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('agrega equipo con tonelada ≤ 5 → bodega FLETEROS', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 3 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodega_asignada).toBe('FLETEROS');
  });

  it('tonelada > 5 → bodega CENIZO', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodega_asignada).toBe('CENIZO');
  });

  it('respeta bodega explícita sobre tonelada', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 10, bodega: 'FLETEROS' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bodega_asignada).toBe('FLETEROS');
  });

  it('calcula costo_mx = usd * tc (deterministic, 2 decimales)', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    let capturedRow: unknown[] = [];
    (gx.addTableRow as any).mockImplementation((_t: unknown, _l: unknown, _tbl: unknown, values: unknown[]) => {
      capturedRow = values;
      return Promise.resolve({ index: 10 });
    });
    await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345', tonelada: 3, usd: 1500, tc: 17.3421 });
    const costoMxIdx = HEADERS.indexOf('COSTO MX');
    expect(capturedRow[costoMxIdx]).toBe(26013.15);
  });

  it('rechaza si serie ya existe (serie_already_exists)', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN']]);
    const r = await addEquipoRow(CTX, { oc: 'A2', modelo: '4TXK', serie: '2619HA012345' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('serie_already_exists');
      expect(r.existing_row_index).toBe(0);
    }
  });

  it('estatus arranca en ALMACEN', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    let capturedRow: unknown[] = [];
    (gx.addTableRow as any).mockImplementation((_t: unknown, _l: unknown, _tbl: unknown, values: unknown[]) => {
      capturedRow = values;
      return Promise.resolve({ index: 10 });
    });
    await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345' });
    const estatusIdx = HEADERS.indexOf('ESTATUS');
    expect(capturedRow[estatusIdx]).toBe('ALMACEN');
  });

  it('after_state contiene el row completo que se insertó (Review Focus #2 multi-tenant)', async () => {
    const { addEquipoRow } = await import('../adapter');
    await mockHeaders([]);
    const gx = await import('../graph-excel');
    (gx.addTableRow as any).mockResolvedValue({ index: 10 });
    const r = await addEquipoRow(CTX, { oc: 'A1', modelo: '4TXK', serie: '2619HA012345' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.after_state).toHaveProperty('OC', 'A1');
      expect(r.after_state).toHaveProperty('SERIE', '2619HA012345');
      expect(r.after_state).toHaveProperty('ESTATUS', 'ALMACEN');
    }
  });
});

describe('patchEstatusBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cambia estatus ALMACEN → SEPARADO', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS']]);
    const gx = await import('../graph-excel');
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'SEPARADO');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estatus_anterior).toBe('ALMACEN');
      expect(r.estatus_nuevo).toBe('SEPARADO');
    }
    expect(gx.patchCell).toHaveBeenCalledOnce();
  });

  it('serie not found → ok:false con code serie_not_found', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','OTRA','ALMACEN']]);
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'SEPARADO');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('serie_not_found');
  });

  it('estatus actual == nuevo → no_op true, NO llama patchCell', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN']]);
    const gx = await import('../graph-excel');
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'ALMACEN');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.no_op).toBe(true);
    expect(gx.patchCell).not.toHaveBeenCalled();
  });

  it('before_state captura la row completa antes del patch (Review Focus #3 race con Tania)', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS']]);
    const r = await patchEstatusBySerie(CTX, '2619HA012345', 'SEPARADO');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.before_state).toMatchObject({ OC: 'A1', SERIE: '2619HA012345', ESTATUS: 'ALMACEN' });
      expect(r.after_state).toMatchObject({ ESTATUS: 'SEPARADO' });
    }
  });
});
