export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
interface Params { params: Promise<{ token: string }> }
export async function GET(_req: Request, _ctx: Params) { return NextResponse.json({ recs: [], mode: 'llm', agentCount: 1, weekStart: '' }); }
export async function PATCH(_req: Request, _ctx: Params) { return NextResponse.json({ ok: true }); }
export async function POST(_req: Request, _ctx: Params) { return NextResponse.json({ ok: true, recs: [], generated: 0 }); }
