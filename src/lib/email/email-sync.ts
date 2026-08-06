import { createAdminClient } from '@/lib/supabase/admin';
import { processInboxEmail } from '@/lib/ops/inbox-processor';
import { getConnector, type IntegrationRow } from '@/lib/connectors';
import { dispatchEmail, type DispatchResult } from '@/lib/email/dispatcher';
import { quickClassifyEmail } from '@/lib/ops/email-quick-classify';
import { EMAIL_BODY_TRUNCATE_CHARS } from '@/lib/constants';

type EmailIntegration = IntegrationRow & {
  agent_id:     string;
  email:        string;
  auto_reply:   boolean;
  last_sync_at: string | null;
};

export type AutoMode = 'observador' | 'off' | 'auto' | 'always';

interface ResolveAutoModeInput {
  trust_stage: number | null;       // voice_agents.trust_stage (1=Observador, 2=Supervisado, 3=Autónomo)
  orgDisabled: boolean;             // organizations.auto_mode_disabled_at IS NOT NULL
}

/**
 * Kill switch global. Antes hacía strict `=== 'false'`, lo que provocaba que
 * `AUTO_MODE_CLASSIFIER_ENABLED=off` (o `'0'`, `'no'`, `'False'`) NO deshabilitara
 * como el operador esperaba. Aceptamos ahora los valores comunes de disable.
 * Default (undefined) sigue siendo enabled — es el comportamiento intencional.
 */
export function isAutoModeClassifierDisabled(): boolean {
  const raw = process.env.AUTO_MODE_CLASSIFIER_ENABLED?.trim().toLowerCase();
  if (raw === undefined || raw === '') return false;
  return ['false', 'off', '0', 'no', 'disabled'].includes(raw);
}

/**
 * Resuelve el modo efectivo del agente. Un solo eje de autonomía: Trust Stage.
 *   Stage 1 (Observador) → 'observador': triage-only (categoría + resumen), sin borrador
 *   Stage 2 (Supervisado) → 'off': redacta borrador, siempre a aprobación humana
 *   Stage 3 (Autónomo, default) → 'auto': classifier decide send/human/block
 *
 * Overrides (fuerzan 'off'):
 *   1. env AUTO_MODE_CLASSIFIER_ENABLED disabled (kill switch global — ver helper)
 *   2. orgDisabled (kill switch per-org via organizations.auto_mode_disabled_at)
 *
 * NOTA: el override legacy `auto_reply === false` fue removido — no podía distinguir
 * "cliente lo apagó explícitamente" de "migration default lo puso false", lo que causaba
 * que TODOS los agentes cayeran a 'off' aunque trust_stage=3.
 */
export function resolveAutoMode(input: ResolveAutoModeInput): AutoMode {
  if (isAutoModeClassifierDisabled()) return 'off';
  if (input.orgDisabled) return 'off';

  const stage = input.trust_stage ?? 3;
  if (stage <= 1) return 'observador';
  if (stage === 2) return 'off';
  return 'auto';
}

export async function syncAllEmailIntegrations(): Promise<{ synced: number; errors: number }> {
  const supabase = createAdminClient();

  const { data: integrations } = await supabase
    .from('email_integrations')
    .select('*')
    .order('last_sync_at', { ascending: true, nullsFirst: true });

  if (!integrations?.length) return { synced: 0, errors: 0 };

  let synced = 0; let errors = 0;

  for (const integration of integrations as EmailIntegration[]) {
    try {
      await syncIntegration(integration, supabase);
      synced++;
    } catch (err) {
      console.error(`[email-sync] error for ${integration.id}:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

async function syncIntegration(integration: EmailIntegration, supabase: ReturnType<typeof createAdminClient>) {
  const conn = await getConnector(integration, supabase);

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, agent_name, client_email, portal_token, role_knowledge_base, role, portal_email, approval_email, auto_reply, trust_stage, features')
    .eq('id', integration.agent_id)
    .single();

  const { data: orgData } = agent?.portal_email
    ? await supabase.from('organizations').select('knowledge_base, auto_mode_disabled_at').eq('portal_email', agent.portal_email).single()
    : { data: null };
  const knowledge_base = orgData?.knowledge_base ?? null;
  const orgDisabled    = !!(orgData as Record<string, unknown> | null)?.auto_mode_disabled_at;

  const autoMode = resolveAutoMode({
    trust_stage: (agent as Record<string, unknown>).trust_stage as number | null,
    orgDisabled,
  });

  if (!agent?.client_email) return;

  const since = integration.last_sync_at
    ? new Date(integration.last_sync_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const messages = await conn.email.fetchUnread(since);

  const syncedAt = new Date().toISOString();
  await supabase.from('email_integrations')
    .update({ last_sync_at: syncedAt })
    .eq('id', integration.id);

  // Sync last_sync_at to integration_accounts so the portal UI shows fresh data
  if (agent.portal_email) {
    const { data: ia } = await supabase
      .from('integration_accounts')
      .select('metadata')
      .eq('portal_email', agent.portal_email)
      .eq('provider', integration.provider)
      .maybeSingle();
    const meta = (ia?.metadata as Record<string, unknown>) ?? {};
    await supabase.from('integration_accounts')
      .update({ metadata: { ...meta, last_sync_at: syncedAt } })
      .eq('portal_email', agent.portal_email)
      .eq('provider', integration.provider);
  }

  for (const msg of messages) {
    // Guard against re-processing emails whose markRead silently failed on a prior sync
    const { data: existing } = await supabase
      .from('ops_inbox')
      .select('id')
      .eq('agent_id', agent.id)
      .eq('raw_message_id', msg.id)
      .maybeSingle();

    if (existing) {
      await conn.email.markRead(msg.id).catch((err) =>
        console.error(`[email-sync] markRead retry failed for ${msg.id}:`, err)
      );
      continue;
    }

    // Detect thread reply: dos casos distintos.
    //   (1) status='info_requested' → reusar row existente (Sofía pidió info al cliente y este responde)
    //   (2) status IN ('pending','escalated') o human_request activo → NO reusar row, pero MARCAR client_replied_at
    //       en ambas tablas para advertir al humano que el draft/escalación puede estar desactualizada
    let existingInboxId: string | undefined;
    let originalEmailBody: string | undefined;
    if (msg.threadId) {
      // Caso 1: info_requested — reusar row para continuar el hilo
      const { data: infoThread } = await supabase
        .from('ops_inbox')
        .select('id, email_body')
        .eq('agent_id', agent.id)
        .eq('thread_id', msg.threadId)
        .eq('status', 'info_requested')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (infoThread) {
        existingInboxId   = infoThread.id as string;
        originalEmailBody = infoThread.email_body as string;
      } else {
        // Caso 2: pending o escalated. NO reusamos, pero marcamos advertencia.
        const nowIso = new Date().toISOString();
        const { data: activeThread } = await supabase
          .from('ops_inbox')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('thread_id', msg.threadId)
          .in('status', ['pending', 'escalated'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeThread) {
          await supabase
            .from('ops_inbox')
            .update({ client_replied_at: nowIso })
            .eq('id', activeThread.id);

          // Human requests ligados a ese ops_inbox también reciben la advertencia
          await supabase
            .from('human_requests')
            .update({ client_replied_at: nowIso })
            .eq('source_inbox_id', activeThread.id)
            .in('status', ['pending', 'escalated']);
        }
      }
    }

    await conn.email.markRead(msg.id).catch((err) =>
      console.error(`[email-sync] markRead failed for ${msg.id}:`, err)
    );

    await processInboxEmail({
      agentId:           agent.id,
      source:            integration.provider,
      rawMessageId:      msg.id,
      threadId:          msg.threadId,
      emailFrom:         msg.from,
      emailSubject:      msg.subject,
      emailBody:         msg.body,
      attachments:       [],
      agentName:         (agent.agent_name as string | null) ?? 'Centinelia',
      businessName:      agent.business_name as string,
      knowledgeBase:     knowledge_base,
      roleKB:            agent.role_knowledge_base as string | null,
      agentRole:         agent.role as string | null,
      ownerEmail:        agent.client_email as string,
      portalToken:       agent.portal_token as string,
      portalEmail:       agent.portal_email as string | undefined,
      autoMode,
      approvalEmail:     (agent as Record<string, unknown>).approval_email as string | null | undefined,
      existingInboxId,
      originalEmailBody,
      sendReplyFn:       (body: string) => conn.email.sendReply({
        messageId: msg.id,
        threadId:  msg.threadId,
        to:        msg.from,
        subject:   msg.subject,
        body,
      }),
    });
  }

  // ── Spam folder sync (opt-in, rate-limited) ──────────────────────────────────
  const agentFeatures = ((agent as Record<string, unknown>).features as Record<string, unknown> | null) ?? {};
  const checkSpam     = agentFeatures.check_spam_folder === true;

  if (checkSpam && conn.email.fetchUnread) {
    // Fetch last_spam_sync_at from integration_accounts metadata
    let lastSpamSyncAt: string | undefined;
    if (agent.portal_email) {
      const { data: ia } = await supabase
        .from('integration_accounts')
        .select('metadata')
        .eq('portal_email', agent.portal_email)
        .eq('provider', integration.provider)
        .maybeSingle();
      lastSpamSyncAt = ((ia?.metadata as Record<string, unknown>) ?? {}).last_spam_sync_at as string | undefined;
    }

    const thirtyMinMs  = 30 * 60 * 1000;
    const canSyncSpam  = !lastSpamSyncAt || (Date.now() - new Date(lastSpamSyncAt).getTime()) > thirtyMinMs;

    if (canSyncSpam) {
      const spamMessages = await conn.email.fetchUnread(since, 'spam');

      for (const msg of spamMessages) {
        const { data: existing } = await supabase
          .from('ops_inbox')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('raw_message_id', msg.id)
          .maybeSingle();

        if (existing) continue;

        await processInboxEmail({
          agentId:       agent.id,
          source:        integration.provider,
          rawMessageId:  msg.id,
          threadId:      msg.threadId,
          emailFrom:     msg.from,
          emailSubject:  msg.subject,
          emailBody:     msg.body,
          attachments:   [],
          agentName:     (agent.agent_name as string | null) ?? 'Centinelia',
          businessName:  agent.business_name as string,
          knowledgeBase: knowledge_base,
          roleKB:        agent.role_knowledge_base as string | null,
          agentRole:     agent.role as string | null,
          ownerEmail:    agent.client_email as string,
          portalToken:   agent.portal_token as string,
          portalEmail:   agent.portal_email as string | undefined,
          autoMode,
          approvalEmail: (agent as Record<string, unknown>).approval_email as string | null | undefined,
          fromSpamFolder: true,
          unmarkSpamFn:  conn.email.unmarkSpam
            ? (id: string) => conn.email.unmarkSpam!(id)
            : undefined,
          sendReplyFn:   (body: string) => conn.email.sendReply({
            messageId: msg.id,
            threadId:  msg.threadId,
            to:        msg.from,
            subject:   msg.subject,
            body,
          }),
        });
      }

      // Update last_spam_sync_at in integration_accounts
      if (agent.portal_email) {
        const { data: ia } = await supabase
          .from('integration_accounts')
          .select('metadata')
          .eq('portal_email', agent.portal_email)
          .eq('provider', integration.provider)
          .maybeSingle();
        const meta = (ia?.metadata as Record<string, unknown>) ?? {};
        await supabase.from('integration_accounts')
          .update({ metadata: { ...meta, last_spam_sync_at: new Date().toISOString() } })
          .eq('portal_email', agent.portal_email)
          .eq('provider', integration.provider);
      }
    }
  }
}

// ─── Org-shared inbox sync ────────────────────────────────────────────────
//
// Nueva ruta paralela: correos que llegan a la bandeja compartida de la org
// (integration_accounts, capability='email') se ingestan, ruteán via dispatcher
// al meerkat que corresponde por rol, y se insertan en ops_inbox con
// origin_scope='org_shared' + metadata del dispatcher.

interface OrgAccountRow {
  portal_email:  string;
  provider:      'gmail' | 'outlook';
  account_label: string | null;
  access_token:  string | null;
  refresh_token: string | null;
  expires_at:    string | null;
  status:        string | null;
  metadata:      Record<string, unknown> | null;
}

// Rate limit: máximo N correos por org por corrida del cron. Evita quemar
// tokens Sonnet si una bandeja recibe flood. Los excedentes quedan unread
// (no markRead) y se procesan en el siguiente tick.
const ORG_MESSAGES_PER_TICK = 20;

export async function syncAllOrgInboxes(): Promise<{ synced: number; errors: number }> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('integration_accounts')
    .select('portal_email, provider, account_label, access_token, refresh_token, expires_at, status, metadata')
    .eq('capability', 'email')
    .neq('status', 'disconnected');

  const orgs = (data ?? []) as OrgAccountRow[];
  if (!orgs.length) return { synced: 0, errors: 0 };

  let synced = 0; let errors = 0;

  for (const org of orgs) {
    try {
      await syncOrgInbox(org, supabase);
      synced++;
    } catch (err) {
      console.error(`[org-sync] error for ${org.portal_email}/${org.provider}:`, err);
      errors++;
    }
  }

  return { synced, errors };
}

async function syncOrgInbox(org: OrgAccountRow, supabase: ReturnType<typeof createAdminClient>) {
  // Necesitamos un agent_id para el synthetic IntegrationRow (el connector lo
  // usa como pivote para refresh de tokens). Usamos el primer agente activo
  // de la org como pivote — no importa quién sea, el token es de la org.
  const { data: pivotAgent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', org.portal_email)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (!pivotAgent?.id) {
    console.warn(`[org-sync] Sin agente activo para ${org.portal_email}, skipping`);
    return;
  }

  const synthetic: IntegrationRow = {
    id:                 `org:${org.portal_email}:${org.provider}`,
    agent_id:           pivotAgent.id as string,
    provider:           org.provider,
    email:              org.account_label ?? '',
    access_token:       org.access_token ?? '',
    refresh_token:      org.refresh_token ?? null,
    token_expires_at:   org.expires_at ?? null,
    last_sync_at:       null,
    needs_reauth:       org.status === 'needs_reauth',
    reauth_notified_at: null,
  };

  const conn = await getConnector(synthetic, supabase);

  const lastSyncAt = (org.metadata?.last_sync_at as string | undefined) ?? null;
  const since      = lastSyncAt
    ? new Date(lastSyncAt)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const messages = await conn.email.fetchUnread(since);

  const syncedAt = new Date().toISOString();
  await supabase
    .from('integration_accounts')
    .update({ metadata: { ...(org.metadata ?? {}), last_sync_at: syncedAt } })
    .eq('portal_email', org.portal_email)
    .eq('provider', org.provider);

  const orgEmailAddr = org.account_label ?? '';
  const rateLimited  = messages.slice(0, ORG_MESSAGES_PER_TICK);
  if (messages.length > ORG_MESSAGES_PER_TICK) {
    console.log(`[org-sync] ${org.portal_email}/${org.provider}: ${messages.length} msgs pero cap=${ORG_MESSAGES_PER_TICK}, resto en próximo tick`);
  }

  for (const msg of rateLimited) {
    // Idempotencia: si YA existe row ops_inbox con el mismo raw_message_id
    // y origin_scope='org_shared' + este org_email en metadata, skip + markRead.
    const { data: existing } = await supabase
      .from('ops_inbox')
      .select('id')
      .eq('raw_message_id', msg.id)
      .eq('origin_scope', 'org_shared')
      .contains('assignment_metadata', { org_email: orgEmailAddr })
      .maybeSingle();

    if (existing) {
      await conn.email.markRead(msg.id).catch(err =>
        console.error(`[org-sync] markRead retry failed for ${msg.id}:`, err));
      continue;
    }

    // ── Pass 1: Quick-classify (spam/notificación automática) ───────────
    // Ahorra tokens Sonnet: los patrones obvios (marketing, notificaciones,
    // no-reply) se skipean sin llamar al dispatcher LLM.
    const quick = quickClassifyEmail({ from: msg.from, subject: msg.subject, body: msg.body });
    if (quick.category) {
      const category = quick.category === 'spam' ? 'spam' : 'otro';
      const summary  = quick.category === 'spam'
        ? `Correo de marketing (clasificado sin IA: ${quick.reason ?? 'patrón detectado'}).`
        : `Notificación automática (clasificado sin IA: ${quick.reason ?? 'patrón detectado'}).`;

      try {
        const { error } = await supabase.from('ops_inbox').insert({
          agent_id:              pivotAgent.id as string,
          source:                org.provider,
          raw_message_id:        msg.id,
          thread_id:             msg.threadId ?? null,
          email_from:            msg.from,
          email_subject:         msg.subject,
          email_body:            msg.body.slice(0, EMAIL_BODY_TRUNCATE_CHARS),
          attachments:           [],
          category,
          ai_summary:            summary,
          ai_draft:              null,
          item_type:             'email',
          status:                'skipped',
          origin_scope:          'org_shared',
          assigned_by:           'rule',
          assignment_confidence: 1.0,
          assignment_metadata:   { org_email: orgEmailAddr, rule: `quick_${quick.category}`, quick_reason: quick.reason },
        });
        if (error) throw error;
        // markRead solo si insert OK
        await conn.email.markRead(msg.id).catch(err =>
          console.error(`[org-sync] markRead failed post-quick for ${msg.id}:`, err));
      } catch (err) {
        console.error(`[org-sync] quick-classify insert failed for ${msg.id}:`, err);
        // NO markRead — próximo tick reintenta
      }
      continue;
    }

    // ── Pass 2: Dispatcher (reglas + LLM + fallback) ─────────────────────
    let dispatch: DispatchResult;
    try {
      dispatch = await dispatchEmail({
        portalEmail:  org.portal_email,
        orgEmail:     orgEmailAddr,
        pivotAgentId: pivotAgent.id as string,
        message: {
          id:      msg.id,
          from:    msg.from,
          subject: msg.subject,
          body:    msg.body,
        },
      });
    } catch (err) {
      console.error(`[org-sync] dispatcher error for msg ${msg.id}:`, err);
      continue; // no markRead — permitir retry en próximo sync
    }

    // ── Pass 3: Escalación a humano ──────────────────────────────────────
    if (!dispatch.agentId) {
      try {
        await createOrgHumanRequest({ supabase, org, pivotAgentId: pivotAgent.id as string, msg, dispatch });
        await conn.email.markRead(msg.id).catch(err =>
          console.error(`[org-sync] markRead failed post-escalation for ${msg.id}:`, err));
      } catch (err) {
        console.error(`[org-sync] createOrgHumanRequest failed for ${msg.id}:`, err);
        // NO markRead — próximo tick reintenta
      }
      continue;
    }

    // ── Pass 4: Delegar a processInboxEmail con agente asignado ─────────
    const { data: assignedAgent } = await supabase
      .from('voice_agents')
      .select('id, business_name, agent_name, client_email, portal_token, role_knowledge_base, role, portal_email, approval_email, trust_stage')
      .eq('id', dispatch.agentId)
      .single();

    if (!assignedAgent?.client_email) {
      console.warn(`[org-sync] agente asignado sin client_email, skipping msg ${msg.id}`);
      // markRead — no vamos a poder procesarlo, evitar loop infinito
      await conn.email.markRead(msg.id).catch(() => {});
      continue;
    }

    const { data: orgData } = assignedAgent.portal_email
      ? await supabase.from('organizations')
          .select('knowledge_base, auto_mode_disabled_at')
          .eq('portal_email', assignedAgent.portal_email)
          .single()
      : { data: null };
    const orgDisabled  = !!(orgData as Record<string, unknown> | null)?.auto_mode_disabled_at;
    const autoMode     = resolveAutoMode({
      trust_stage: (assignedAgent as Record<string, unknown>).trust_stage as number | null,
      orgDisabled,
    });

    try {
      await processInboxEmail({
        agentId:              assignedAgent.id as string,
        source:               org.provider,
        rawMessageId:         msg.id,
        threadId:             msg.threadId,
        emailFrom:            msg.from,
        emailSubject:         msg.subject,
        emailBody:            msg.body,
        attachments:          [],
        agentName:            (assignedAgent.agent_name as string | null) ?? 'Centinelia',
        businessName:         assignedAgent.business_name as string,
        knowledgeBase:        (orgData as { knowledge_base?: string | null } | null)?.knowledge_base ?? null,
        roleKB:               assignedAgent.role_knowledge_base as string | null,
        agentRole:            assignedAgent.role as string | null,
        ownerEmail:           assignedAgent.client_email as string,
        portalToken:          assignedAgent.portal_token as string,
        portalEmail:          assignedAgent.portal_email as string | undefined,
        autoMode,
        approvalEmail:        (assignedAgent as Record<string, unknown>).approval_email as string | null | undefined,
        originScope:          'org_shared',
        assignedBy:           dispatch.assignedBy,
        assignmentConfidence: dispatch.confidence,
        assignmentMetadata:   dispatch.metadata as unknown as Record<string, unknown>,
      });
      // markRead SOLO tras insert exitoso
      await conn.email.markRead(msg.id).catch(err =>
        console.error(`[org-sync] markRead failed post-process for ${msg.id}:`, err));
    } catch (err) {
      console.error(`[org-sync] processInboxEmail failed for ${msg.id}:`, err);
      // NO markRead — próximo tick reintenta
    }
  }
}

async function createOrgHumanRequest(args: {
  supabase:     ReturnType<typeof createAdminClient>;
  org:          OrgAccountRow;
  pivotAgentId: string;
  msg:          { id: string; threadId?: string; from: string; subject: string; body: string };
  dispatch:     DispatchResult;
}) {
  const { supabase, org, pivotAgentId, msg, dispatch } = args;

  // Buscar owner de la org
  const { data: agentInfo } = await supabase
    .from('voice_agents')
    .select('client_email, portal_token')
    .eq('id', pivotAgentId)
    .single();

  const targetEmail = (agentInfo?.client_email as string | null) ?? org.portal_email;

  const { error } = await supabase.from('human_requests').insert({
    agent_id:        pivotAgentId,
    source_channel:  'email',
    source_context:  `Correo entrante a bandeja compartida (${org.account_label ?? org.portal_email}) sin asignación clara.\n\nDe: ${msg.from}\nAsunto: ${msg.subject}\n\n${msg.body.slice(0, 500)}`,
    request_type:    'action',
    title:           `Asignar correo entrante: "${msg.subject.slice(0, 80)}"`,
    description:     dispatch.metadata.escalated_reason ?? 'El dispatcher no pudo decidir a qué empleado asignar este correo.',
    // urgency debe ser 'baja' | 'media' | 'alta' (ver notify.ts:47)
    urgency:         'media',
    target_email:    targetEmail,
    // target_type='specific' matchea el patrón del resto del código (respond route)
    target_type:     'specific',
    channels_notified: [],
    status:          'pending',
  });
  if (error) throw error; // propagar al caller para que NO markRead
}
