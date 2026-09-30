import { describe, it, expect, vi } from 'vitest';
import { scrapeWebsite } from '../website';

// Mock dns/promises.lookup para no depender de red real
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    // Hosts públicos → IP pública fake
    if (host === 'example.com') return [{ address: '93.184.216.34', family: 4 }];
    // Host que resuelve a metadata endpoint (DNS rebinding style)
    if (host === 'rebind.attacker.com') return [{ address: '169.254.169.254', family: 4 }];
    if (host === 'internal.corp') return [{ address: '10.0.0.5', family: 4 }];
    if (host === 'private.example') return [{ address: '192.168.1.1', family: 4 }];
    return [];
  }),
}));

describe('scrapeWebsite SSRF guards', () => {
  it('rechaza protocolo file:', async () => {
    expect(await scrapeWebsite('file:///etc/passwd')).toBeNull();
  });

  it('rechaza protocolo gopher:', async () => {
    expect(await scrapeWebsite('gopher://x/')).toBeNull();
  });

  it('rechaza IP literal IPv4 (169.254.169.254 metadata)', async () => {
    expect(await scrapeWebsite('http://169.254.169.254/latest/meta-data/')).toBeNull();
  });

  it('rechaza IP literal loopback', async () => {
    expect(await scrapeWebsite('http://127.0.0.1:5432/')).toBeNull();
  });

  it('rechaza IP literal IPv4 privada 10/8', async () => {
    expect(await scrapeWebsite('http://10.0.0.5/admin')).toBeNull();
  });

  it('rechaza IP literal IPv6 loopback ::1', async () => {
    expect(await scrapeWebsite('http://[::1]:8080/')).toBeNull();
  });

  it('rechaza hostname que resuelve a IP privada (10/8)', async () => {
    expect(await scrapeWebsite('http://internal.corp/admin')).toBeNull();
  });

  it('rechaza hostname que resuelve a metadata endpoint (169.254.169.254)', async () => {
    expect(await scrapeWebsite('http://rebind.attacker.com/')).toBeNull();
  });

  it('rechaza hostname que resuelve a 192.168', async () => {
    expect(await scrapeWebsite('http://private.example/')).toBeNull();
  });

  it('rechaza URL inválida', async () => {
    expect(await scrapeWebsite('not-a-url')).toBeNull();
  });
});
