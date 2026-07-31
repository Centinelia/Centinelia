import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchHumanRequestNotification } from '@/lib/human-handoff/notify';

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
}

const MAX_REQUESTS_PER_INBOX = 3;

export async function pedirAHumano(
  args: PedirAHumanoArgs,
  ctx:  ExecCtx,
): Promise<PedirAHumanoResult> {
  const supabase = ctx.supabase ?? createAdminClient();

  // Kill switches
  if (process.env.HUMAN_HANDOFF_ENABLED === 'false') {
    return { ok: false, error: 'Handoff a humano deshabilitado globalmente' };
  }

  const agent = ctx.agent as Record<string, unknown> | undefined;
  const trustStage = (agent?.trust_stage as number | null) ?? 3;
  if (trustStage <= 1) {
    return { ok: false, error: 'Trust Stage 1 no permite pedir a humano' };
  }

  // Feature flag per-agente (default true si trust_stage >= 2)
  const features = (agent?.features as Record<string, unknown> | undefined) ?? {};
  if (features.human_handoff_enabled === false) {
    return { ok: false, error: 'Handoff a humano deshabilitado para este empleado' };
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

  // Org-level kill switch
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
      urgency:         args.urgency ?? 'media',
      needed_by:       args.needed_by ? new Date(args.needed_by).toISOString() : null,
      target_email:    targetEmail,
      target_type:     args.target,
      status:          'pending',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[pedir_a_humano] insert failed:', error);
    return { ok: false, error: 'No se pudo registrar la solicitud' };
  }

  // Dispatch notif (non-blocking)
  void dispatchHumanRequestNotification(data.id).catch(err =>
    console.error('[pedir_a_humano] notify failed:', err)
  );

  return { ok: true, request_id: data.id, target_email: targetEmail };
}
