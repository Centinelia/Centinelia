export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
interface Params { params: Promise<{ token: string }> }
export async function GET(_req: Request, _ctx: Params) { return NextResponse.redirect('/'); }
