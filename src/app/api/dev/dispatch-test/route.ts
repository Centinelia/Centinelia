export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { dispatchEmail } from '@/lib/email/dispatcher';

// Endpoint dev-only para dry-run del dispatcher. Devuelve resultado sin
// consumir ops (sin pivotAgentId). BORRAR después de las pruebas E2E.
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'dev only' }, { status: 404 });
  }
  const body = await req.json() as {
    portalEmail: string;
    orgEmail:    string;
    message:     { from: string; to?: string; subject: string; body: string };
  };
  const result = await dispatchEmail({
    portalEmail: body.portalEmail,
    orgEmail:    body.orgEmail,
    message:     { ...body.message, id: `dev-${Date.now()}` },
  });
  return NextResponse.json(result);
}
