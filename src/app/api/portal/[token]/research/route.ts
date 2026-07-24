import { NextRequest, NextResponse } from 'next/server';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchMultiple, buildQueries, type ResearchType } from '@/lib/search/web';
import { rateLimit, limiters } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.scrape);
  if (rl) return rl;

  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_token', token)
    .eq('portal_email', auth.portalEmail)
    .single();
  if (!agent) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

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
