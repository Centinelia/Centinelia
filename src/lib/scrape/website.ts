import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

/**
 * Bloquea rangos privados / loopback / link-local / metadata endpoints.
 * Rechaza:
 *   - Loopback (127.0.0.0/8, ::1)
 *   - Link-local (169.254.0.0/16, incluye 169.254.169.254 metadata AWS/GCP/Azure)
 *   - IPv4 private (10/8, 172.16-31/12, 192.168/16)
 *   - IPv6 unique local (fc00::/7)
 *   - Multicast, unspecified, wildcard
 *
 * Cubre las 3 SSRF principales: metadata endpoint cloud, servicios internos
 * de la red del container (Supabase local, admin dashboards), y localhost.
 */
function isPrivateAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 0) return true;   // no es IP válida → rechazar por seguridad

  if (family === 4) {
    const parts = addr.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true;   // multicast + reserved
    return false;
  }

  // IPv6
  const lower = addr.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;      // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;  // unique local
  if (lower.startsWith('ff')) return true;         // multicast
  // IPv4-mapped IPv6 (::ffff:169.254.169.254)
  const mapped = lower.match(/^::ffff:([\d.]+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

/**
 * Fetch de una URL controlada por usuario con hardening SSRF.
 * Rechaza:
 *   - Protocolos distintos a http/https
 *   - IPs literales en el host (defeat direct-IP bypass)
 *   - Hostnames que resuelven a IPs privadas (defeat DNS rebinding parcial)
 *   - Redirects (defeat 30x-to-metadata)
 */
export async function scrapeWebsite(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (isIP(parsed.hostname)) return null;   // no direct-IP

    const addrs = await lookup(parsed.hostname, { all: true });
    if (addrs.length === 0) return null;
    for (const a of addrs) {
      if (isPrivateAddress(a.address)) return null;
    }

    const res = await fetch(url, {
      signal:   AbortSignal.timeout(8000),
      redirect: 'error',
      headers:  { 'User-Agent': 'Mozilla/5.0 (compatible; Centinelia-Bot/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractText(html);
  } catch {
    return null;
  }
}

function extractText(html: string): string {
  return html
    .replace(/<(script|style|head|noscript|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}
