export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
interface Params { params: Promise<{ token: string; id: string }> }
export async function PATCH(_req: Request, _ctx: Params) { return NextResponse.json({ ok: true }); }
