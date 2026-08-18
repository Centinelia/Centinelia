/**
 * SnapshotStorage - versioned backup layer for billing files using Supabase Storage.
 *
 * Bucket: billing-snapshots (private, service_role only)
 *
 * Key scheme:
 *   {orgKey}/{filePath without leading slash}/ver-{ISO timestamp}.{ext}
 *
 * orgKey is the organization's portal_email (TEXT), e.g. "empresa@example.com".
 * It is NOT a UUID. The caller maps org identity to portal_email before calling here.
 *
 * RLS: bucket is accessed exclusively via service_role (createAdminClient).
 * No user-level RLS policies are applied; isolation is enforced by the key prefix
 * which includes orgKey.
 */
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'billing-snapshots';

export interface SnapshotInfo {
  /** Full storage key, usable as the snapshotId in restoreSnapshot. */
  id: string;
  /** ISO-8601 timestamp string extracted from the filename. */
  timestamp: string;
  sizeBytes: number;
}

export class SnapshotStorage {
  private get supabase() {
    // createAdminClient() is called lazily so tests can mock the module cleanly.
    return createAdminClient();
  }

  /**
   * Create a versioned snapshot of a file.
   *
   * @param orgKey  - portal_email of the organization (e.g. "empresa@example.com")
   * @param filePath - absolute Dropbox-style path (e.g. "/CONTPAQi/Pendientes.xlsx")
   * @param buffer  - file contents
   * @returns storage key that uniquely identifies this snapshot version
   */
  async snapshot(orgKey: string, filePath: string, buffer: Buffer): Promise<string> {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = filePath.split('.').pop() ?? 'bin';
    const cleanPath = filePath.replace(/^\/+/, '');
    const key = `${orgKey}/${cleanPath}/ver-${ts}.${ext}`;

    const { error } = await this.supabase.storage.from(BUCKET).upload(key, buffer, {
      upsert: false,
      contentType: 'application/octet-stream',
    });
    if (error) throw error;
    return key;
  }

  /**
   * List all snapshots for a given file, sorted descending (newest first).
   *
   * @param orgKey  - portal_email
   * @param filePath - absolute path (e.g. "/CONTPAQi/Pendientes.xlsx")
   */
  async listSnapshots(orgKey: string, filePath: string): Promise<SnapshotInfo[]> {
    const cleanPath = filePath.replace(/^\/+/, '');
    const prefix = `${orgKey}/${cleanPath}`;

    const { data, error } = await this.supabase.storage.from(BUCKET).list(prefix);
    if (error) throw error;

    return ((data ?? []) as Array<{ name: string; metadata?: { size?: number } }>)
      .map(entry => {
        // Extract the ISO timestamp portion from "ver-YYYY-MM-DDTHH-mm-ss-sssZ.ext"
        const match = entry.name.match(/^ver-(.+)\.[^.]+$/);
        const rawTs = match ? match[1] : entry.name;
        // Convert hyphens back to colons/dots for the time part
        // Format: YYYY-MM-DDTHH-mm-ss-sss-000 -> restore partial ISO
        const timestamp = rawTs.replace(/T(\d{2})-(\d{2})-(\d{2})\./, 'T$1:$2:$3.')
          .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})-/, 'T$1:$2:$3.$4');

        return {
          id: `${prefix}/${entry.name}`,
          timestamp,
          sizeBytes: entry.metadata?.size ?? 0,
        };
      })
      .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1));
  }

  /**
   * Download and return a snapshot as a Buffer.
   *
   * @param snapshotId - the id returned by listSnapshots or snapshot()
   */
  async restoreSnapshot(snapshotId: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(BUCKET).download(snapshotId);
    if (error) throw error;
    const arrayBuf = await (data as Blob).arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Prune old snapshots, keeping only the N most recent.
   *
   * @param orgKey   - portal_email
   * @param filePath - absolute path
   * @param keepLast - number of snapshots to retain
   * @returns number of snapshots deleted
   */
  async pruneOldSnapshots(orgKey: string, filePath: string, keepLast: number): Promise<number> {
    const all = await this.listSnapshots(orgKey, filePath);
    const toDelete = all.slice(keepLast);
    if (toDelete.length === 0) return 0;

    const { error } = await this.supabase.storage.from(BUCKET).remove(toDelete.map(s => s.id));
    if (error) throw error;
    return toDelete.length;
  }
}
