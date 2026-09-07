/**
 * DropboxClient - wrapper around the Dropbox SDK for billing file operations.
 *
 * orgKey (used by callers) is the organization's portal_email (TEXT), not a UUID.
 * The access token per org lives in organization_integrations.config.dropbox_token
 * and is passed in at construction time.
 *
 * All operations use service-level credentials; no user OAuth is involved here.
 */
import { Dropbox } from 'dropbox';

export interface DropboxEntry {
  name: string;
  path: string;
  isFile: boolean;
  size?: number;
  serverModified?: string;
}

export interface DropboxRevision {
  rev: string;
  serverModified: string;
}

export class DropboxClient {
  private dbx: Dropbox;

  constructor(accessToken: string) {
    // fetch is available globally in Node 18+ and in the Next.js edge/server runtime.
    this.dbx = new Dropbox({ accessToken, fetch });
  }

  /** Download a file and return its contents as a Buffer.
   *
   * Nota: `filesDownload` cambia la forma del `result` según entorno.
   *   - Node local: `result.fileBinary` = Buffer.
   *   - Node serverless con `fetch` pasado (Vercel): `result.fileBinary` puede
   *     ser undefined y el binario aparece como `fileBlob` (Blob), o en un
   *     stream del propio response. Fallback a fileBlob + arrayBuffer.
   */
  async readFile(path: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await this.dbx.filesDownload({ path });
    const bin = res.result?.fileBinary;
    if (bin) return Buffer.isBuffer(bin) ? bin : Buffer.from(bin);
    const blob = res.result?.fileBlob;
    if (blob && typeof blob.arrayBuffer === 'function') {
      return Buffer.from(await blob.arrayBuffer());
    }
    throw new Error(
      `DropboxClient.readFile: no binary field in response (keys: ${Object.keys(res.result ?? {}).join(',')})`,
    );
  }

  /**
   * Upload (overwrite) a file and return its canonical path_display.
   * Uses overwrite mode so callers do not need to delete first.
   */
  async writeFile(path: string, buffer: Buffer): Promise<string> {
    const res = await this.dbx.filesUpload({
      path,
      contents: buffer,
      mode: { '.tag': 'overwrite' },
      autorename: false,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.result as any).path_display as string;
  }

  /** List the immediate children of a folder. */
  async listFolder(path: string): Promise<DropboxEntry[]> {
    const res = await this.dbx.filesListFolder({ path });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.result.entries.map((e: any) => ({
      name: e.name,
      path: e.path_display,
      isFile: e['.tag'] === 'file',
      size: e.size,
      serverModified: e.server_modified,
    }));
  }

  /** Move or rename a file. */
  async moveFile(src: string, dst: string): Promise<void> {
    await this.dbx.filesMoveV2({ from_path: src, to_path: dst });
  }

  /** Return the revision history for a file, newest first. */
  async getFileVersions(path: string): Promise<DropboxRevision[]> {
    const res = await this.dbx.filesListRevisions({ path, mode: { '.tag': 'path' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.result.entries.map((e: any) => ({
      rev: e.rev,
      serverModified: e.server_modified,
    }));
  }

  /** Permanently delete a file or folder. */
  async deleteFile(path: string): Promise<void> {
    await (this.dbx as any).filesDeleteV2({ path });
  }
}
