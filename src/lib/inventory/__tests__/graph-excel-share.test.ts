// Regression 2026-10-01: provisioning dejaba `inventory_excel_config.onedrive_share_url`
// pero el adapter requería `location.itemId`. `resolveShareUrlToLocation` cierra
// el gap resolviendo el share link al driveItem canónico vía Graph API.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { encodeShareUrl, resolveShareUrlToLocation } from '../graph-excel';

afterEach(() => { vi.restoreAllMocks(); });

describe('encodeShareUrl', () => {
  it('aplica formato u!<base64url sin padding>', () => {
    const encoded = encodeShareUrl('https://example.com/doc?e=abc');
    expect(encoded.startsWith('u!')).toBe(true);
    expect(encoded).not.toMatch(/[=+/]/);
  });

  it('es reversible — decode produce la URL original', () => {
    const url = 'https://acproyectoshvac-my.sharepoint.com/:x:/g/personal/camila/foo?e=x';
    const encoded = encodeShareUrl(url).slice(2);
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    expect(Buffer.from(b64, 'base64').toString('utf-8')).toBe(url);
  });
});

describe('resolveShareUrlToLocation', () => {
  it('SharePoint con siteId → scope site con siteId y driveId', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'ITEM-123',
      parentReference: {
        driveId: 'b!DRIVE-abc',
        siteId:  'TENANT,SITE-def,WEB-ghi',
      },
    }), { status: 200 }));
    const loc = await resolveShareUrlToLocation('https://x.sharepoint.com/foo', 'tkn');
    expect(loc.itemId).toBe('ITEM-123');
    expect(loc.scope).toEqual({ type: 'site', siteId: 'TENANT,SITE-def,WEB-ghi', driveId: 'b!DRIVE-abc' });
  });

  it('OneDrive sin siteId (solo driveId) → scope site derivado del driveId', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'ITEM-123',
      parentReference: { driveId: 'b!DRIVE-abc' },
    }), { status: 200 }));
    const loc = await resolveShareUrlToLocation('https://onedrive.live.com/foo', 'tkn');
    expect(loc.itemId).toBe('ITEM-123');
    expect(loc.scope.type).toBe('site');
  });

  it('respuesta sin itemId → throw', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      parentReference: { driveId: 'b!x' },
    }), { status: 200 }));
    await expect(resolveShareUrlToLocation('https://x.com/foo', 'tkn')).rejects.toThrow(/itemId/);
  });

  it('response 401 (token inválido) → GraphExcelError con status 401', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(resolveShareUrlToLocation('https://x.com/foo', 'bad-tkn'))
      .rejects.toMatchObject({ status: 401 });
  });
});
