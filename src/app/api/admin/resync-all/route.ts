import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { pushConversationalPromptsToAllAgents } from '@/lib/vapi/sync';


// POST /api/admin/resync-all
// Rebuilds and pushes every active agent's Vapi assistant config.
// Use after: prompt tier changes, HCP/CCE edits, meerkat personality updates,
// new conversational learnings, or any prompt-builder change that needs to propagate.
export async function POST() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start  = Date.now();
  const result = await pushConversationalPromptsToAllAgents();
  const ms     = Date.now() - start;

  return NextResponse.json({
    ok:      true,
    synced:  result.synced,
    errors:  result.errors,
    details: result.details,
    ms,
    message: `${result.synced} agentes sincronizados${result.errors ? `, ${result.errors} errores` : ''} en ${(ms / 1000).toFixed(1)}s`,
  });
}
