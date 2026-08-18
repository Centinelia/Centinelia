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
});
