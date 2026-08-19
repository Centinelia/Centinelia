/**
 * Dropbox como FilesConnector — parte del set genérico junto a Google Drive y
 * OneDrive. Habilita search_files, read_file, save_to_drive, organize_files
 * también contra Dropbox cuando la org lo conecta desde el portal.
 *
 * Dropbox usa PATHS ('/Carpeta/archivo.xlsx') no IDs opacos. En este connector
 * el "fileId" del FilesConnector interface se interpreta como path — es lo que
 * Dropbox devuelve en list/search y lo que aceptan sus endpoints de modify.
 *
 * Sin email/contacts/calendar (Dropbox no ofrece esos productos).
 */
import { Dropbox } from 'dropbox';
import type { Connector, EmailConnector, FilesConnector, FileItem, UploadResult, FolderResult } from './types';
import { parseFileToText } from './parse';

class DropboxFiles implements FilesConnector {
  private db: Dropbox;

  constructor(accessToken: string) {
    this.db = new Dropbox({ accessToken, fetch });
  }

  async search(query: string): Promise<FileItem[]> {
    try {
      const res = await this.db.filesSearchV2({
        query,
        options: { max_results: 20, file_status: { '.tag': 'active' } },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (res.result.matches ?? []).flatMap((m: any) => {
        const meta = m.metadata?.metadata;
        if (!meta) return [];
        return [{
          id:       (meta.path_display ?? meta.path_lower ?? meta.name) as string,
          name:     meta.name as string,
          mimeType: guessMimeFromName(meta.name as string),
          isFolder: meta['.tag'] === 'folder',
        }];
      });
    } catch (err) {
      console.error('[dropbox/search]', err);
      return [];
    }
  }

  async read(fileId: string, mimeType: string): Promise<string> {
    const dl = await this.download(fileId, mimeType);
    if (!dl) return '';
    return parseFileToText(dl.buffer, dl.contentType);
  }

  async download(fileId: string, mimeType: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    try {
      const res = await this.db.filesDownload({ path: fileId });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bin = (res.result as any).fileBinary as ArrayBuffer | Buffer;
      const buffer = Buffer.isBuffer(bin) ? bin : Buffer.from(bin);
      return { buffer, contentType: mimeType || guessMimeFromName(fileId) };
    } catch (err) {
      console.error('[dropbox/download]', err);
      return null;
    }
  }

  async upload(filename: string, content: Buffer, _mimeType: string, folder?: string): Promise<UploadResult | null> {
    try {
      const path = normalizePath(folder ? `${folder}/${filename}` : `/${filename}`);
      const res = await this.db.filesUpload({
        path,
        contents: content,
        mode: { '.tag': 'overwrite' },
        autorename: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = res.result as any;
      // Genera un link temporal para compartir el archivo (evitar depender de sharing perms del team).
      let link = meta.path_display as string;
      try {
        const linkRes = await this.db.filesGetTemporaryLink({ path: meta.path_display });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        link = (linkRes.result as any).link as string;
      } catch {
        // Silent fallback — algunas apps en modo dev no pueden generar shared links.
      }
      return { id: meta.path_display, name: meta.name, link };
    } catch (err) {
      console.error('[dropbox/upload]', err);
      return null;
    }
  }

  async list(folderId?: string): Promise<FileItem[]> {
    try {
      const path = folderId ? normalizePath(folderId) : '';
      const res = await this.db.filesListFolder({ path });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.result.entries.map((e: any) => ({
        id:       (e.path_display ?? e.path_lower ?? e.name) as string,
        name:     e.name as string,
        mimeType: guessMimeFromName(e.name as string),
        isFolder: e['.tag'] === 'folder',
      }));
    } catch (err) {
      console.error('[dropbox/list]', err);
      return [];
    }
  }

  async move(fileId: string, destination: string): Promise<boolean> {
    try {
      await this.db.filesMoveV2({ from_path: fileId, to_path: normalizePath(destination) });
      return true;
    } catch (err) {
      console.error('[dropbox/move]', err);
      return false;
    }
  }

  async rename(fileId: string, newName: string): Promise<boolean> {
    try {
      const parent = fileId.split('/').slice(0, -1).join('/') || '/';
      const target = normalizePath(`${parent}/${newName}`);
      await this.db.filesMoveV2({ from_path: fileId, to_path: target });
      return true;
    } catch (err) {
      console.error('[dropbox/rename]', err);
      return false;
    }
  }

  async createFolder(name: string): Promise<FolderResult | null> {
    try {
      const res = await this.db.filesCreateFolderV2({ path: normalizePath(`/${name}`), autorename: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = (res.result as any).metadata;
      return { id: meta.path_display, name: meta.name };
    } catch (err) {
      console.error('[dropbox/createFolder]', err);
      return null;
    }
  }
}

function normalizePath(p: string): string {
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+/g, '/');
}

function guessMimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls:  'application/vnd.ms-excel',
    csv:  'text/csv',
    pdf:  'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc:  'application/msword',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    txt:  'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

// Stub email para satisfacer el shape del Connector. Dropbox no ofrece email,
// así que cualquier invocación throws. Los callers de email-sync solo llegan
// aquí con providers google/microsoft, nunca dropbox.
const dropboxEmailStub: EmailConnector = {
  async fetchUnread() { throw new Error('Dropbox no provee email'); },
  async send()        { throw new Error('Dropbox no provee email'); },
  async sendReply()   { throw new Error('Dropbox no provee email'); },
  async markRead()    { throw new Error('Dropbox no provee email'); },
};

export function createDropboxConnector(accessToken: string): Connector {
  return {
    provider: 'dropbox',
    email:    dropboxEmailStub,
    files:    new DropboxFiles(accessToken),
  };
}
