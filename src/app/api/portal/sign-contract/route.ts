import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, limiters } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, limiters.auth);
  if (rl) return rl;

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('voice_agents')
    .update({ contract_accepted_at: new Date().toISOString(), contract_ip: ip })
    .eq('portal_token', token);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
