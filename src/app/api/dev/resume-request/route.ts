// TEMPORAL: dispara resumeAgentAfterHumanResponse para un request_id específico.
// Solo funciona en NODE_ENV=development. Borrar cuando termine el backfill de Noah.

import { NextRequest, NextResponse } from 'next/server';
import { resumeAgentAfterHumanResponse } from '@/lib/human-handoff/resume';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'dev only' }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  try {
    await resumeAgentAfterHumanResponse(id);
    return NextResponse.json({ ok: true, resumed: id });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
