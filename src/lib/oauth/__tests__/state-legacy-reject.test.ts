import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyOAuthState, issueOAuthState } from '../state';

function makeReq(cookies: Record<string, string> = {}): NextRequest {
  const req = new NextRequest('http://localhost/api/callback');
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  return req;
}

describe('verifyOAuthState — legacy state hard reject', () => {
  it('rechaza state sin "." (legacy format) — antes se aceptaba con warning', () => {
    const req = makeReq({ oauth_state: 'qb:abc' });
    const res = verifyOAuthState(req, 'qb', 'portal_token_sin_nonce');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('malformed_state');
  });

  it('rechaza state con "." pero sin nonce válido', () => {
    const req = makeReq({ oauth_state: 'qb:abc' });
    const res = verifyOAuthState(req, 'qb', '.');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('malformed_state');
  });

  it('rechaza cuando no hay cookie oauth_state', () => {
    const issued = issueOAuthState('qb', 'my_token');
    const req = makeReq({});   // sin cookie
    const res = verifyOAuthState(req, 'qb', issued.state);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('no_cookie');
  });

  it('rechaza cuando cookie provider no coincide', () => {
    const issued = issueOAuthState('qb', 'my_token');
    const req = makeReq({ oauth_state: `notion:${issued.cookieValue.split(':')[1]}` });
    const res = verifyOAuthState(req, 'qb', issued.state);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('nonce_mismatch');
  });

  it('rechaza cuando nonce no coincide', () => {
    const issued = issueOAuthState('qb', 'my_token');
    const req = makeReq({ oauth_state: 'qb:otro_nonce_distinto' });
    const res = verifyOAuthState(req, 'qb', issued.state);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('nonce_mismatch');
  });

  it('acepta cuando state + cookie coinciden', () => {
    const issued = issueOAuthState('qb', 'my_token');
    const req = makeReq({ oauth_state: issued.cookieValue });
    const res = verifyOAuthState(req, 'qb', issued.state);
    expect(res.ok).toBe(true);
    expect(res.portalToken).toBe('my_token');
  });
});
