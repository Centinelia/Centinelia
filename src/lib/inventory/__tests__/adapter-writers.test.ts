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

  it('throw si config.columns_historico.estatus no existe en headersMap (guard)', async () => {
    const { patchEstatusBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN']]);
    const badCtx = { ...CTX, config: { ...CTX.config, columns_historico: { ...CTX.config.columns_historico, estatus: 'INEXISTENTE' } } };
    await expect(patchEstatusBySerie(badCtx, '2619HA012345', 'SEPARADO')).rejects.toThrow(/no encontrada en headersMap/);
  });
});

describe('patchClienteBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('asigna cliente a serie en ALMACEN + marca SEPARADO por default', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS',null,null,'','','','','',null,null,null,null,'VEND','']]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'Mauricio Guerra', vendedor_codigo: 'ANA' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cliente_asignado).toBe('Mauricio Guerra');
      expect(r.estatus_resultante).toBe('SEPARADO');
      expect(r.patched_columns).toContain('CLIENTE');
      expect(r.patched_columns).toContain('ESTATUS');
    }
  });

  it('marcar_separado=false NO toca estatus', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS',null,null,'','','','','',null,null,null,null,'','']]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'X', marcar_separado: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.estatus_resultante).toBe('ALMACEN');
      expect(r.patched_columns).not.toContain('ESTATUS');
    }
  });

  it('rechaza conflict si cliente ya asignado + force=false', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; row[3] = 'SEPARADO'; row[HEADERS.indexOf('CLIENTE')] = 'Otro Cliente';
    await mockHeaders([row]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'Nuevo' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('cliente_assigned_conflict');
      expect(r.current_cliente).toBe('Otro Cliente');
    }
  });

  it('force=true permite reasignar cliente', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; row[3] = 'SEPARADO'; row[HEADERS.indexOf('CLIENTE')] = 'Otro Cliente';
    await mockHeaders([row]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'Nuevo', force: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cliente_asignado).toBe('Nuevo');
  });

  it('serie not found → serie_not_found', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([]);
    const r = await patchClienteBySerie(CTX, '2619HA012345', { cliente_nombre: 'X' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('serie_not_found');
  });

  it('throw si config.columns_historico.estatus no existe en headersMap (guard)', async () => {
    const { patchClienteBySerie } = await import('../adapter');
    await mockHeaders([['A1','4TXK','2619HA012345','ALMACEN','FLETEROS',null,null,'','','','','',null,null,null,null,'','']]);
    const badCtx = { ...CTX, config: { ...CTX.config, columns_historico: { ...CTX.config.columns_historico, estatus: 'INEXISTENTE' } } };
    await expect(patchClienteBySerie(badCtx, '2619HA012345', { cliente_nombre: 'X' })).rejects.toThrow(/no encontrada en headersMap/);
  });
});

describe('patchVentaBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calcula factor = precio / costo_mx (4 decimales)', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill('');
    row[2] = '2619HA012345'; row[HEADERS.indexOf('COSTO MX')] = 26013.15;
    await mockHeaders([row]);
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.factor_calculado).toBe(1.3455);
    }
  });

  it('respeta factor explícito del user', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345';
    await mockHeaders([row]);
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000, factor: 1.5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.factor_calculado).toBe(1.5);
  });

  it('sin costo_mx y sin factor explícito → cannot_compute_factor', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; // COSTO MX vacío
    await mockHeaders([row]);
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 35000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('cannot_compute_factor');
  });

  it('patch 4 celdas en una sesión (folio, fecha, precio, factor)', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill(''); row[2] = '2619HA012345'; row[HEADERS.indexOf('COSTO MX')] = 20000;
    await mockHeaders([row]);
    const gx = await import('../graph-excel');
    await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 30000, factura_venta: 'F-TEST' });
    expect((gx.patchCell as any).mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('no sobreescribe factura existente cuando input.factura_venta no se pasa (fix corrupcion silenciosa)', async () => {
    const { patchVentaBySerie } = await import('../adapter');
    const row = new Array(HEADERS.length).fill('');
    row[2] = '2619HA012345';
    row[HEADERS.indexOf('COSTO MX')] = 20000;
    row[HEADERS.indexOf('FACTURA')] = 'F-EXISTENTE-123';
    await mockHeaders([row]);
    const gx = await import('../graph-excel');
    const r = await patchVentaBySerie(CTX, '2619HA012345', { folio_venta: 'FV-1', fecha_venta: '2026-10-01', precio_unitario_mx: 30000 });
    expect(r.ok).toBe(true);
    // Inspect all patchCell calls — ninguna debe tocar la celda FACTURA
    const facturaColLetter = String.fromCharCode(65 + HEADERS.indexOf('FACTURA'));
    const touchedFactura = (gx.patchCell as any).mock.calls.some((call: unknown[]) => {
      const address = call[3] as string;
      return address.startsWith(facturaColLetter);
    });
    expect(touchedFactura).toBe(false);
    if (r.ok) {
      expect((r.after_state as Record<string, unknown>).FACTURA).toBe('F-EXISTENTE-123');
    }
  });
});
