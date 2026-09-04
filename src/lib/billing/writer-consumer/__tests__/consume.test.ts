/**
 * consume.test.ts — tests para consumeErrores / consumeTimbrados con
 * un DropboxClient mock (in-memory). Verifica:
 *   - errors path lee JSON, dispara callbacks correctos por kind, mueve a consumidos
 *   - timbrados path envía CFDI y mueve a entregados; si no correlaciona, deja
 *   - JSON malformado se skipea sin frenar el batch
 *   - errores de red no se mueven (reintento en próximo tick)
 *   - extractBasenameFromTimbrado quita el sufijo _serie+folio
 */
import { describe, it, expect, vi } from 'vitest';
import {
  consumeErrores, consumeTimbrados, extractBasenameFromTimbrado,
} from '../consume';
import type { DropboxEntry, DropboxRevision } from '../../storage/dropbox';

// ---- Dropbox mock ------------------------------------------------------------

class MockDropbox {
  files = new Map<string, Buffer>(); // path → contenido

  seed(path: string, content: string | Buffer) {
    this.files.set(path, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
  }

  async listFolder(path: string): Promise<DropboxEntry[]> {
    const prefix = path.endsWith('/') ? path : path + '/';
    const entries: DropboxEntry[] = [];
    for (const [p] of this.files) {
      if (!p.startsWith(prefix)) continue;
      const rel = p.slice(prefix.length);
      if (rel.includes('/')) continue; // solo hijos inmediatos
      entries.push({ name: rel, path: p, isFile: true, size: 0, serverModified: '2026-09-04T00:00:00Z' });
    }
    if (entries.length === 0 && !this.files.has(path)) {
      throw new Error('folder not found: ' + path);
    }
    return entries;
  }

  async readFile(path: string): Promise<Buffer> {
    const buf = this.files.get(path);
    if (!buf) throw new Error('not found: ' + path);
    return buf;
  }

  async writeFile(path: string, buf: Buffer): Promise<string> {
    this.files.set(path, buf);
    return path;
  }

  async moveFile(src: string, dst: string): Promise<void> {
    const buf = this.files.get(src);
    if (!buf) throw new Error('src not found: ' + src);
    this.files.delete(src);
    this.files.set(dst, buf);
  }

  async getFileVersions(_path: string): Promise<DropboxRevision[]> { return []; }
  async deleteFile(path: string): Promise<void> { this.files.delete(path); }
}

const BASE = '/tortilleria/Importables_CONTPAQi';

function buildBatchReport(basename: string): string {
  return JSON.stringify({
    sourceFile: `${basename}.xml`,
    processedAt: '2026-09-04T00:00:00Z',
    allOk: false,
    results: [
      { index: 0, rfc: 'XAXX010101000', ok: true, serie: 'FTEN', folio: 12, uuid: '00000000-abc', timbradoPath: `${basename}_FTEN12.xml`, kind: 'other', humanMessage: null, error: null },
      { index: 1, rfc: 'RFCGHOST', ok: false, serie: 'FTEN', folio: 0, uuid: null, timbradoPath: null, kind: 'rfcNotFound', humanMessage: 'RFC ghost', error: 'tech' },
      { index: 2, rfc: 'XAXX010101000', ok: false, serie: 'FTEN', folio: 0, uuid: null, timbradoPath: null, kind: 'pacError', humanMessage: 'PAC timeout', error: 'tech' },
      { index: 3, rfc: 'XAXX010101000', ok: false, serie: 'FTEN', folio: 0, uuid: null, timbradoPath: null, kind: 'catalogAccess', humanMessage: 'SQL down', error: 'tech' },
    ],
  });
}

// ---- consumeErrores -----------------------------------------------------------

describe('consumeErrores', () => {
  it('dispatches per kind and moves report + original xml to consumidos/', async () => {
    const drop = new MockDropbox();
    drop.seed(`${BASE}/errores/facturas_2026-09-03_abc.json`, buildBatchReport('facturas_2026-09-03_abc'));
    drop.seed(`${BASE}/errores/facturas_2026-09-03_abc.xml`, '<Documentos/>');

    const replyToClient    = vi.fn().mockResolvedValue(undefined);
    const redepositPending = vi.fn().mockResolvedValue(undefined);
    const escalate         = vi.fn().mockResolvedValue(undefined);
    const log              = vi.fn();

    const result = await consumeErrores({
      dropbox: drop as any, basePath: BASE,
      replyToClient, redepositPending, escalate, log,
    });

    expect(result).toEqual({ processed: 1, skipped: 0, errors: 0 });
    expect(replyToClient).toHaveBeenCalledTimes(1);
    expect(replyToClient.mock.calls[0][1].kind).toBe('rfcNotFound');
    expect(redepositPending).toHaveBeenCalledTimes(1);
    expect(escalate).toHaveBeenCalledTimes(1);
    expect(escalate.mock.calls[0][1].kind).toBe('catalogAccess');

    // Originales removidos, consumidos poblados.
    expect(drop.files.has(`${BASE}/errores/facturas_2026-09-03_abc.json`)).toBe(false);
    expect(drop.files.has(`${BASE}/errores/facturas_2026-09-03_abc.xml`)).toBe(false);
    expect(drop.files.has(`${BASE}/errores/consumidos/facturas_2026-09-03_abc.json`)).toBe(true);
    expect(drop.files.has(`${BASE}/errores/consumidos/facturas_2026-09-03_abc.xml`)).toBe(true);
  });

  it('empty folder is not an error', async () => {
    const drop = new MockDropbox();
    const result = await consumeErrores({
      dropbox: drop as any, basePath: BASE,
      replyToClient: vi.fn(), redepositPending: vi.fn(), escalate: vi.fn(), log: vi.fn(),
    });
    expect(result).toEqual({ processed: 0, skipped: 0, errors: 0 });
  });

  it('malformed json is skipped and moved to consumidos', async () => {
    const drop = new MockDropbox();
    drop.seed(`${BASE}/errores/broken.json`, '{{not json');
    const log = vi.fn();

    const result = await consumeErrores({
      dropbox: drop as any, basePath: BASE,
      replyToClient: vi.fn(), redepositPending: vi.fn(), escalate: vi.fn(), log,
    });
    expect(result.skipped).toBe(1);
    expect(drop.files.has(`${BASE}/errores/consumidos/broken.json`)).toBe(true);
    expect(log).toHaveBeenCalledWith('warn', expect.any(String), expect.any(Object));
  });

  it('a failing dropbox read leaves the file for next tick', async () => {
    const drop = new MockDropbox();
    drop.seed(`${BASE}/errores/x.json`, buildBatchReport('x'));
    // Sabotea readFile.
    drop.readFile = async () => { throw new Error('dropbox 500'); };

    const result = await consumeErrores({
      dropbox: drop as any, basePath: BASE,
      replyToClient: vi.fn(), redepositPending: vi.fn(), escalate: vi.fn(), log: vi.fn(),
    });
    expect(result.errors).toBe(1);
    // El archivo NO se movió.
    expect(drop.files.has(`${BASE}/errores/x.json`)).toBe(true);
  });
});

// ---- consumeTimbrados ---------------------------------------------------------

describe('consumeTimbrados', () => {
  it('delivers CFDI and moves to entregados/ when correlation exists', async () => {
    const drop = new MockDropbox();
    drop.seed(`${BASE}/timbrados/facturas_2026-09-03_abc_FTEN12.xml`, '<cfdi/>');
    const deliverCfdi = vi.fn().mockResolvedValue(true);

    const result = await consumeTimbrados({
      dropbox: drop as any, basePath: BASE, deliverCfdi, log: vi.fn(),
    });
    expect(result).toEqual({ processed: 1, skipped: 0, errors: 0 });
    expect(deliverCfdi).toHaveBeenCalledWith('facturas_2026-09-03_abc', expect.any(Buffer));
    expect(drop.files.has(`${BASE}/timbrados/entregados/facturas_2026-09-03_abc_FTEN12.xml`)).toBe(true);
  });

  it('leaves the file when correlation is missing (deliverCfdi returns false)', async () => {
    const drop = new MockDropbox();
    drop.seed(`${BASE}/timbrados/x_A1.xml`, '<cfdi/>');
    const deliverCfdi = vi.fn().mockResolvedValue(false);

    const result = await consumeTimbrados({
      dropbox: drop as any, basePath: BASE, deliverCfdi, log: vi.fn(),
    });
    expect(result.skipped).toBe(1);
    expect(drop.files.has(`${BASE}/timbrados/x_A1.xml`)).toBe(true);
  });
});

// ---- helpers ------------------------------------------------------------------

describe('extractBasenameFromTimbrado', () => {
  it.each([
    ['facturas_2026-09-03_abc12345_FTEN12.xml', 'facturas_2026-09-03_abc12345'],
    ['batch_FT7.xml',                            'batch'],
    ['x_A1.xml',                                 'x'],
  ])('%s → %s', (input, expected) => {
    expect(extractBasenameFromTimbrado(input)).toBe(expected);
  });
});
