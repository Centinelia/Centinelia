export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { SKILL_PACKS, resolveOrgPackContext, resolveActivePacks, TOOL_TO_PACK } from '@/lib/tools/packs';
import { MEERKAT_VOICE_DISTRIBUTION } from '@/lib/vapi/sync';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved?.portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (resolved.portalEmail !== session.portalEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const ctx = await resolveOrgPackContext(resolved.portalEmail, supabase);
  const activePacks = Array.from(resolveActivePacks(ctx));

  /**
   * Counts distinct active meerkats (voice_agents rows) whose voice preset uses
   * at least one tool from each pack. In this codebase, a meerkat IS a voice_agents
   * row (1:1 mapping).
   */
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true);

  const meerkatsUsingPack: Record<string, number> = {};
  for (const p of SKILL_PACKS) meerkatsUsingPack[p.id] = 0;

  for (const a of (agents ?? [])) {
    const roleId = (a.features as Record<string, unknown> | null)?.meerkat_role_id as string | undefined;
    if (!roleId) continue;
    const preset = MEERKAT_VOICE_DISTRIBUTION[roleId] ?? [];
    const packsForThisMeerkat = new Set<string>();
    for (const tool of preset) {
      const packId = TOOL_TO_PACK[tool];
      if (packId) packsForThisMeerkat.add(packId);
    }
    for (const packId of packsForThisMeerkat) {
      meerkatsUsingPack[packId] = (meerkatsUsingPack[packId] ?? 0) + 1;
    }
  }

  // No serializar activeCheck (no es JSON-safe)
  const allPacks = SKILL_PACKS.map(({ activeCheck: _, ...rest }) => rest);

  return NextResponse.json({ activePacks, allPacks, meerkatsUsingPack });
}
