export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
interface Params { params: Promise<{ token: string }> }
export async function GET(_req: Request, _ctx: Params) { return NextResponse.json({ connected: false }); }
export async function DELETE(_req: Request, _ctx: Params) { return NextResponse.json({ ok: true }); }
