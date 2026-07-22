import { NextRequest } from 'next/server';

export function requireVapiAuth(req: NextRequest): boolean {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (!secret) return true; // no secret configured → allow (matches inbound route behavior)
  return req.headers.get('x-vapi-secret') === secret;
}
