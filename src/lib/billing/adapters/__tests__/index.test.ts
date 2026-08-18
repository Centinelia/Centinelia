/**
 * index.test.ts -- Tests para buildAdapter (adapter registry).
 *
 * DropboxClient se mockea via vi.mock para evitar red real.
 * Cubre: contpaqi completo, mock, type desconocido, contpaqi sin dropbox_token.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAdapter } from '../index';
import { CONTPAQiAdapter } from '../contpaqi';
import { MockBillingAdapter } from '../mock';

// Mock DropboxClient so CONTPAQiAdapter can be instantiated without a real token.
vi.mock('../../storage/dropbox', () => ({
  DropboxClient: class {
    constructor(_token: string) {}
    async readFile() { return Buffer.from(''); }
    async writeFile(_path: string) { return _path; }
    async listFolder() { return []; }
    async moveFile() {}
    async getFileVersions() { return []; }
    async deleteFile() {}
  },
}));

// ---------------------------------------------------------------------------
// Fixture: complete contpaqi config
// ---------------------------------------------------------------------------

const CONTPAQI_CONFIG = {
  type: 'contpaqi' as const,
  dropbox_token: 'test-token',
  dropbox_base_path: '/Centinelia/CONTPAQi',
  fiscal: {
    rfc_emisor: 'XAXX010101000',
    regimen_fiscal: '601',
    serie_default: 'A',
    uso_cfdi_default: 'G03',
    clave_sat_default_producto: '50161509',
  },
  scheduled_task: {
    expected_sync_interval_minutes: 15,
    stale_warning_minutes: 30,
    stale_escalation_hours: 6,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildAdapter', () => {
  it('type=contpaqi + config completo retorna CONTPAQiAdapter con name correcto', () => {
    const adapter = buildAdapter(CONTPAQI_CONFIG);
    expect(adapter).toBeInstanceOf(CONTPAQiAdapter);
    expect(adapter.name).toBe('CONTPAQi Comercial Pro');
  });

  it('type=mock retorna MockBillingAdapter con name=MockBillingAdapter', () => {
    const adapter = buildAdapter({ type: 'mock' } as any);
    expect(adapter).toBeInstanceOf(MockBillingAdapter);
    expect(adapter.name).toBe('MockBillingAdapter');
  });

  it('type desconocido lanza Error con mensaje que contiene el type', () => {
    expect(() => buildAdapter({ type: 'aspel' } as any)).toThrow(/aspel/);
  });

  it('type=contpaqi sin dropbox_token lanza Error', () => {
    const badConfig = { ...CONTPAQI_CONFIG, dropbox_token: undefined };
    expect(() => buildAdapter(badConfig as any)).toThrow();
  });
});
