import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../graph-excel', () => ({
  listTableRows: vi.fn(),
  getTableHeader: vi.fn(),
}));

const BASE_CTX = {
  portalEmail: 'camila@acproyectos.com',
  token: 'fake-token',
  config: {
    location: { scope: { type: 'me' as const }, itemId: 'ITEM-1' },
    sheets: { historico: { name: 'INVENTARIO', table: 'Tabla6' },
              stock: { name: 'STOCK', header_row: 1, ideal_column: 'T', stock_column: 'J', modelo_column: 'H', propuesta_column: 'W' } },
    columns_historico: { serie: 'SERIE', modelo: 'MODELO', estatus: 'ESTATUS' },
    estatus_validos: ['ALMACEN'],
    bodegas_canonicas: ['FLETEROS'],
  },
};

async function setupMock(headers: string[], rows: unknown[][]) {
  const gx = await import('../graph-excel');
  vi.mocked(gx.getTableHeader).mockResolvedValue(headers);
  vi.mocked(gx.listTableRows).mockResolvedValue(rows.map((r, i) => ({ index: i, values: r })));
}

describe('findRowIndexBySerie', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('encuentra fila por serie match exacto', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE', 'MODELO'], [['2619HA012345', '4TXK']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('normaliza case y whitespace del input (Review Focus #1)', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE', 'MODELO'], [['2619HA012345', '4TXK']]);
    const result = await findRowIndexBySerie(BASE_CTX, '  2619ha012345  ');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('normaliza case y whitespace de la celda del Excel', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE', 'MODELO'], [['  2619ha012345  ', '4TXK']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('serie con / y + (Review Focus #5) match literal', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE'], [['2619/HA+01A'], ['OTRA']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619/HA+01A');
    expect(result?.tableRowIndex).toBe(0);
  });

  it('retorna null si no existe', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['SERIE'], [['OTRA']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result).toBeNull();
  });

  it('retorna headersMap con índice correcto por nombre', async () => {
    const { findRowIndexBySerie } = await import('../adapter');
    await setupMock(['OC', 'MODELO', 'SERIE', 'ESTATUS'], [['A1', '4TXK', '2619HA012345', 'ALMACEN']]);
    const result = await findRowIndexBySerie(BASE_CTX, '2619HA012345');
    expect(result?.headersMap).toEqual({ OC: 0, MODELO: 1, SERIE: 2, ESTATUS: 3 });
  });
});
