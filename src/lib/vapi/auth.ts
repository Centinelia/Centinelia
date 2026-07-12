import { NextRequest } from 'next/server';

export function requireVapiAuth(req: NextRequest): boolean {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (!secret) return false;
  return req.headers.get('x-vapi-secret') === secret;
}
