import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { searchMultiple, buildQueries, type ResearchType } from '@/lib/search/web';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { topic, location = '', type = 'leads', keywords = [] } = await req.json() as {
    topic:     string;
    location?: string;
    type?:     ResearchType;
    keywords?: string[];
  };

  if (!topic?.trim()) return NextResponse.json({ error: 'El tema es requerido' }, { status: 400 });

  if (!process.env.BRAVE_SEARCH_API_KEY) {
    return NextResponse.json({ error: 'BRAVE_SEARCH_API_KEY no configurada' }, { status: 503 });
  }

  const queries = buildQueries(topic.trim(), location.trim(), type, keywords);
  const results = await searchMultiple(queries, 8);

  return NextResponse.json({ results: results.slice(0, 25), total: results.length });
}
