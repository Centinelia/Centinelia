import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { searchCatalog, _clearCatalogCache } from '../catalog';

// Mock supabase admin
const mockOrg = {
  access_token: 'test_token',
  refresh_token: null,
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  status: 'active',
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrg, error: null }),
          }),
        }),
      }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

// Mock Dropbox class
const mockRev = 'rev123';
const mockFileBuffer = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['SKU', 'Descripcion', 'Precio'],
    ['A-001', 'Tornillo hex 1/4"', '2.50'],
    ['A-002', 'Tuerca 1/4"', '0.80'],
    ['B-100', 'Cable calibre 12', '15.00'],
    ['B-101', 'Cable calibre 14', '12.00'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

let filesDownloadCalls = 0;
let filesGetMetadataCalls = 0;

vi.mock('dropbox', () => {
  class Dropbox {
    async filesDownload() {
      filesDownloadCalls++;
      return { result: { rev: mockRev, fileBinary: mockFileBuffer() } };
    }
    async filesGetMetadata() {
      filesGetMetadataCalls++;
      return { result: { rev: mockRev } };
    }
  }
  return { Dropbox };
});

describe('dropbox catalog parser + search', () => {
  beforeEach(() => {
    _clearCatalogCache();
    filesDownloadCalls = 0;
    filesGetMetadataCalls = 0;
  });

  const config = {
    doc_path:     '/Catalogo/codigos.xlsx',
    sku_column:   'SKU',
    desc_column:  'Descripcion',
    price_column: 'Precio',
  };

  it('parsea el excel y encuentra fuzzy por SKU', async () => {
    const res = await searchCatalog('org1@test.com', config, 'a-00');
    expect('matches' in res).toBe(true);
    if ('matches' in res) {
      expect(res.matches.length).toBe(2);
      expect(res.matches[0].sku).toBe('A-001');
      expect(res.matches[0].precio).toMatch(/^2\.5/);
    }
  });

  it('encuentra fuzzy por descripcion', async () => {
    const res = await searchCatalog('org1@test.com', config, 'cable');
    expect('matches' in res).toBe(true);
    if ('matches' in res) {
      expect(res.matches.length).toBe(2);
      expect(res.matches.every(m => m.descripcion.toLowerCase().includes('cable'))).toBe(true);
    }
  });

  it('match exacto solo por SKU cuando exact:true', async () => {
    const res = await searchCatalog('org1@test.com', config, 'a-001', { exact: true });
    expect('matches' in res).toBe(true);
    if ('matches' in res) {
      expect(res.matches.length).toBe(1);
      expect(res.matches[0].sku).toBe('A-001');
    }
  });

  it('no matches → matches vacio (no error)', async () => {
    const res = await searchCatalog('org1@test.com', config, 'zzzz-nada');
    expect('matches' in res).toBe(true);
    if ('matches' in res) {
      expect(res.matches.length).toBe(0);
    }
  });

  it('cache: segunda llamada dentro de TTL no re-descarga', async () => {
    await searchCatalog('org1@test.com', config, 'cable');
    await searchCatalog('org1@test.com', config, 'tornillo');
    expect(filesDownloadCalls).toBe(1);
    expect(filesGetMetadataCalls).toBe(0);
  });

  it('respeta price_column null cuando no aplica', async () => {
    const noPrice = { ...config, price_column: null };
    const res = await searchCatalog('org1@test.com', noPrice, 'a-001');
    if ('matches' in res) {
      expect(res.matches[0].precio).toBeUndefined();
    }
  });
});
