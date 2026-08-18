import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DropboxClient } from '../dropbox';

// Mock the Dropbox SDK entirely. The SDK uses CJS named exports.
// We provide a fake class that mimics the SDK's DropboxClient interface.
const mockDbx = {
  filesDownload: vi.fn().mockResolvedValue({
    result: { fileBinary: Buffer.from('hello') }
  }),
  filesUpload: vi.fn().mockResolvedValue({
    result: { id: 'id:abc', path_display: '/test.txt' }
  }),
  filesListFolder: vi.fn().mockResolvedValue({
    result: { entries: [{ '.tag': 'file', name: 'a.xlsx', path_display: '/folder/a.xlsx' }] }
  }),
  filesMoveV2: vi.fn().mockResolvedValue({ result: {} }),
  filesListRevisions: vi.fn().mockResolvedValue({
    result: { entries: [{ rev: 'r1', server_modified: '2026-08-17T10:00:00Z' }] }
  }),
  filesDeleteV2: vi.fn().mockResolvedValue({ result: {} }),
};

vi.mock('dropbox', () => {
  class Dropbox {
    constructor(_opts: unknown) {
      Object.assign(this, mockDbx);
    }
  }
  return { Dropbox };
});

describe('DropboxClient', () => {
  let client: DropboxClient;

  beforeEach(() => {
    client = new DropboxClient('fake-token');
  });

  it('readFile returns Buffer', async () => {
    const buf = await client.readFile('/test.txt');
    expect(buf.toString()).toBe('hello');
  });

  it('writeFile uploads and returns path', async () => {
    const path = await client.writeFile('/test.txt', Buffer.from('world'));
    expect(path).toBe('/test.txt');
  });

  it('listFolder returns entries', async () => {
    const entries = await client.listFolder('/folder');
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('a.xlsx');
  });

  it('moveFile completes without error', async () => {
    await expect(client.moveFile('/a', '/b')).resolves.not.toThrow();
  });

  it('getFileVersions returns revisions', async () => {
    const versions = await client.getFileVersions('/test.txt');
    expect(versions).toHaveLength(1);
    expect(versions[0].rev).toBe('r1');
  });

  it('deleteFile completes without error', async () => {
    await expect(client.deleteFile('/test.txt')).resolves.not.toThrow();
  });
});
