import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchHumanRequestNotification } from '@/lib/human-handoff/notify';
import {
  tryClaimReportIntent, commitReportIntent, releaseReportIntent,
  formatDuplicateReportMessage,
} from '@/lib/ops/report-intent-lock';

export type ExecCtx = {
  agentId:        string;
  supabase?:      ReturnType<typeof createAdminClient>;
  agent?:         Record<string, unknown>;
  channel?:       'voice' | 'chat' | 'email';
  sourceInboxId?: string;
  sourceCallId?:  string;
  userContext?:   string;
};

export interface PedirAHumanoArgs {
  type:         'info' | 'action' | 'approval';
  target:       'approver' | 'owner' | 'specific';
  target_email?: string;
  title:        string;
  description:  string;
  urgency?:     'baja' | 'media' | 'alta';
  needed_by?:   string;
}

export interface PedirAHumanoResult {
  ok:           boolean;
  request_id?:  string;
  target_email?: string;
  error?:       string;
  deduped?:     boolean;
  message?:     string;
  already_claimed_by?: { agentId: string | null; agentName: string | null; claimedAt: string } | null;
}

const MAX_REQUESTS_PER_INBOX = 3;

export async function pedirAHumano(
  args: PedirAHumanoArgs,
  ctx:  ExecCtx,
): Promise<PedirAHumanoResult> {
  const supabase = ctx.supabase ?? createAdminClient();

  // Kill switches (hierarchical: broader scope first for defense-in-depth)
  if (process.env.HUMAN_HANDOFF_ENABLED === 'false') {
    return { ok: false, error: 'Handoff a humano deshabilitado globalmente' };
  }

  const agent = ctx.agent as Record<string, unknown> | undefined;

  // Org-level kill switch (per-org disable)
  if (agent?.portal_email) {
    const { data: org } = await supabase
      .from('organizations')
      .select('human_handoff_disabled_at')
      .eq('portal_email', agent.portal_email as string)
      .maybeSingle();
    if (org?.human_handoff_disabled_at) {
      return { ok: false, error: 'Handoff deshabilitado para esta organización' };
    }
  }

  // Feature flag per-agente (default true si trust_stage >= 2)
  const features = (agent?.features as Record<string, unknown> | undefined) ?? {};
  if (features.human_handoff_enabled === false) {
    return { ok: false, error: 'Handoff a humano deshabilitado para este empleado' };
  }

  const trustStage = (agent?.trust_stage as number | null) ?? 3;
  if (trustStage <= 1) {
    return { ok: false, error: 'Trust Stage 1 no permite pedir a humano' };
  }

  // Anti-loop
  if (ctx.sourceInboxId) {
    const { count } = await supabase
      .from('human_requests')
      .select('*', { count: 'exact', head: true })
      .eq('source_inbox_id', ctx.sourceInboxId);
    if ((count ?? 0) >= MAX_REQUESTS_PER_INBOX) {
      return {
        ok: false,
        error: `Ya solicitaste ayuda ${MAX_REQUESTS_PER_INBOX} veces para este correo. Procede con lo que tienes o cancela.`,
      };
    }
  }

  // Resolver target_email
  let targetEmail: string | null = null;
  if (args.target === 'approver') {
    targetEmail = ((agent?.approval_email as string | null) ?? (agent?.client_email as string | null)) ?? null;
  } else if (args.target === 'owner') {
    targetEmail = (agent?.client_email as string | null) ?? null;
  } else if (args.target === 'specific' && args.target_email) {
    targetEmail = args.target_email;
  }

  if (!targetEmail) {
    return { ok: false, error: 'No hay destinatario configurado para este agente' };
  }

  // ── Intent lock: dedupe cuando target=owner ──────────────────────────────
  // Nash usa escalar_al_owner (ya gated). Otros meerkats usan pedir_a_humano
  // con target='owner' — sin lock, dos meerkats podrían escalar el MISMO
  // asunto al owner en paralelo por vías distintas. Cablear aquí cierra el
  // hoyo. TTL 12h, alineado con escalar_al_owner. 'alta' bypasa (mismo
  // criterio que 'critical' en Nash).
  const portalEmail = (agent?.portal_email as string | null | undefined) ?? null;
  const urgency = args.urgency ?? 'media';
  const useLock = args.target === 'owner' && !!portalEmail && urgency !== 'alta';
  const lockClaim = useLock
    ? await tryClaimReportIntent({
        portalEmail: portalEmail!,
        kind:        'monitor_alert',
        target:      targetEmail,
        subject:     `pedir_a_humano owner :: ${args.title.slice(0, 120)}`,
        agentId:     ctx.agentId,
        agentName:   (agent?.agent_name as string | null | undefined) ?? null,
        ttlHours:    12,
        extraDedupe: args.description.slice(0, 400),
        sourceContext: {
          tool:      'pedir_a_humano',
          type:      args.type,
          urgency,
          channel:   ctx.channel ?? 'email',
        },
      })
    : { claimed: true, lockId: null, intentHash: '', alreadyClaimedBy: null };
  if (!lockClaim.claimed) {
    return {
      ok:      false,
      deduped: true,
      message: formatDuplicateReportMessage(lockClaim),
      already_claimed_by: lockClaim.alreadyClaimedBy,
    };
  }

  // INSERT
  const { data, error } = await supabase
    .from('human_requests')
    .insert({
      agent_id:        ctx.agentId,
      source_channel:  ctx.channel ?? 'email',
      source_inbox_id: ctx.sourceInboxId ?? null,
      source_call_id:  ctx.sourceCallId ?? null,
      source_context:  ctx.userContext?.slice(0, 500) ?? null,
      request_type:    args.type,
      title:           args.title.slice(0, 120),
      description:     args.description.slice(0, 2000),
      urgency,
      needed_by:       args.needed_by ? new Date(args.needed_by).toISOString() : null,
      target_email:    targetEmail,
      target_type:     args.target,
      status:          'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[pedir_a_humano] insert failed:', error);
    await releaseReportIntent(lockClaim.lockId);
    return { ok: false, error: 'No se pudo registrar la solicitud' };
  }

  await commitReportIntent(lockClaim.lockId);

  // Dispatch notif (non-blocking)
  void dispatchHumanRequestNotification(data.id).catch(err =>
    console.error('[pedir_a_humano] notify failed:', err)
  );

  return { ok: true, request_id: data.id, target_email: targetEmail };
}
