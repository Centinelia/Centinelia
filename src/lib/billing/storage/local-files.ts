/**
 * LocalFilesStorage — misma forma que DropboxClient (readFile/writeFile) pero
 * hits disco local. Se usa para desarrollo/E2E de facturación cuando no queremos
 * depender del setup Dropbox del cliente.
 *
 * `basePath` es un directorio absoluto del filesystem; todos los `path` que llegan
 * son relativos-desde-Dropbox-root (empiezan con "/") y se resuelven contra basePath.
 */
import { promises as fs } from 'node:fs';
import { dirname, join, normalize, isAbsolute, resolve } from 'node:path';

export class LocalFilesStorage {
  private readonly base: string;

  constructor(basePath: string) {
    if (!isAbsolute(basePath)) {
      throw new Error(`LocalFilesStorage requires absolute basePath, got: ${basePath}`);
    }
    this.base = resolve(basePath);
  }

  private resolvePath(p: string): string {
    const cleaned = p.startsWith('/') ? p.slice(1) : p;
    const full = normalize(join(this.base, cleaned));
    if (!full.startsWith(this.base)) {
      throw new Error(`LocalFilesStorage refuses path escape: ${p}`);
    }
    return full;
  }

  async readFile(path: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(path));
  }

  async writeFile(path: string, buffer: Buffer): Promise<string> {
    const full = this.resolvePath(path);
    await fs.mkdir(dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return path;
  }
}
