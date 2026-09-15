/**
 * GET /api/portal/[token]/social/metrics
 *
 * Agrega métricas de redes sociales desde social_metrics + content_drafts.
 * Para cada content_draft_id devuelve snapshots 24h/7d/30d.
 *
 * Filtros opcionales:
 *   ?agent_id=<uuid>
 *   ?since=<ISO timestamp>
 *
 * Respuesta: {
 *   ok: true,
 *   data: Array<{
 *     content_draft_id: string,
 *     published_permalink: string | null,
 *     snapshots: {
 *       '24h': { likes, comments, shares, reach, impressions } | null,
 *       '7d':  { ... } | null,
 *       '30d': { ... } | null,
 *     }
 *   }>
 * }
 *
 * Seguridad: session + IDOR + feature flag (via guardPortalSocialRequest).
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardPortalSocialRequest, isNextResponse } from '@/lib/social/portal-guards';

interface Params { params: Promise<{ token: string }> }

interface MetricSnapshot {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}

interface MetricRow {
  content_draft_id: string;
  published_permalink: string | null;
  snapshot_window: string;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const guard = await guardPortalSocialRequest(req, token);
  if (isNextResponse(guard)) return guard;
  const { resolved, supabase } = guard;

  const agentId = req.nextUrl.searchParams.get('agent_id');
  const since   = req.nextUrl.searchParams.get('since');

  // Obtener métricas uniendo con content_drafts para aplicar portal_email + filtros
  let q = supabase
    .from('social_metrics')
    .select('content_draft_id, published_permalink, snapshot_window, likes, comments, shares, reach, impressions, content_drafts!inner(portal_email, agent_id)')
    .eq('content_drafts.portal_email', resolved.portalEmail);

  if (agentId) {
    q = q.eq('content_drafts.agent_id', agentId);
  }
  if (since) {
    q = q.gte('captured_at', since);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agrupar por content_draft_id con snapshots 24h/7d/30d
  const byDraft = new Map<string, {
    published_permalink: string | null;
    snapshots: Record<string, MetricSnapshot>;
  }>();

  for (const row of (data ?? []) as MetricRow[]) {
    if (!byDraft.has(row.content_draft_id)) {
      byDraft.set(row.content_draft_id, {
        published_permalink: row.published_permalink,
        snapshots:           {},
      });
    }
    const entry    = byDraft.get(row.content_draft_id)!;
    const window   = row.snapshot_window;
    // Solo registrar ventanas conocidas (24h, 7d, 30d)
    if (['24h', '7d', '30d'].includes(window)) {
      entry.snapshots[window] = {
        likes:       row.likes,
        comments:    row.comments,
        shares:      row.shares,
        reach:       row.reach,
        impressions: row.impressions,
      };
    }
  }

  const result = Array.from(byDraft.entries()).map(([draftId, val]) => ({
    content_draft_id:    draftId,
    published_permalink: val.published_permalink,
    snapshots: {
      '24h': val.snapshots['24h'] ?? null,
      '7d':  val.snapshots['7d']  ?? null,
      '30d': val.snapshots['30d'] ?? null,
    },
  }));

  return NextResponse.json({ ok: true, data: result });
}
