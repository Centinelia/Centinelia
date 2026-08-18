import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnapshotStorage } from '../snapshot';

// Mock Supabase admin client.
// orgKey is portal_email (TEXT), not a UUID.
// SnapshotStorage uses createAdminClient() from @/lib/supabase/admin.
const mockRemove = vi.fn().mockResolvedValue({ error: null });

const mockStorageFrom = {
  upload: vi.fn().mockResolvedValue({ data: { path: 'org-1/CONTPAQi/Pendientes.xlsx/ver-2026-08-17T18-00-00.xlsx' }, error: null }),
  list: vi.fn().mockResolvedValue({
    data: [
      { name: 'ver-2026-08-17T18-00-00.000-000-000.xlsx', metadata: { size: 1024 } },
      { name: 'ver-2026-08-17T17-00-00.000-000-000.xlsx', metadata: { size: 900 } },
    ],
    error: null,
  }),
  download: vi.fn().mockResolvedValue({ data: new Blob(['content']), error: null }),
  remove: mockRemove,
};

const mockStorage = {
  from: vi.fn().mockReturnValue(mockStorageFrom),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: mockStorage }),
}));

describe('SnapshotStorage', () => {
  let storage: SnapshotStorage;

  beforeEach(() => {
    storage = new SnapshotStorage();
    vi.clearAllMocks();
    // Re-mock after clearAllMocks so the functions still resolve correctly.
    mockStorageFrom.upload.mockResolvedValue({
      data: { path: 'org-1/CONTPAQi/Pendientes.xlsx/ver-mock.xlsx' },
      error: null,
    });
    mockStorageFrom.list.mockResolvedValue({
      data: [
        { name: 'ver-2026-08-17T18-00-00.000-000-000.xlsx', metadata: { size: 1024 } },
        { name: 'ver-2026-08-17T17-00-00.000-000-000.xlsx', metadata: { size: 900 } },
      ],
      error: null,
    });
    mockStorageFrom.download.mockResolvedValue({ data: new Blob(['content']), error: null });
    mockRemove.mockResolvedValue({ error: null });
    mockStorage.from.mockReturnValue(mockStorageFrom);
  });

  it('snapshot uploads with timestamped key', async () => {
    const id = await storage.snapshot('org-1', '/CONTPAQi/Pendientes.xlsx', Buffer.from('data'));
    expect(id).toMatch(/^org-1\/CONTPAQi\/Pendientes\.xlsx\/ver-.+\.xlsx$/);
    expect(mockStorageFrom.upload).toHaveBeenCalled();
  });

  it('snapshot uses correct bucket', async () => {
    await storage.snapshot('org-1', '/CONTPAQi/Pendientes.xlsx', Buffer.from('data'));
    expect(mockStorage.from).toHaveBeenCalledWith('billing-snapshots');
  });

  it('listSnapshots returns versions sorted desc', async () => {
    const versions = await storage.listSnapshots('org-1', '/CONTPAQi/Pendientes.xlsx');
    expect(versions).toHaveLength(2);
    expect(versions[0].timestamp > versions[1].timestamp).toBe(true);
  });

  it('listSnapshots returns SnapshotInfo with id and sizeBytes', async () => {
    const versions = await storage.listSnapshots('org-1', '/CONTPAQi/Pendientes.xlsx');
    expect(versions[0]).toMatchObject({ id: expect.any(String), sizeBytes: expect.any(Number) });
  });

  it('restoreSnapshot returns Buffer', async () => {
    const buf = await storage.restoreSnapshot('org-1/CONTPAQi/Pendientes.xlsx/ver-2026-08-17T18-00-00.xlsx');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('content');
  });

  it('restoreSnapshot succeeds when expectedOrgKey matches prefix', async () => {
    const buf = await storage.restoreSnapshot(
      'org-1/CONTPAQi/Pendientes.xlsx/ver-2026-08-17T18-00-00.xlsx',
      'org-1',
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('restoreSnapshot throws when expectedOrgKey does not match prefix', async () => {
    await expect(
      storage.restoreSnapshot(
        'org-1/CONTPAQi/Pendientes.xlsx/ver-2026-08-17T18-00-00.xlsx',
        'org-99',
      ),
    ).rejects.toThrow('prefix mismatch');
  });

  it('restoreSnapshot accepts any snapshotId when expectedOrgKey is undefined (backwards compat)', async () => {
    // No expectedOrgKey: no guard, no throw
    const buf = await storage.restoreSnapshot('org-anything/path/ver-mock.xlsx');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('pruneOldSnapshots deletes excess snapshots', async () => {
    const deleted = await storage.pruneOldSnapshots('org-1', '/CONTPAQi/Pendientes.xlsx', 1);
    expect(deleted).toBe(1);
    expect(mockStorageFrom.remove).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
    );
  });

  it('pruneOldSnapshots returns 0 when nothing to prune', async () => {
    const deleted = await storage.pruneOldSnapshots('org-1', '/CONTPAQi/Pendientes.xlsx', 10);
    expect(deleted).toBe(0);
    expect(mockStorageFrom.remove).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // pruneAllSnapshotsForOrg — nested traversal
  // ---------------------------------------------------------------------------

  it('pruneAllSnapshotsForOrg recurses into sub-folders and only prunes where >keepLast versions exist', async () => {
    const ORG = 'empresa@test.com';

    // Build per-prefix responses for .list()
    const listResponses: Record<string, { name: string; id?: string | null }[]> = {
      // Top-level: two folders under the org key
      [ORG]: [
        { name: 'Ventas_diario', id: null },
        { name: 'Clientes_Periodicos', id: null },
      ],
      // Sub-level for Ventas_diario: two date folders (no ver- prefix → recurse deeper)
      [`${ORG}/Ventas_diario`]: [
        { name: '2026-01-01', id: null },
        { name: '2026-01-02', id: null },
      ],
      // Sub-level for Clientes_Periodicos: one RFC folder
      [`${ORG}/Clientes_Periodicos`]: [
        { name: 'RFC1', id: null },
      ],
      // Leaf level for Ventas_diario/2026-01-01: 4 ver- files → should prune (keepLast=2 → delete 2)
      [`${ORG}/Ventas_diario/2026-01-01`]: [
        { name: 'ver-2026-01-01T04-00-00-000.xlsx', id: 'id-1' },
        { name: 'ver-2026-01-01T03-00-00-000.xlsx', id: 'id-2' },
        { name: 'ver-2026-01-01T02-00-00-000.xlsx', id: 'id-3' },
        { name: 'ver-2026-01-01T01-00-00-000.xlsx', id: 'id-4' },
      ],
      // Leaf level for Ventas_diario/2026-01-02: 2 ver- files → nothing to prune (keepLast=2)
      [`${ORG}/Ventas_diario/2026-01-02`]: [
        { name: 'ver-2026-01-02T04-00-00-000.xlsx', id: 'id-5' },
        { name: 'ver-2026-01-02T03-00-00-000.xlsx', id: 'id-6' },
      ],
      // Leaf level for Clientes_Periodicos/RFC1: 3 ver- files → prune 1
      [`${ORG}/Clientes_Periodicos/RFC1`]: [
        { name: 'ver-2026-01-03T04-00-00-000.xlsx', id: 'id-7' },
        { name: 'ver-2026-01-03T03-00-00-000.xlsx', id: 'id-8' },
        { name: 'ver-2026-01-03T02-00-00-000.xlsx', id: 'id-9' },
      ],
    };

    mockStorageFrom.list.mockImplementation((prefix: string) => {
      const entries = listResponses[prefix];
      if (entries) return Promise.resolve({ data: entries, error: null });
      // Any unrecognised prefix returns empty (safe fallback)
      return Promise.resolve({ data: [], error: null });
    });

    // remove() is called by pruneOldSnapshots; just track calls
    mockRemove.mockResolvedValue({ error: null });

    const totalDeleted = await storage.pruneAllSnapshotsForOrg(ORG, 2);

    // Ventas_diario/2026-01-01: 4 files, keepLast=2 → 2 deleted
    // Ventas_diario/2026-01-02: 2 files, keepLast=2 → 0 deleted
    // Clientes_Periodicos/RFC1:  3 files, keepLast=2 → 1 deleted
    // Total: 3
    expect(totalDeleted).toBe(3);

    // remove() must have been called exactly twice (once per path that needed pruning)
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  it('pruneAllSnapshotsForOrg continues processing remaining folders when one sub-prefix list() call fails', async () => {
    const ORG = 'empresa@test.com';

    // Top-level: two folders
    const listResponses: Record<string, { data: { name: string; id?: string | null }[] | null; error: { message: string } | null }> = {
      [ORG]: { data: [{ name: 'FolderOK', id: null }, { name: 'FolderBAD', id: null }], error: null },
      // FolderBAD sub-list will error → should be skipped, not abort everything
      [`${ORG}/FolderOK`]: {
        data: [
          { name: 'ver-2026-01-01T04-00-00-000.xlsx', id: 'id-ok-1' },
          { name: 'ver-2026-01-01T03-00-00-000.xlsx', id: 'id-ok-2' },
          { name: 'ver-2026-01-01T02-00-00-000.xlsx', id: 'id-ok-3' },
        ],
        error: null,
      },
      [`${ORG}/FolderBAD`]: { data: null, error: { message: 'network timeout' } },
    };

    mockStorageFrom.list.mockImplementation((prefix: string) => {
      const resp = listResponses[prefix];
      if (resp) return Promise.resolve(resp);
      return Promise.resolve({ data: [], error: null });
    });

    mockRemove.mockResolvedValue({ error: null });

    // Should NOT throw even though FolderBAD errors
    const totalDeleted = await storage.pruneAllSnapshotsForOrg(ORG, 2);

    // FolderOK: 3 ver- files, keepLast=2 → prune 1
    // FolderBAD: list error → skipped (contributes 0)
    expect(totalDeleted).toBe(1);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
