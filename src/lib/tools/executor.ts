/**
 * Shared agent tool executor.
 * Used by agent-chat (portal) and inbox-processor (email) so every tool
 * is available in every channel automatically.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { createAdminClient } from '@/lib/supabase/admin';
import { notionClient, searchProduct } from '@/lib/notion/client';
import { brandKitFromAgent } from '@/lib/brand/kit';
import { GenericDocPDF, ProposalPDF, LetterPDF } from '@/lib/pdf/doc';
import { FacturaPdf } from '@/lib/pdf/factura';
import { OrdenCompraPdf } from '@/lib/pdf/orden-compra';
import { triggerOutboundCall } from '@/lib/vapi/outbound';
import {
  executeSendEmail, executeSaveToDrive, executeOrganizeFiles,
  executeSearchFiles, executeReadFile,
  executeListCalendarEvents, executeCreateCalendarEvent, executeDeleteCalendarEvent,
} from '@/lib/services/connector-tools';
import { searchWeb, searchMultiple, buildQueries, type ResearchType } from '@/lib/search/web';
import { generateFolio, STATUS_LABELS } from '@/lib/civic/folio';
import {
  getNextTicketFolio, getCurrentOnCall,
  type GuardiaArea, type GuardiaSchedule, type DirectorioContacto,
  type DirectoryPerson,
} from '@/lib/helpdesk/folio';
import { scrapeWebsite } from '@/lib/scrape/website';
import { checkPolicy, TOOL_CAPABILITIES } from '@/lib/policies/engine';
import { getQBClient } from '@/lib/qb/client';
import { generateExcel, type ExcelSheet } from '@/lib/documents/excel';
import { logLlmCall } from '@/lib/observability/llm-log';
import { generateWord } from '@/lib/documents/word';
import { generateSlides, type Slide } from '@/lib/documents/slides';
import { fillDocxTemplate, convertDocxToPdf } from '@/lib/documents/template-fill';
import { sendEmail, bugReportHtml } from '@/lib/email/send';
import { sendOnboardingWelcome } from '@/lib/ops/onboarding-mailer';
import { randomUUID } from 'crypto';
import { consumeAiOp, refundOps } from '@/lib/ai/ops-guard';
import {
  enhanceTextContent, enhanceSlidesContent,
  peerReviewText, peerReviewSlides, isCriticalDocument,
} from '@/lib/documents/quality-enhancer';
import { PORTAL_COOKIE } from '@/lib/portal/auth';
import { getTramiteById } from '@/lib/tramites/config';
import { fetchCatalogo } from '@/lib/tramites/catalog';
import { fetchLookup } from '@/lib/tramites/lookup';
import { submitTramite } from '@/lib/tramites/submit';
import { solicitarFactura, type SolicitarFacturaItem } from '@/lib/fiscal/request-factura';
import { lookupFacturas } from '@/lib/fiscal/lookup-factura';
import * as sheetsService from '@/lib/services/sheets';
import { upsertLeadWithDedup, upsertOutboundContactWithDedup } from '@/lib/leads/dedup';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const SOCIAL_DOMAINS = ['facebook.com', 'linkedin.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com'];

function isPrivateUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (!['http:', 'https:'].includes(protocol)) return true;
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
      if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127 || (a === 169 && b === 254) || a === 0) return true;
    }
    return false;
  } catch { return true; }
}

/** Mutable counter so callers can track read_url calls across the tool loop. */
export interface ReadUrlCounter { value: number }

export interface AgentToolContext {
  agentId:       string;
  portalEmail:   string;
  agentName:     string;
  businessName:  string;
  portalToken:   string;
  agent:         Record<string, unknown>;
  supabase:      SupabaseClient;
  /** Last user message or email body — used as context for quality pipeline. */
  userContext?:  string;
  /** Portal session cookie — required for Mercado Libre tools. */
  cookieHeader?: string;
  /** Mutable counter for read_url calls (max 3 per session). */
  readUrlCount?: ReadUrlCounter;
  /** Source channel — used by pedir_a_humano to tag human_requests.source_channel. */
  channel?:       'voice' | 'chat' | 'email';
  /** Source inbox row id — used by pedir_a_humano anti-loop counter. */
  sourceInboxId?: string;
  /** Source Vapi call id — used by pedir_a_humano for voice channel tracking. */
  sourceCallId?:  string;
  /** Requester identity when el chat/email viene de portal_users (sub-user).
   * ANTES: tool calls desde sub-user chat se ejecutaban como si fueran el owner
   * → sub-user invocaba aprobar_gasto/qb_crear_factura/etc. sin gate. También
   * audit trail (agent_tasks, ops_ledger) confundía owner con sub-user.
   * Ahora las tools money-critical pueden verificar isSubUser + modules antes
   * de ejecutar (voice channel deja estos undefined, sin cambio). Ver Scope
   * D3 HIGH-2. */
  requesterIsSubUser?: boolean;
  requesterUserId?:    string;
  requesterModules?:   string[];
}

async function fetchPeerAgent(agentId: string, portalEmail: string, supabase: SupabaseClient) {
  const { data } = await supabase
    .from('voice_agents')
    .select('id, agent_name, knowledge_base, role_knowledge_base')
    .eq('portal_email', portalEmail)
    .neq('id', agentId)
    .limit(3);
  const agents = data ?? [];
  return agents.find(p => ((p.knowledge_base as string | null)?.trim() ?? (p.role_knowledge_base as string | null)?.trim())) ?? agents[0] ?? null;
}

/** Execute any agent tool by name. Returns the raw result object (JSON-serialisable). */
export async function executeAgentTool(
  toolName:  string,
  toolInput: Record<string, unknown>,
  ctx:       AgentToolContext,
): Promise<unknown> {
  // H1 + L2 — trace unificado + retry/timeout policy declarativa.
  const { traceToolCall }             = await import('@/lib/observability/tool-trace');
  const { policyFor, looksTransient } = await import('@/lib/tools/policies');
  const policy = policyFor(toolName);

  const runOnce = () => withToolTimeout(
    () => executeAgentToolInner(toolName, toolInput, ctx),
    policy.timeoutMs,
    toolName,
  );

  return traceToolCall(
    toolName,
    toolInput,
    {
      agentId:     ctx.agentId,
      portalEmail: ctx.portalEmail,
      channel:     ctx.channel ?? 'chat',
      sessionId:   ctx.sourceCallId ?? ctx.sourceInboxId ?? null,
    },
    async () => {
      let lastErr: unknown;
      let lastResult: unknown;
      for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
        try {
          lastResult = await runOnce();
          const failed = lastResult && typeof lastResult === 'object' && (lastResult as { ok?: unknown }).ok === false;
          if (!failed) return lastResult;
          const errMsg = (lastResult as { error?: unknown }).error;
          if (!policy.retryOnlyTransient || !looksTransient(errMsg)) return lastResult;
          lastErr = errMsg;
        } catch (err) {
          lastErr = err;
          if (policy.retryOnlyTransient && !looksTransient(err)) throw err;
        }
        if (attempt < policy.maxAttempts && policy.backoffMs > 0) {
          await new Promise(res => setTimeout(res, policy.backoffMs * attempt));
        }
      }
      if (lastResult !== undefined) return lastResult;
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? 'tool failed'));
    },
    (result) => ({
      tool_policy_attempts: policy.maxAttempts,
      tool_policy_timeout:  policy.timeoutMs,
      verify_strategy:      policy.verifyStrategy,
      final_ok:             result && typeof result === 'object' ? (result as { ok?: unknown }).ok !== false : true,
    }),
  );
}

function withToolTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms in ${label}`)), ms);
    fn().then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function executeAgentToolInner(
  toolName:  string,
  toolInput: Record<string, unknown>,
  ctx:       AgentToolContext,
): Promise<unknown> {
  const { agentId, portalEmail, agentName, businessName, portalToken, agent, supabase } = ctx;

  // ── Policy gate ───────────────────────────────────────────────────────────
  const cap = TOOL_CAPABILITIES[toolName];
  if (cap) {
    const policy = await checkPolicy({ agentId, capability: cap, action: `${cap}.${toolName}`, supabase });
    if (!policy.allowed) return { ok: false, error: policy.message };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // read_url
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'read_url') {
    const url = toolInput.url as string;
    const counter = ctx.readUrlCount;
    if (counter && counter.value >= 3) return { ok: false, error: 'Límite de 3 lecturas por investigación alcanzado.' };
    if (isPrivateUrl(url)) return { ok: false, error: 'URL no permitida.' };
    if (SOCIAL_DOMAINS.some(d => url.includes(d))) return { ok: false, error: 'Red social detectada — usa el título y descripción del resultado de búsqueda.' };
    if (counter) counter.value++;
    const content = await scrapeWebsite(url);
    return content ? { ok: true, url, content, chars: content.length } : { ok: false, url, error: 'No se pudo leer este sitio (timeout o acceso bloqueado).' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // crear_borrador_contrato
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'crear_borrador_contrato') {
    const { data: tpl } = await supabase.from('contract_templates').select('clauses').eq('agent_id', agentId).single();
    const DEFAULT_IDS = ['partes','objeto','vigencia','contraprestacion','pago','confidencialidad','propiedad','responsabilidad','terminacion','jurisdiccion','aceptacion'];
    type Clause = { id: string; title: string; body: string; required: boolean; enabled: boolean };
    let base: Clause[] = (tpl?.clauses as Clause[] | null) ?? [];
    if (!base.length) base = DEFAULT_IDS.map(id => ({ id, title: id.toUpperCase(), body: '', required: ['partes','objeto','vigencia','contraprestacion','jurisdiccion','aceptacion'].includes(id), enabled: true }));
    const ovs = ((toolInput.clause_overrides ?? []) as { id: string; enabled?: boolean; body?: string }[]);
    const clauses = base.map(c => { const o = ovs.find(x => x.id === c.id); return o ? { ...c, ...(o.enabled !== undefined && !c.required ? { enabled: o.enabled } : {}), ...(o.body !== undefined ? { body: o.body } : {}) } : c; });
    const { data: draft, error } = await supabase.from('contract_drafts').insert({
      agent_id: agentId, clauses,
      client_name:  (toolInput.client_name  as string | null) ?? null,
      client_email: (toolInput.client_email as string | null) ?? null,
      client_rfc:   (toolInput.client_rfc   as string | null) ?? null,
      client_phone: (toolInput.client_phone as string | null) ?? null,
      notes:        (toolInput.notes        as string | null) ?? null,
      source_type:  (toolInput.source_type  as string | null) ?? 'manual',
      source_ref:   (toolInput.source_ref   as string | null) ?? null,
      status: 'borrador',
    }).select('id').single();
    if (error) return { ok: false, error: error.message };
    // Registrar el estado inicial en el historial del state machine
    const { recordContractCreation } = await import('@/lib/state-machines/contract-draft');
    await recordContractCreation({
      supabase,
      contractId: draft!.id as string,
      actor:      `agent:${agentId}`,
      reason:     'contract_created_via_tool',
      metadata:   { client_name: toolInput.client_name ?? null, source_type: toolInput.source_type ?? 'manual' },
    });
    return { ok: true, draft_id: draft!.id, message: `Borrador creado con ID ${draft!.id}. Visible en Oficina → Contratos.` };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_correo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_correo') {
    // F4.1 — verifier adversarial: envío directo (sin approval humano).
    // El agente principal declaró en `subject` y `body` — el verifier
    // decide si el destinatario + contenido son legítimos.
    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdict = await verifyDestructiveAction({
      action:          'envío de correo directo (sin aprobación humana)',
      target:          toolInput.to as string,
      reason:          `Asunto: ${toolInput.subject as string} — Cuerpo: ${(toolInput.body as string).slice(0, 400)}`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) {
      return { ok: false, error: `Verificador bloqueó el envío: ${verdict.concern ?? 'preocupación no especificada'}. Revisa destinatario o contenido, o pide aprobación.` };
    }

    // Intent lock org-level — si otro meerkat ya reportó lo mismo al mismo
    // destinatario en las últimas 24h, no duplicamos ni cobramos otra tarea.
    const { tryClaimReportIntent, commitReportIntent, releaseReportIntent, formatDuplicateReportMessage } =
      await import('@/lib/ops/report-intent-lock');
    const claim = await tryClaimReportIntent({
      portalEmail,
      kind:      'email',
      target:    toolInput.to as string,
      subject:   toolInput.subject as string,
      agentId,
      agentName,
      extraDedupe: (toolInput.body as string ?? '').slice(0, 800),
      sourceContext: { tool: 'enviar_correo', channel: ctx.channel ?? 'chat' },
    });
    if (!claim.claimed) {
      return {
        ok: false,
        deduped: true,
        message: formatDuplicateReportMessage(claim),
        already_claimed_by: claim.alreadyClaimedBy,
      };
    }

    const result = await executeSendEmail({
      agentId, businessName,
      to:           toolInput.to           as string,
      subject:      toolInput.subject      as string,
      body:         toolInput.body         as string,
      cc:           toolInput.cc           as string | undefined,
      attFileId:    toolInput.attachment_file_id   as string | undefined,
      attFileName:  toolInput.attachment_file_name as string | undefined,
      attMimeType:  toolInput.attachment_mime_type as string | undefined,
    }, supabase);

    const sent = result && typeof result === 'object' && (result as { ok?: unknown }).ok !== false;
    if (sent) await commitReportIntent(claim.lockId);
    else      await releaseReportIntent(claim.lockId);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_correo_enviado — busca en outbound_emails los correos que ANY
  // meerkat del portal ha enviado. Match por destinatario, asunto y/o
  // rango de fechas. Devuelve preview del cuerpo (600 chars) para evitar
  // saturar el context del modelo.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_correo_enviado') {
    if (!portalEmail) return { ok: false, error: 'Sin portal_email para buscar correos.' };
    const q          = typeof toolInput.query === 'string' ? toolInput.query.trim() : '';
    const destino    = typeof toolInput.destinatario === 'string' ? toolInput.destinatario.trim() : '';
    const dias       = typeof toolInput.dias === 'number' ? Math.min(365, Math.max(1, toolInput.dias)) : 30;
    const limitN     = typeof toolInput.limit === 'number' ? Math.min(20, Math.max(1, toolInput.limit)) : 10;
    const sinceIso   = new Date(Date.now() - dias * 86_400_000).toISOString();

    let qb = supabase
      .from('outbound_emails')
      .select('id, agent_id, to_email, cc_email, subject, body, provider, ok, created_at')
      .eq('portal_email', portalEmail)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limitN);

    if (destino) qb = qb.ilike('to_email', `%${destino}%`);
    if (q)       qb = qb.or(`subject.ilike.%${q}%,body.ilike.%${q}%`);

    const { data: rows, error } = await qb;
    if (error) return { ok: false, error: `No se pudieron consultar los correos: ${error.message}` };
    if (!rows?.length) return { ok: true, count: 0, results: [], message: 'No encontré correos enviados que coincidan.' };

    // Enrich con agent_name para que el modelo sepa quién envió cada uno
    const agentIds = Array.from(new Set(rows.map(r => r.agent_id as string | null).filter(Boolean))) as string[];
    const agentMap = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from('voice_agents')
        .select('id, agent_name')
        .in('id', agentIds);
      for (const a of agents ?? []) agentMap.set(a.id as string, (a.agent_name as string | null) ?? 'Empleado');
    }

    const results = rows.map(r => ({
      id:           r.id,
      enviado_por:  r.agent_id ? (agentMap.get(r.agent_id as string) ?? 'Empleado') : 'Sistema',
      to:           r.to_email,
      cc:           r.cc_email ?? null,
      subject:      r.subject,
      body_preview: typeof r.body === 'string' ? r.body.slice(0, 600) : '',
      provider:     r.provider,
      ok:           r.ok,
      sent_at:      r.created_at,
    }));

    const summary = results.slice(0, 5).map(r =>
      `- ${new Date(r.sent_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · ${r.enviado_por} → ${r.to} · "${r.subject}"`
    ).join('\n');
    return { ok: true, count: results.length, results, message: `${results.length} correo(s) encontrado(s):\n${summary}` };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // create_document
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'create_document') {
    try {
      // Los campos brand (color, footer, website, address) viven en organizations
      // desde e372013. Sin este fetch todos los PDFs salen en morado default.
      const { data: orgBrand } = await supabase
        .from('organizations')
        .select('email_brand_color, brand_color_secondary, email_footer_text, brand_website, brand_address')
        .eq('portal_email', portalEmail)
        .maybeSingle();
      const brand        = brandKitFromAgent(agent, orgBrand as Record<string, unknown> | null);
      const title        = toolInput.title as string;
      const templateType = (toolInput.template_type as string | undefined) ?? 'general';

      // Guard 2026-08-20: rechazar template='factura'. Antes cualquier LLM podía
      // usar create_document con template=factura como sustituto de un CFDI real,
      // generando un PDF que parecía factura fiscal pero no era timbrado. Los
      // schemas ya no listan 'factura' en el enum (chat/voice/email/inbox), pero
      // este guard atrapa llamadas heredadas o manuales.
      if (templateType === 'factura') {
        return {
          ok:    false,
          error: 'No existe plantilla de factura fiscal en create_document. Los CFDIs se emiten con solicitar_factura vía el PAC del negocio (Solución Factible, CONTPAQi). Si el negocio no tiene PAC conectado, registra un lead con los datos fiscales del cliente para escalar a facturación.',
        };
      }

      const slug         = ((toolInput.filename as string | null) ?? title)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const filename = `${slug}-${Date.now()}.pdf`;
      const path     = `${agentId}/${filename}`;
      const uInst    = ctx.userContext ?? '';
      const bCtx     = [agent.knowledge_base, agent.role_knowledge_base].filter(Boolean).join('\n').slice(0, 1200) as string;
      let content    = (toolInput.content as string | undefined) ?? '';

      const isDataDriven = templateType === 'factura' || templateType === 'orden_compra';
      const enhOps = !isDataDriven ? await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' }) : { ok: false };
      if (enhOps.ok) {
        content = await enhanceTextContent({ format: 'pdf', templateType, content, userInstruction: uInst, businessName, businessContext: bCtx });
        if (isCriticalDocument('pdf', templateType)) {
          const peer = await fetchPeerAgent(agentId, portalEmail, supabase);
          if (peer) {
            const revOps = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
            if (revOps.ok) {
              const peerKb = [peer.knowledge_base, peer.role_knowledge_base].filter(Boolean).join('\n') as string;
              content = await peerReviewText({ content, format: 'pdf', templateType, userInstruction: uInst, businessName, peerName: (peer.agent_name as string | null) ?? 'Agente', peerKb });
            }
          }
        }
      }

      const featCfg      = ((agent.features as Record<string, unknown>)?.factura_config    ?? {}) as Record<string, unknown>;
      const ordenCfg     = ((agent.features as Record<string, unknown>)?.orden_config      ?? {}) as Record<string, unknown>;
      const cotizacionCfg= ((agent.features as Record<string, unknown>)?.cotizacion_config ?? {}) as Record<string, unknown>;
      const notaVentaCfg = ((agent.features as Record<string, unknown>)?.nota_venta_config ?? {}) as Record<string, unknown>;

      // Resolve folio for factura: explicit input → QB last+1 → configured-prefix random
      let facturaFolioNum: string | undefined = toolInput.folio_num as string | undefined;
      if (!facturaFolioNum && templateType === 'factura') {
        const prefix = (featCfg.folio_prefix as string | undefined) ?? 'FAC';
        try {
          const qb = await getQBClient(portalEmail, supabase);
          if (qb) {
            const qd  = await qb.query('SELECT DocNumber FROM Invoice ORDER BY MetaData.CreateTime DESC MAXRESULTS 1');
            const dn  = qd?.QueryResponse?.Invoice?.[0]?.DocNumber as string | undefined;
            if (dn) {
              const n = dn.replace(/\D/g, '');
              if (n) facturaFolioNum = `${prefix}-${String(parseInt(n, 10) + 1).padStart(Math.max(n.length, 4), '0')}`;
            }
          }
        } catch { /* fall through */ }
        if (!facturaFolioNum) {
          const d = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
          facturaFolioNum = `${prefix}-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${Math.floor(Math.random()*9000)+1000}`;
        }
      }

      // Auto-folio para orden/cotizacion/nota_venta si no vino explícito.
      // Formato corto (PREFIX-NNNN) para que quepa en celdas apretadas de
      // plantillas de usuarios. Para trazabilidad completa, el request_id + fecha
      // quedan en la DB.
      const autoFolio = (prefixDefault: string, cfg: Record<string, unknown>): string => {
        const prefix = (cfg.folio_prefix as string | undefined) ?? prefixDefault;
        return `${prefix}-${Math.floor(Math.random()*9000)+1000}`;
      };
      const nonFacturaFolio =
        (toolInput.folio_num as string | undefined) ??
        (templateType === 'orden_compra' ? autoFolio('OC',  ordenCfg) :
         templateType === 'cotizacion'   ? autoFolio('COT', cotizacionCfg) :
         templateType === 'nota_venta'   ? autoFolio('NV',  notaVentaCfg) :
         undefined);

      const mxn = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      // Fecha en formato dd/mm/yyyy (más compacto para tablas)
      const _now = new Date();
      const _pad = (n: number) => String(n).padStart(2, '0');
      const fechaHoy = `${_pad(_now.getDate())}/${_pad(_now.getMonth()+1)}/${_now.getFullYear()}`;

      // ── User template path (docxtemplater + CloudConvert) ─────────────────
      const cfgForType =
        templateType === 'factura'      ? featCfg :
        templateType === 'orden_compra' ? ordenCfg :
        templateType === 'cotizacion'   ? cotizacionCfg :
        templateType === 'nota_venta'   ? notaVentaCfg :
        null;
      const userTemplatePath = cfgForType?.template_path as string | undefined;
      const useUserTemplate = !!userTemplatePath && userTemplatePath.toLowerCase().endsWith('.docx');

      let buf: Buffer;

      if (useUserTemplate && (templateType === 'factura' || templateType === 'orden_compra' || templateType === 'cotizacion' || templateType === 'nota_venta')) {
        const { data: tplBlob, error: tplErr } = await supabase.storage.from('agent-documents').download(userTemplatePath!);
        if (tplErr || !tplBlob) return { ok: false, error: `No pude leer tu plantilla en Portal → Plantillas. Verifica que sigue subida.` };
        const tplBuffer = Buffer.from(await tplBlob.arrayBuffer());

        // Build data payload matching src/lib/documents/template-spec.ts
        const items = (toolInput.items as Array<{ descripcion: string; cantidad: number; precio_unitario: number; unidad?: string }> | undefined) ?? [];
        const itemRows = items.map(i => ({
          descripcion:     i.descripcion,
          cantidad:        String(i.cantidad),
          unidad:          i.unidad ?? '',
          precio_unitario: mxn(i.precio_unitario),
          importe:         mxn(i.cantidad * i.precio_unitario),
        }));
        const subtotalNum = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
        const incluirIVA  = templateType === 'factura'
          ? (toolInput.include_iva as boolean | undefined) ?? true
          : (toolInput.include_iva as boolean | undefined) ?? (ordenCfg.incluir_iva as boolean | undefined) ?? false;
        const ivaNum   = incluirIVA ? subtotalNum * 0.16 : 0;
        const totalNum = subtotalNum + ivaNum;

        const commonData: Record<string, unknown> = {
          folio:             (templateType === 'factura' ? facturaFolioNum : nonFacturaFolio) ?? '',
          fecha:             fechaHoy,
          items:             itemRows,
          subtotal:          mxn(subtotalNum),
          iva:               mxn(ivaNum),
          total:             mxn(totalNum),
          condiciones_pago:  (toolInput.payment_terms as string | undefined) ?? (cfgForType!.condiciones_pago as string | undefined) ?? '',
          notas:             content || '',
          emisor_nombre:     businessName,
          emisor_rfc:        (cfgForType!.rfc as string | undefined) ?? '',
          emisor_direccion:  (cfgForType!.direccion as string | undefined) ?? '',
          emisor_telefono:   (agent.transfer_number as string | undefined) ?? '',
          emisor_email:      portalEmail,
        };

        if (templateType === 'orden_compra') {
          commonData.proveedor_nombre = (toolInput.vendor_name  as string | null) ?? 'Proveedor';
          commonData.proveedor_rfc    = (toolInput.vendor_rfc   as string | undefined) ?? '';
          commonData.proveedor_email  = (toolInput.vendor_email as string | undefined) ?? '';
          commonData.terminos_entrega = (toolInput.delivery_terms as string | undefined) ?? (ordenCfg.terminos_entrega as string | undefined) ?? '';
        } else {
          // factura, cotizacion, nota_venta: todos apuntan a un CLIENTE
          commonData.cliente_nombre    = (toolInput.client_name as string | null) ?? 'Cliente';
          commonData.cliente_rfc       = (toolInput.client_rfc  as string | undefined) ?? '';
          commonData.cliente_email     = (toolInput.client_email as string | undefined) ?? '';
          commonData.cliente_direccion = (toolInput.client_address as string | undefined) ?? '';
          if (templateType === 'cotizacion') {
            commonData.vigencia_dias = String((toolInput.validity_days as number | undefined) ?? 15);
          }
          if (templateType === 'nota_venta') {
            commonData.forma_pago = (toolInput.payment_method as string | undefined) ?? 'Efectivo';
          }
        }

        try {
          const filled = fillDocxTemplate(tplBuffer, commonData);
          buf = await convertDocxToPdf(filled, agentId, supabase);
        } catch (err) {
          return { ok: false, error: `No pude generar el documento con tu plantilla: ${err instanceof Error ? err.message : String(err)}` };
        }
      } else {
        let pdfEl: React.ReactElement;

        if (templateType === 'proposal' || templateType === 'cotizacion') {
          pdfEl = createElement(ProposalPDF, { brand, title, content, clientName: toolInput.client_name as string | undefined, clientEmail: toolInput.client_email as string | undefined, totalPrice: toolInput.total_price as string | undefined, validityDays: toolInput.validity_days as number | undefined });
        } else if (templateType === 'letter') {
          pdfEl = createElement(LetterPDF, { brand, content, recipientName: toolInput.recipient_name as string | undefined, recipientEmail: toolInput.recipient_email as string | undefined });
        } else if (templateType === 'factura') {
          const ri = (toolInput.items as Array<{ descripcion: string; cantidad: number; precio_unitario: number }> | undefined) ?? [];
          pdfEl = createElement(FacturaPdf, { brand, data: { clienteNombre: (toolInput.client_name as string | null) ?? 'Cliente', clienteRFC: toolInput.client_rfc as string | undefined, clienteEmail: toolInput.client_email as string | undefined, items: ri.map(i => ({ descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precio_unitario })), incluirIVA: (toolInput.include_iva as boolean | undefined) ?? true, condicionesPago: (toolInput.payment_terms as string | undefined) ?? (featCfg.condiciones_pago as string | undefined) ?? null, emisorRFC: featCfg.rfc as string | undefined, emisorDireccion: featCfg.direccion as string | undefined, folioNum: facturaFolioNum, notas: content || null } });
        } else if (templateType === 'orden_compra') {
          const ri = (toolInput.items as Array<{ descripcion: string; cantidad: number; precio_unitario: number; unidad?: string }> | undefined) ?? [];
          pdfEl = createElement(OrdenCompraPdf, { brand, data: { proveedorNombre: (toolInput.vendor_name as string | null) ?? 'Proveedor', proveedorRFC: toolInput.vendor_rfc as string | undefined, proveedorEmail: toolInput.vendor_email as string | undefined, items: ri.map(i => ({ descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precio_unitario, unidad: i.unidad })), incluirIVA: (toolInput.include_iva as boolean | undefined) ?? (ordenCfg.incluir_iva as boolean | undefined) ?? false, condicionesPago: (toolInput.payment_terms as string | undefined) ?? (ordenCfg.condiciones_pago as string | undefined) ?? null, terminosEntrega: (toolInput.delivery_terms as string | undefined) ?? (ordenCfg.terminos_entrega as string | undefined) ?? null, emisorRFC: featCfg.rfc as string | undefined, emisorDireccion: featCfg.direccion as string | undefined, notas: content || null } });
        } else {
          pdfEl = createElement(GenericDocPDF, { brand, title, content });
        }

        buf = await renderToBuffer(pdfEl as any);
      }
      const { error: upErr } = await supabase.storage.from('agent-documents').upload(path, buf, { contentType: 'application/pdf', upsert: true });
      if (upErr) return { ok: false, error: `Error al subir: ${upErr.message}` };
      const { data: signed } = await supabase.storage.from('agent-documents').createSignedUrl(path, 3600);
      await supabase.from('ops_documents').insert({ agent_id: agentId, title, filename, storage_path: path, template_type: templateType, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
      return { ok: true, url: signed?.signedUrl ?? null, file_id: path, filename, mime_type: 'application/pdf', message: `Documento "${title}" generado. URL (1 hora): ${signed?.signedUrl}. También en Oficina → Documentos por 30 días.` };
    } catch (err) { return { ok: false, error: `Error al generar documento: ${String(err)}` }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // create_file (Excel / Word / PowerPoint)
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'create_file') {
    try {
      const format    = toolInput.format   as 'excel' | 'word' | 'powerpoint';
      const fileTitle = toolInput.title    as string;
      const slug      = ((toolInput.filename as string | null) ?? fileTitle)
        .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40);
      const { data: orgBrand2 } = await supabase
        .from('organizations')
        .select('email_brand_color, brand_color_secondary, email_footer_text, brand_website, brand_address')
        .eq('portal_email', portalEmail)
        .maybeSingle();
      const brand     = brandKitFromAgent(agent, orgBrand2 as Record<string, unknown> | null);
      const accent    = brand.color;
      const uInst     = ctx.userContext ?? '';
      const bCtx      = [agent.knowledge_base, agent.role_knowledge_base].filter(Boolean).join('\n').slice(0, 1200) as string;
      let buf: Buffer; let ext: string; let mime: string; let label: string;

      if (format === 'excel') {
        const sheets = (toolInput.sheets as ExcelSheet[] | null) ?? [{ name: fileTitle.slice(0, 31), headers: ['Sin datos'], rows: [['El agente no proporcionó datos.']] }];
        buf = await generateExcel(sheets); ext = 'xlsx'; mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; label = 'Excel';
      } else if (format === 'word') {
        const tpl = (toolInput.template_type as 'general' | 'proposal' | 'letter' | undefined) ?? 'general';
        let wc    = (toolInput.content as string | null) ?? '';
        const enhOps = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
        if (enhOps.ok) {
          wc = await enhanceTextContent({ format: 'word', templateType: tpl, content: wc, userInstruction: uInst, businessName, businessContext: bCtx });
          if (isCriticalDocument('word', tpl)) {
            const peer = await fetchPeerAgent(agentId, portalEmail, supabase);
            if (peer) { const revOps = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' }); if (revOps.ok) { const pk = [peer.knowledge_base, peer.role_knowledge_base].filter(Boolean).join('\n') as string; wc = await peerReviewText({ content: wc, format: 'word', templateType: tpl, userInstruction: uInst, businessName, peerName: (peer.agent_name as string | null) ?? 'Agente', peerKb: pk }); } }
          }
        }
        buf = await generateWord({ title: fileTitle, content: wc, templateType: tpl, businessName, accentColor: accent, clientName: toolInput.client_name as string | undefined, clientEmail: toolInput.client_email as string | undefined, totalPrice: toolInput.total_price as string | undefined, validityDays: toolInput.validity_days as number | undefined, recipientName: toolInput.recipient_name as string | undefined, recipientEmail: toolInput.recipient_email as string | undefined });
        ext = 'docx'; mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; label = 'Word';
      } else {
        let slides = (toolInput.slides as Slide[] | null) ?? [{ title: 'Contenido', content: 'El agente no proporcionó diapositivas.' }];
        const enhOps = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
        if (enhOps.ok) {
          slides = await enhanceSlidesContent({ slides, userInstruction: uInst, businessName, businessContext: bCtx });
          const peer = await fetchPeerAgent(agentId, portalEmail, supabase);
          if (peer) { const revOps = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' }); if (revOps.ok) { const pk = [peer.knowledge_base, peer.role_knowledge_base].filter(Boolean).join('\n') as string; slides = await peerReviewSlides({ slides, userInstruction: uInst, businessName, peerName: (peer.agent_name as string | null) ?? 'Agente', peerKb: pk }); } }
        }
        buf = await generateSlides({ title: fileTitle, slides, businessName, accentColor: accent });
        ext = 'pptx'; mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; label = 'PowerPoint';
      }

      const fname = `${slug}-${Date.now()}.${ext}`;
      const path  = `${agentId}/${fname}`;
      const { error: upErr } = await supabase.storage.from('agent-documents').upload(path, buf, { contentType: mime, upsert: true });
      if (upErr) return { ok: false, error: `Error al subir: ${upErr.message}` };
      const { data: signed } = await supabase.storage.from('agent-documents').createSignedUrl(path, 3600);
      await supabase.from('ops_documents').insert({ agent_id: agentId, title: fileTitle, filename: fname, storage_path: path, template_type: format, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
      return { ok: true, url: signed?.signedUrl ?? null, file_id: path, filename: fname, mime_type: mime, message: `Archivo ${label} "${fileTitle}" generado. URL (1 hora): ${signed?.signedUrl}. En Oficina → Documentos por 30 días.` };
    } catch (err) { return { ok: false, error: `Error al generar archivo: ${String(err)}` }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // trigger_outbound_call
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'trigger_outbound_call') {
    // Sub-user gate: llamadas salientes vacían el pool del owner. Sub-user
    // chatteando con Nia no debe dispararlas sin módulo llamadas/campanas.
    // Ver Scope D3 HIGH-2.
    if (ctx.requesterIsSubUser) {
      const mods = ctx.requesterModules ?? [];
      if (!mods.includes('llamadas') && !mods.includes('campanas')) {
        return { ok: false, error: 'No tienes permiso para iniciar llamadas salientes. Pide al dueño de la cuenta que te habilite el módulo "llamadas" o "campanas".' };
      }
    }
    let phone   = toolInput.phone_number as string | undefined;
    let name    = (toolInput.contact_name as string | null) ?? undefined;
    let motivo  = toolInput.message as string | undefined;

    // Smart-fallback: los LLMs (Sonnet y Haiku vía Vapi) a veces llaman
    // trigger_outbound_call({}) sin args a pesar del schema required. En vez
    // de forzar N reintentos con error messages (que hacen loop de fillers
    // "un momento…"), rescatamos el call context:
    // 1. Si falta phone → buscamos el is_operations_contact del org.
    // 2. Si falta motivo → armamos desde el outbound_contact activo del
    //    número que estamos llamando (caller_number del call context).
    if (!phone || !motivo) {
      // Fallback phone: primer operations_contact del directorio.
      if (!phone) {
        const { data: org } = await supabase
          .from('organizations')
          .select('directory')
          .eq('portal_email', portalEmail)
          .maybeSingle();
        const dir = ((org?.directory ?? []) as Array<Record<string, unknown>>);
        const ops = dir.find(p => p.is_operations_contact === true);
        if (ops && typeof ops.phone === 'string') {
          phone = ops.phone;
          if (!name && typeof ops.name === 'string') name = ops.name;
        }
      }
      // Fallback motivo: outbound_contact activo del call actual. Sin el
      // customer_number del call context solo tomamos el pending más reciente
      // del agente como best-effort.
      if (!motivo) {
        const { data: recent } = await supabase
          .from('outbound_contacts')
          .select('nombre, motivo, telefono')
          .eq('agent_id', agentId)
          .in('status', ['calling', 'pending'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recent?.motivo) {
          motivo = `El cliente ${recent.nombre ?? 'anónimo'} (${recent.telefono ?? 'sin teléfono'}) ${recent.motivo}. Favor de verificar y contactar al cliente directamente.`;
        }
      }
    }

    if (!phone) {
      return { ok: false, error: 'No hay teléfono destino y el directorio de la organización no tiene ningún contacto marcado como is_operations_contact. Pídele al dueño configurarlo.' };
    }
    if (!motivo) {
      motivo = 'Escalamiento de un cliente que reporta un problema. Favor de revisar la última interacción.';
    }
    if (!(agent.features as any)?.outbound_calls) return { ok: false, error: 'Llamadas salientes no habilitadas.' };
    if (!agent.vapi_agent_id) return { ok: false, error: 'El agente no está sincronizado con Vapi.' };

    // F4.1 — verifier adversarial antes de disparar la llamada
    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdict = await verifyDestructiveAction({
      action:          'llamada saliente automatizada',
      target:          `${phone}${name ? ` (${name})` : ''}`,
      reason:          motivo,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) {
      return { ok: false, error: `Verificador bloqueó la llamada: ${verdict.concern ?? 'preocupación no especificada'}. Revisa el motivo o pide aprobación.` };
    }

    const r = await triggerOutboundCall({ agent: agent as any, customerNumber: phone, customerName: name, motivo });
    return r.ok ? { ok: true, callId: r.callId, message: `Llamada iniciada a ${phone}${name ? ` (${name})` : ''}.` } : { ok: false, error: r.error };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Drive tools
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'save_to_drive') {
    return executeSaveToDrive(agentId, toolInput.file_id as string, toolInput.filename as string, toolInput.folder_name as string | undefined, supabase);
  }
  if (toolName === 'organize_files') {
    return executeOrganizeFiles(agentId, { action: toolInput.action as string, folderId: toolInput.folder_id as string | undefined, fileId: toolInput.file_id as string | undefined, destination: toolInput.destination as string | undefined, newName: toolInput.new_name as string | undefined, folderName: toolInput.folder_name as string | undefined }, supabase);
  }
  if (toolName === 'buscar_archivo') {
    return executeSearchFiles(agentId, toolInput.query as string, supabase);
  }
  if (toolName === 'leer_archivo') {
    return executeReadFile(agentId, toolInput.file_id as string, toolInput.file_name as string, (toolInput.mime_type as string | undefined) ?? '', supabase);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calendar tools
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'list_calendar_events') {
    return executeListCalendarEvents(agentId, new Date(toolInput.from as string), new Date(toolInput.to as string), supabase);
  }
  if (toolName === 'create_calendar_event') {
    return executeCreateCalendarEvent(agentId, { title: toolInput.title as string, start: toolInput.start as string, end: toolInput.end as string, description: toolInput.description as string | undefined, location: toolInput.location as string | undefined, attendees: toolInput.attendees as string[] | undefined, generate_meet_link: toolInput.generate_meet_link as boolean | undefined }, supabase);
  }
  if (toolName === 'delete_calendar_event') {
    return executeDeleteCalendarEvent(agentId, toolInput.event_id as string, supabase);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Web search
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_en_web') {
    if (!process.env.BRAVE_SEARCH_API_KEY) return { ok: false, error: 'Búsqueda web no configurada.' };
    const query   = toolInput.query as string;
    const results = await searchWeb(query, 10);
    if (!results.length) return { ok: true, results: [], message: `Sin resultados para: "${query}".` };
    const list = results.slice(0, 10).map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`).join('\n\n');
    return { ok: true, count: results.length, results: results.slice(0, 10), message: `${results.length} resultado(s) para "${query}":\n\n${list}` };
  }

  if (toolName === 'search_leads') {
    if (!process.env.BRAVE_SEARCH_API_KEY) return { ok: false, error: 'Búsqueda web no configurada.' };
    const topic    = toolInput.topic        as string;
    const location = (toolInput.location   as string | undefined) ?? '';
    const keywords = (toolInput.keywords   as string[] | undefined) ?? [];
    const rtype    = ((toolInput.research_type as string | undefined) ?? 'general') as ResearchType;
    const queries  = buildQueries(topic, location, rtype, keywords, { name: businessName, description: (agent.business_description as string | null) ?? undefined });
    const results  = await searchMultiple(queries, 8);
    if (!results.length) return { ok: true, leads: [], message: `Sin resultados para "${topic}".` };
    const txt = results.slice(0, 20).map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description}`).join('\n\n');
    return { ok: true, count: results.length, leads: results.slice(0, 20), message: `${results.length} resultado(s) para "${topic}"${location ? ` en ${location}` : ''}. Lee 2-3 con read_url para detalles.\n\n${txt}` };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Civic reports
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'crear_reporte_civico') {
    const { category, description, location_text, caller_name, caller_number } = toolInput as Record<string, string | undefined>;
    const folio = await generateFolio(agentId, supabase);
    const { error } = await supabase.from('civic_reports').insert({ agent_id: agentId, folio, category: category ?? 'otro', description: description ?? null, location_text: location_text ?? null, caller_name: caller_name ?? null, caller_number: caller_number ?? null, status: 'abierto' });
    if (error) return { ok: false, error: 'No se pudo registrar el reporte.' };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const attachUrl = `${appUrl}/r/${folio}/adjuntar`;
    return { ok: true, folio, attach_url: attachUrl, message: `Reporte registrado con folio ${folio}. Si tiene fotos, puede subirlas aquí: ${attachUrl}` };
  }

  if (toolName === 'consultar_reporte_civico') {
    const { folio: qf, caller_number: qp } = toolInput as { folio?: string; caller_number?: string };
    if (!qf && !qp) return { ok: false, error: 'Proporciona folio o número de teléfono.' };
    let q = supabase.from('civic_reports').select('folio,category,description,location_text,status,notes,created_at').eq('agent_id', agentId);
    if (qf) q = q.eq('folio', qf.toUpperCase());
    else    q = (q as any).eq('caller_number', qp).order('created_at', { ascending: false }).limit(5);
    const { data: rpts } = await q;
    const list = rpts ?? [];
    if (!list.length) return { ok: true, reports: [], message: 'No se encontraron reportes.' };
    const lines = (list as any[]).map(r => `${r.folio} | ${r.category} | ${STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status} | ${r.description ?? ''}`);
    return { ok: true, reports: list, message: `${list.length} reporte(s):\n${lines.join('\n')}` };
  }

  if (toolName === 'actualizar_reporte_civico') {
    const { folio, status: uStatus, notes } = toolInput as { folio: string; status?: string; notes?: string };
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (uStatus) { updates.status = uStatus; if (uStatus === 'resuelto' || uStatus === 'cerrado') updates.resolved_at = new Date().toISOString(); }
    if (notes !== undefined) updates.notes = notes;
    const { error } = await supabase.from('civic_reports').update(updates).eq('agent_id', agentId).eq('folio', folio.toUpperCase());
    return error ? { ok: false, error: 'No se pudo actualizar.' } : { ok: true, message: `Reporte ${folio} actualizado.` };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // extraer_tono_de_marca — brand voice guide extraction desde muestras
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'extraer_tono_de_marca') {
    const { extractBrandVoice } = await import('@/lib/brand/voice-guide');
    const raw = (toolInput.muestras as unknown) ?? (toolInput.samples as unknown) ?? [];
    const samples = Array.isArray(raw) ? (raw as unknown[]).map(s => String(s)) : [];
    const result = await extractBrandVoice({ portalEmail, samples, supabase });
    if (!result.ok) return { ok: false, error: result.error, message: result.error };
    return {
      ok: true,
      guide: result.guide,
      message: `Guía de tono guardada. Los empleados hablarán con este estilo desde ahora.\n\n${result.guide?.slice(0, 800) ?? ''}${(result.guide?.length ?? 0) > 800 ? '\n…' : ''}`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // extraer_voz_del_cliente — VoC extraction desde llamadas/correos/tickets
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'extraer_voz_del_cliente') {
    const { extractVoiceOfCustomer, formatVoCForAgent } = await import('@/lib/voc/extract');
    const source     = (toolInput.fuente        as 'calls'|'emails'|'tickets'|'all' | undefined) ?? 'all';
    const days       = Math.min(Math.max(Number(toolInput.dias) || 30, 7), 180);
    const minSamples = Math.min(Math.max(Number(toolInput.min_muestras) || 20, 5), 100);
    const result = await extractVoiceOfCustomer({
      portalEmail, source, days, minSamples, supabase,
      requestedBy: agentId || null,
    });
    return { ...result, message: formatVoCForAgent(result) };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // reportar_falla
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'reportar_falla') {
    const tipo        = (toolInput.tipo        as string | null) ?? 'Detectado por agente';
    const descripcion = (toolInput.descripcion as string | null) ?? '';
    const contexto    = (toolInput.contexto    as string | null) ?? null;
    if (descripcion.trim()) {
      const full = contexto ? `${descripcion.trim()}\n\nContexto:\n${contexto.trim()}` : descripcion.trim();
      const to   = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
      await sendEmail({ to, subject: `Reporte de falla (ops): ${agentName} — ${businessName}`, html: bugReportHtml({ businessName, reporterName: agentName, reporterEmail: (agent.client_email as string | null) ?? '', category: tipo, description: full }) });
      const { triggerNashMonitor } = await import('@/lib/ops/nash-trigger');
      triggerNashMonitor(`reportar_falla from ${agentName}`);
    }
    return {
      ok: true,
      message: 'Reporte enviado al equipo de Centinelia. IMPORTANTE: tu turno NO termina aquí. Ahora continúa atendiendo la solicitud original del dueño (invoca las herramientas que necesites para completarla, no solo texto).',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // revisar_incidentes_plataforma (Nash-only)
  // Lee las 5 fuentes de incidentes que Nash monitorea y devuelve señales
  // nuevas (dedupe contra platform_incidents no-cerrados).
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'revisar_incidentes_plataforma') {
    const features       = (agent.features as Record<string, unknown> | null) ?? {};
    const meerkatRoleId  = features.meerkat_role_id;
    if (meerkatRoleId !== 'nash') {
      return { ok: false, error: 'Solo Nash puede usar revisar_incidentes_plataforma.' };
    }
    if (features.nash_passive_discovery === false) {
      return { ok: false, error: 'Descubrimiento pasivo desactivado en la configuración de Nash (features.nash_passive_discovery).' };
    }

    const days      = Math.max(1, Math.min(30, (toolInput.days as number | undefined) ?? 7));
    const now       = Date.now();
    const sinceIso  = new Date(now - days * 86_400_000).toISOString();
    const staleIso  = new Date(now - 24 * 3_600_000).toISOString();
    const perSource = Math.max(1, Math.min(100, (toolInput.limit_per_source as number | undefined) ?? 25));

    // Dedupe: source_id de TODOS los incidentes ya rastreados por Nash
    // (incluye resolved/closed). Antes filtraba solo abiertos y eso causaba
    // que reopens cuyo incidente duplicado quedó cerrado se reprocesaran
    // como señal fresca cada 10min → spam de ACKs al cliente.
    const { data: trackedRows } = await supabase
      .from('platform_incidents')
      .select('source, source_id, id, updated_at')
      .not('source_id', 'is', null);
    const trackedSet = new Set<string>(
      (trackedRows ?? [])
        .filter((r): r is { source: string; source_id: string; id: string; updated_at: string } => typeof r.source_id === 'string')
        .map(r => `${r.source}:${r.source_id}`)
    );
    // Mapa id → updated_at para filtro de reopens ya procesados (abajo).
    const incidentUpdatedById = new Map<string, string>(
      (trackedRows ?? [])
        .filter((r): r is { source: string; source_id: string; id: string; updated_at: string } => typeof r.id === 'string')
        .map(r => [r.id, r.updated_at])
    );

    // 1) Bug reports enviados vía tool `reportar_falla` (log en tool_call_log).
    const { data: bugRaw } = await supabase
      .from('tool_call_log')
      .select('id, agent_id, portal_email, input_json, created_at')
      .eq('tool_name', 'reportar_falla')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(perSource);

    // Segundo pase de dedup para reopens: un tool_call_log con
    // source='incident_reply' referencia un incidente existente por UUID.
    // Si ese incidente fue tocado (updated_at) DESPUÉS del reply, Nash ya lo
    // procesó → no re-emitir como señal nueva. Sin esto, los reopens quedan
    // en tool_call_log indefinidamente y se re-procesan en cada ciclo cron.
    const REOPEN_RE = /Referencia incidente:\s*([0-9a-f-]{36})/i;
    const handledReopenRowIds = new Set<string>();
    for (const r of (bugRaw ?? [])) {
      const input = (r.input_json ?? {}) as Record<string, unknown>;
      if (input.source !== 'incident_reply') continue;
      const m = String(input.descripcion ?? '').match(REOPEN_RE);
      if (!m) continue;
      const refUpdated = incidentUpdatedById.get(m[1]);
      if (refUpdated && new Date(refUpdated).getTime() >= new Date(r.created_at as string).getTime()) {
        handledReopenRowIds.add(r.id as string);
      }
    }

    const bug_reports = (bugRaw ?? [])
      .filter(r => !trackedSet.has(`bug_report:${r.id}`) && !handledReopenRowIds.has(r.id as string))
      .map(r => {
        const input = (r.input_json ?? {}) as Record<string, unknown>;
        return {
          id:            r.id,
          agent_id:      r.agent_id,
          portal_email:  r.portal_email,
          tipo:          input.tipo ?? null,
          descripcion:   input.descripcion ?? null,
          contexto:      input.contexto ?? null,
          created_at:    r.created_at,
        };
      });

    // 2) Errores de LLM (llm_call_log.error is not null).
    const { data: llmRaw } = await supabase
      .from('llm_call_log')
      .select('id, source, model, agent_id, portal_email, error, created_at')
      .not('error', 'is', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(perSource);
    const error_logs = (llmRaw ?? []).filter(r => !trackedSet.has(`error_log:${r.id}`));

    // 3) Bandeja escalada estancada (>24h sin actualización).
    const { data: inboxRaw } = await supabase
      .from('ops_inbox')
      .select('id, agent_id, email_from, email_subject, category, updated_at, created_at')
      .eq('status', 'escalated')
      .lt('updated_at', staleIso)
      .order('updated_at', { ascending: true })
      .limit(perSource);
    const escalated_stale = (inboxRaw ?? []).filter(r => !trackedSet.has(`escalated_inbox:${r.id}`));

    // 4) Handoff replies fallidos sin resolver.
    const { data: hfRaw } = await supabase
      .from('handoff_failed_responses')
      .select('id, from_email, subject, retry_count, last_error, last_attempted_at, notified_admin_at')
      .is('resolved_at', null)
      .gte('created_at', sinceIso)
      .order('last_attempted_at', { ascending: false })
      .limit(perSource);
    const failed_handoffs = (hfRaw ?? []).filter(r => !trackedSet.has(`failed_handoff:${r.id}`));

    // 5) agent_tasks status='failed'.
    const { data: atRaw } = await supabase
      .from('agent_tasks')
      .select('id, portal_email, title, description, result, eval_notes, updated_at')
      .eq('status', 'failed')
      .gte('updated_at', sinceIso)
      .order('updated_at', { ascending: false })
      .limit(perSource);
    const failed_tasks = (atRaw ?? []).filter(r => !trackedSet.has(`agent_task:${r.id}`));

    // 6) Incidentes pendientes de verificación — Nash necesita saber cuáles
    // están en 'sent_to_claude_code' o 'awaiting_verification' para llamar
    // verificar_fix. Incluye affected_agent_id/affected_portal_email para que
    // Nash pueda notificar al cliente afectado tras resolver.
    const { data: pendingRaw } = await supabase
      .from('platform_incidents')
      .select('id, title, source, source_id, status, created_at, github_issue_url, affected_agent_id, affected_portal_email')
      .in('status', ['sent_to_claude_code', 'awaiting_verification'])
      .order('updated_at', { ascending: true })
      .limit(perSource);
    const pending_verification = pendingRaw ?? [];

    const totalNew = bug_reports.length + error_logs.length + escalated_stale.length + failed_handoffs.length + failed_tasks.length;

    return {
      ok: true,
      summary: {
        window_days:                days,
        already_tracked_count:      trackedSet.size,
        total_new_signals:          totalNew,
        bug_reports_count:          bug_reports.length,
        error_logs_count:           error_logs.length,
        escalated_stale_count:      escalated_stale.length,
        failed_handoffs_count:      failed_handoffs.length,
        failed_tasks_count:         failed_tasks.length,
        pending_verification_count: pending_verification.length,
      },
      bug_reports,
      error_logs,
      escalated_stale,
      failed_handoffs,
      failed_tasks,
      pending_verification,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Nash F3 — tools de acción sobre platform_incidents
  // Todas gated por meerkat_role_id === 'nash' (defense in depth).
  // ─────────────────────────────────────────────────────────────────────────
  if ([
    'crear_incidente',
    'responder_cliente_afectado',
    'enviar_a_claude_code',
    'escalar_al_owner',
    'verificar_fix',
    'consultar_billing_org',
    'audit_ops_consumption',
  ].includes(toolName)) {
    const features = (agent.features as Record<string, unknown> | null) ?? {};
    if (features.meerkat_role_id !== 'nash') {
      return { ok: false, error: `Solo Nash puede usar ${toolName}.` };
    }

    if (toolName === 'consultar_billing_org') {
      // Fuente de verdad para responder al owner sobre billing sin alucinar.
      // Lee pool minutos + tareas + modelo + ledger flag. Sin esta tool Nash
      // inventaba cifras cuando le preguntaban "cuánto llevo este mes".
      // Ver [[feedback-audit-read-path-fidelity]].
      const targetEmail = String(toolInput.portal_email ?? '').trim().toLowerCase();
      if (!targetEmail) return { ok: false, error: 'portal_email es obligatorio' };
      const [acctMinsRes, orgRes, acctOpsRes, peersRes] = await Promise.all([
        supabase.from('account_minutes')
          .select('minutes_used, minutes_included, minutes_reset_date')
          .eq('portal_email', targetEmail).maybeSingle(),
        supabase.from('organizations')
          .select('billing_model, monthly_ops_pool, monthly_ops_used, ops_ledger_enabled, pool_reset_date, business_email')
          .eq('portal_email', targetEmail).maybeSingle(),
        supabase.from('account_ops')
          .select('ops_used, ops_included, ops_balance')
          .eq('portal_email', targetEmail).maybeSingle(),
        supabase.from('voice_agents')
          .select('id, agent_name, business_name, jornada_type, minutes_used, minutes_included, ai_ops_used, ai_ops_limit, active, billing_status')
          .eq('portal_email', targetEmail),
      ]);
      const acctMins = acctMinsRes.data as { minutes_used?: number | null; minutes_included?: number | null; minutes_reset_date?: string | null } | null;
      const org      = orgRes.data as { billing_model?: string | null; monthly_ops_pool?: number | null; monthly_ops_used?: number | null; ops_ledger_enabled?: boolean | null; pool_reset_date?: string | null; business_email?: string | null } | null;
      const acctOps  = acctOpsRes.data as { ops_used?: number | null; ops_included?: number | null; ops_balance?: number | null } | null;
      const peers    = (peersRes.data ?? []) as Array<{ id: string; agent_name: string | null; business_name: string | null; jornada_type: string | null; minutes_used: number | null; minutes_included: number | null; ai_ops_used: number | null; ai_ops_limit: number | null; active: boolean | null; billing_status: string | null }>;
      if (!org && !acctMins && peers.length === 0) {
        return { ok: false, error: `No se encontró organización con portal_email=${targetEmail}` };
      }
      const ledgerEnabled = !!org?.ops_ledger_enabled;
      const activePeers   = peers.filter(p => p.active !== false);
      const summedMinIncl = activePeers.reduce((s, p) => s + ((p.minutes_included as number) ?? 0), 0);
      const summedMinUsed = activePeers.reduce((s, p) => s + ((p.minutes_used     as number) ?? 0), 0);
      const summedOpsLim  = activePeers.reduce((s, p) => s + ((p.ai_ops_limit     as number) ?? 0), 0);
      const summedOpsUsed = activePeers.reduce((s, p) => s + ((p.ai_ops_used      as number) ?? 0), 0);
      const poolActive    = typeof acctMins?.minutes_included === 'number' && acctMins.minutes_included > 0;
      const minutesIncluded = poolActive ? acctMins!.minutes_included! : (summedMinIncl > 0 ? summedMinIncl : 0);
      const minutesUsed     = poolActive ? (acctMins?.minutes_used ?? 0) : summedMinUsed;
      const orgPoolTotal    = (org?.monthly_ops_pool as number | null) ?? null;
      const orgPoolUsed     = (org?.monthly_ops_used as number | null) ?? null;
      const opsLimit = orgPoolTotal != null ? orgPoolTotal : summedOpsLim;
      const opsUsed  = (ledgerEnabled && typeof acctOps?.ops_used === 'number')
        ? acctOps.ops_used
        : orgPoolTotal != null ? (orgPoolUsed ?? 0) : summedOpsUsed;
      return {
        ok: true,
        portal_email:        targetEmail,
        billing_model:       org?.billing_model ?? 'stripe',
        contact_email:       org?.business_email ?? null,
        pool_minutes: {
          included:  minutesIncluded,
          used:      minutesUsed,
          remaining: Math.max(0, minutesIncluded - minutesUsed),
          pct:       minutesIncluded > 0 ? Math.round((minutesUsed / minutesIncluded) * 100) : 0,
          reset_date: acctMins?.minutes_reset_date ?? null,
          source: poolActive ? 'account_minutes' : (summedMinIncl > 0 ? 'sum_per_agent' : 'unknown'),
        },
        pool_ops: {
          included:  opsLimit,
          used:      opsUsed,
          remaining: Math.max(0, opsLimit - opsUsed),
          pct:       opsLimit > 0 ? Math.round((opsUsed / opsLimit) * 100) : 0,
          reset_date: org?.pool_reset_date ?? null,
          ledger_enabled: ledgerEnabled,
          source: (ledgerEnabled && typeof acctOps?.ops_used === 'number')
            ? 'account_ops'
            : orgPoolTotal != null ? 'organizations' : 'sum_per_agent',
        },
        employees: activePeers.map(p => ({
          id:              p.id,
          name:            p.agent_name ?? p.business_name ?? 'empleado',
          jornada_type:    p.jornada_type ?? null,
          billing_status:  p.billing_status ?? null,
        })),
        note: 'Estos números son la fuente de verdad. Al owner: reporta tal cual; nunca los estimes de memoria. Menciona ledger_enabled=false explícitamente si el owner pregunta detalle, porque ese caso los per-empleado pueden estar stale.',
      };
    }

    if (toolName === 'crear_incidente') {
      const title       = String(toolInput.title       ?? '').trim();
      const description = String(toolInput.description ?? '').trim();
      const priority    = String(toolInput.priority    ?? 'med');
      const source      = String(toolInput.source      ?? 'nash_self_discovery');
      const sourceId    = toolInput.source_id             != null ? String(toolInput.source_id)             : null;
      const affectedId  = toolInput.affected_agent_id     != null ? String(toolInput.affected_agent_id)     : null;
      const affectedEm  = toolInput.affected_portal_email != null ? String(toolInput.affected_portal_email) : null;
      if (!title || !description) return { ok: false, error: 'title y description son obligatorios' };
      if (!['low', 'med', 'high', 'critical'].includes(priority)) return { ok: false, error: `priority inválida: ${priority}` };
      if (!['bug_report', 'error_log', 'escalated_inbox', 'failed_handoff', 'agent_task', 'nash_self_discovery', 'manual'].includes(source)) {
        return { ok: false, error: `source inválida: ${source}` };
      }

      // Guard duro contra reapertura: si el body es un reopen (contiene
      // marcador o Referencia incidente), rechazar creación y forzar a Nash
      // a comentar en el incidente existente vía enviar_a_claude_code.
      // Sonnet a veces viola la regla 2b del prompt y crea duplicados —
      // esto es defensa en profundidad.
      const REOPEN_MARK_RE = /\[REABRI[ÓO] CASO\]|Referencia incidente:\s*([0-9a-f-]{36})/i;
      const reopenMatch = description.match(REOPEN_MARK_RE);
      if (reopenMatch) {
        const refUuidMatch = description.match(/Referencia incidente:\s*([0-9a-f-]{36})/i);
        const refId = refUuidMatch?.[1] ?? null;
        return {
          ok: false,
          error: 'este contenido es una reapertura de un incidente existente — no crees uno nuevo. Llama enviar_a_claude_code con incidente_id del incidente referenciado (agrega comment al GH issue existente) y responder_cliente_afectado con el mismo incidente_id para el ACK.',
          reopen_of_incident_id: refId,
        };
      }
      if (sourceId) {
        const { data: existing } = await supabase
          .from('platform_incidents')
          .select('id, status')
          .eq('source', source)
          .eq('source_id', sourceId)
          .not('status', 'in', '(resolved,closed)')
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          return { ok: true, incident_id: existing.id as string, deduped: true, existing_status: existing.status as string };
        }
      }
      const { data, error } = await supabase
        .from('platform_incidents')
        .insert({
          title, description, priority, source,
          source_id: sourceId, affected_agent_id: affectedId, affected_portal_email: affectedEm,
          status: 'open', assigned_to: 'nash',
        })
        .select('id')
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, incident_id: data.id as string, deduped: false };
    }

    if (toolName === 'responder_cliente_afectado') {
      const affectedId = String(toolInput.agent_id     ?? '').trim();
      const mensaje    = String(toolInput.mensaje      ?? '').trim();
      const canal      = String(toolInput.canal        ?? 'email');
      const incidentId = String(toolInput.incidente_id ?? '').trim();
      if (!affectedId || !mensaje) return { ok: false, error: 'agent_id y mensaje son obligatorios' };
      if (!['email', 'whatsapp'].includes(canal)) return { ok: false, error: `canal inválido: ${canal}` };
      const { data: target } = await supabase
        .from('voice_agents')
        .select('client_email, transfer_whatsapp, business_name, portal_email')
        .eq('id', affectedId)
        .maybeSingle();
      if (!target) return { ok: false, error: `no encontré voice_agent con id ${affectedId}` };
      // Intent lock: Nash + otro incident responder no deben mandar el mismo
      // update dos veces al mismo cliente afectado. Bucketing 6h para
      // permitir un follow-up razonable en el mismo día.
      const {
        tryClaimReportIntent: tryClaim1,
        commitReportIntent:   commit1,
        releaseReportIntent:  release1,
        formatDuplicateReportMessage: fmtDup1,
      } = await import('@/lib/ops/report-intent-lock');
      const contactTarget = canal === 'whatsapp'
        ? String(target.transfer_whatsapp ?? affectedId)
        : String(target.client_email ?? affectedId);
      const claimNash = await tryClaim1({
        portalEmail: (target.portal_email as string) ?? portalEmail,
        kind:        canal as 'email' | 'whatsapp',
        target:      contactTarget,
        subject:     `[Nash] responder_cliente_afectado :: ${incidentId || target.business_name || affectedId}`,
        agentId,
        agentName:   agentName || 'Nash',
        ttlHours:    6,
        extraDedupe: mensaje.slice(0, 400),
        sourceContext: { tool: 'responder_cliente_afectado', incident_id: incidentId || null },
      });
      if (!claimNash.claimed) {
        return {
          ok: false,
          deduped: true,
          message: fmtDup1(claimNash),
          already_claimed_by: claimNash.alreadyClaimedBy,
        };
      }
      if (canal === 'whatsapp') {
        const to = target.transfer_whatsapp as string | null;
        if (!to) { await release1(claimNash.lockId); return { ok: false, error: 'el cliente no tiene transfer_whatsapp configurado, prueba con email' }; }
        const { sendWhatsApp } = await import('@/lib/whatsapp/send');
        const okWa = await sendWhatsApp(to, `Centinelia (Nash):\n\n${mensaje}`);
        if (!okWa) { await release1(claimNash.lockId); return { ok: false, error: 'sendWhatsApp devolvió false — revisa TWILIO_*' }; }
        await commit1(claimNash.lockId);
        return { ok: true, delivered_to: to, channel: 'whatsapp', business: target.business_name };
      }
      const to = target.client_email as string | null;
      if (!to) { await release1(claimNash.lockId); return { ok: false, error: 'el cliente no tiene client_email configurado' }; }

      // Reply-To bidireccional: si el cliente responde a este correo, el inbound
      // webhook detecta el token del incidente y reabre el caso sin que el cliente
      // tenga que abrir otro reporte.
      let replyTo: string | undefined;
      let replyHint = '';
      if (incidentId) {
        const { incidentReplyAddressFor } = await import('@/lib/email/inbox');
        replyTo   = incidentReplyAddressFor(incidentId);
        replyHint = '<p style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#6b7280;margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;border-left:3px solid #9CA3AF">Si el problema persiste o quieres seguir la conversación, simplemente <strong>responde a este correo</strong>. Tu mensaje reabre el caso automáticamente, no necesitas levantar otro reporte.</p>';
      }

      try {
        await sendEmail({
          to,
          subject: `Centinelia (Nash): actualización sobre ${target.business_name ?? 'tu cuenta'}`,
          html:    `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6">${mensaje.replace(/\n/g, '<br>')}</p>${replyHint}<p style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#6b7280;margin-top:24px">Nash, Centinelia interno</p>`,
          replyTo,
          // Infra lista para separar la identidad de Nash del correo genérico
          // de notificaciones. Cuando NASH_EMAIL_FROM esté seteado en Vercel
          // (ej. "Nash de Centinelia <nash@centinelia.mx>"), Nash enviará
          // desde ese buzón. Sin la var, cae al default RESEND_FROM_EMAIL
          // (notificaciones@centinelia.mx).
          from:    process.env.NASH_EMAIL_FROM,
        });
      } catch (e) {
        await release1(claimNash.lockId);
        throw e;
      }
      await commit1(claimNash.lockId);
      return { ok: true, delivered_to: to, channel: 'email', business: target.business_name, reply_to: replyTo ?? null, from: process.env.NASH_EMAIL_FROM ?? 'default' };
    }

    if (toolName === 'enviar_a_claude_code') {
      const incidentId = String(toolInput.incidente_id ?? '').trim();
      const prompt     = String(toolInput.prompt       ?? '').trim();
      const labelsIn   = Array.isArray(toolInput.labels) ? (toolInput.labels as unknown[]).map(l => String(l)) : [];
      if (!incidentId || !prompt) return { ok: false, error: 'incidente_id y prompt son obligatorios' };
      const { data: incident, error: readErr } = await supabase
        .from('platform_incidents')
        .select('id, title, description, priority, source, meta, github_issue_url')
        .eq('id', incidentId)
        .maybeSingle();
      if (readErr) return { ok: false, error: readErr.message };
      if (!incident) return { ok: false, error: `incidente ${incidentId} no encontrado` };

      // Si ya hay GH issue creado (típicamente porque el cliente reabrió el
      // caso respondiendo al email), agregamos COMMENT al issue existente en
      // lugar de crear uno nuevo. Mantiene la conversación en un solo lugar
      // y evita duplicados en /admin/soporte.
      if (incident.github_issue_url) {
        const token = process.env.NASH_GITHUB_TOKEN;
        const repo  = process.env.NASH_GITHUB_REPO ?? 'Centinelia/Centinelia';
        const issueNumMatch = (incident.github_issue_url as string).match(/\/issues\/(\d+)/);
        const issueNum = issueNumMatch?.[1];
        if (token && issueNum) {
          try {
            const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNum}/comments`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept':        'application/vnd.github+json',
                'Content-Type':  'application/json',
                'User-Agent':    'nash-centinelia',
              },
              body: JSON.stringify({
                body: `**Actualización de Nash** (${new Date().toISOString().slice(0, 16).replace('T', ' ')})\n\n${prompt}\n\n---\n\n_Este comentario fue agregado porque el cliente respondió confirmando que el problema persiste. Ver metadata del incidente ${incident.id} en /admin/soporte._`,
              }),
            });
            if (res.ok) {
              const prevMeta = (incident.meta as Record<string, unknown> | null) ?? {};
              const commentsLog = Array.isArray(prevMeta.claude_code_comments) ? prevMeta.claude_code_comments : [];
              await supabase.from('platform_incidents')
                .update({
                  status: 'sent_to_claude_code',
                  meta:   { ...prevMeta, claude_code_comments: [...commentsLog, { at: new Date().toISOString(), preview: prompt.slice(0, 200) }] },
                })
                .eq('id', incidentId);
              return { ok: true, github_issue_url: incident.github_issue_url as string, added_comment: true, already_sent: true };
            }
            return { ok: false, error: `github comment failed: ${res.status}`, github_issue_url: incident.github_issue_url as string };
          } catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e), github_issue_url: incident.github_issue_url as string };
          }
        }
        return { ok: true, github_issue_url: incident.github_issue_url as string, already_sent: true, warning: 'no se pudo agregar comment (falta token o issue num)' };
      }

      const token  = process.env.NASH_GITHUB_TOKEN;
      const repo   = process.env.NASH_GITHUB_REPO ?? 'Centinelia/Centinelia';
      const labels = ['bug', 'from-nash', `priority-${incident.priority}`, ...labelsIn];
      const prevMeta: Record<string, unknown> = (incident.meta as Record<string, unknown> | null) ?? {};
      const patch: Record<string, unknown> = {
        status: 'sent_to_claude_code',
        meta:   { ...prevMeta, claude_code_prompt: prompt, sent_to_cc_at: new Date().toISOString() },
      };
      let deliveredVia: 'github' | 'email_fallback' = 'email_fallback';
      let issueUrl:     string | null               = null;
      if (token) {
        try {
          const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept':        'application/vnd.github+json',
              'Content-Type':  'application/json',
              'User-Agent':    'nash-meerkat',
            },
            body: JSON.stringify({
              title: `[Nash] ${incident.title}`,
              body:  `${prompt}\n\n---\n\n_Incidente:_ \`${incident.id}\`\n_Prioridad:_ ${incident.priority}\n_Fuente:_ ${incident.source}\n\n_Creado automáticamente por Nash desde /admin/soporte._`,
              labels,
            }),
          });
          if (!res.ok) {
            const errBody = await res.text();
            patch.meta = { ...(patch.meta as Record<string, unknown>), github_error: `${res.status}: ${errBody.slice(0, 500)}` };
          } else {
            const data = await res.json() as { html_url?: string };
            issueUrl = data.html_url ?? null;
            deliveredVia = 'github';
            patch.github_issue_url = issueUrl;
          }
        } catch (e) {
          patch.meta = { ...(patch.meta as Record<string, unknown>), github_error: e instanceof Error ? e.message : String(e) };
        }
      } else {
        patch.meta = { ...(patch.meta as Record<string, unknown>), github_error: 'NASH_GITHUB_TOKEN no configurado' };
      }
      if (!issueUrl) {
        const to = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
        await sendEmail({
          to,
          subject: `[Nash a Claude Code fallback] ${incident.title}`,
          html:    `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:14px"><strong>Incidente:</strong> ${incident.id}<br><strong>Prioridad:</strong> ${incident.priority}<br><strong>Fuente:</strong> ${incident.source}</p><h3 style="font-family:system-ui,-apple-system,sans-serif;font-size:14px">Prompt para Claude Code:</h3><pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap">${prompt.replace(/</g, '&lt;')}</pre>`,
          from:    process.env.NASH_EMAIL_FROM,
        });
      }
      const { error: updateErr } = await supabase
        .from('platform_incidents')
        .update(patch)
        .eq('id', incidentId);
      if (updateErr) return { ok: false, error: updateErr.message };
      return { ok: true, github_issue_url: issueUrl, delivered_via: deliveredVia };
    }

    if (toolName === 'escalar_al_owner') {
      const razon      = String(toolInput.razon      ?? '').trim();
      const urgencia   = String(toolInput.urgencia   ?? 'high');
      const incidentId = toolInput.incidente_id != null ? String(toolInput.incidente_id) : null;
      if (!razon) return { ok: false, error: 'razon es obligatoria' };
      if (!['low', 'med', 'high', 'critical'].includes(urgencia)) {
        return { ok: false, error: `urgencia inválida: ${urgencia}` };
      }
      // Intent lock: si dos incidentes disparan escalación por la misma razón
      // al owner en poco tiempo, deduplicamos para no llenar el WhatsApp del
      // owner. TTL 12h; los 'critical' ignoran la ventana (bypass abajo).
      const {
        tryClaimReportIntent: tryClaim2,
        commitReportIntent:   commit2,
        releaseReportIntent:  release2,
        formatDuplicateReportMessage: fmtDup2,
      } = await import('@/lib/ops/report-intent-lock');
      // 'critical' bypasa el dedupe: el owner debe enterarse sí o sí, aunque
      // suene repetido. Todo lo demás pasa por el lock.
      const claimOwner = urgencia === 'critical'
        ? { claimed: true, lockId: null, intentHash: '', alreadyClaimedBy: null }
        : await tryClaim2({
            portalEmail,
            kind:      'monitor_alert',
            target:    process.env.OWNER_WHATSAPP || (process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx'),
            subject:   `[Nash escalation] ${urgencia} :: ${incidentId ?? 'no-incident'}`,
            agentId,
            agentName: agentName || 'Nash',
            ttlHours:  12,
            extraDedupe: razon.slice(0, 400),
            sourceContext: { tool: 'escalar_al_owner', urgency: urgencia, incident_id: incidentId },
          });
      if (!claimOwner.claimed) {
        return {
          ok: false,
          deduped: true,
          message: fmtDup2(claimOwner),
          already_claimed_by: claimOwner.alreadyClaimedBy,
        };
      }
      const flag     = urgencia === 'critical' ? '[CRITICO]' : urgencia === 'high' ? '[URGENTE]' : '[INFO]';
      const linkNote = incidentId ? `\n\nVer /admin/soporte (id ${incidentId.slice(0, 8)}...)` : '';
      const body     = `${flag} Nash escala (${urgencia}):\n\n${razon}${linkNote}`;
      const owner = process.env.OWNER_WHATSAPP;
      let deliveredVia: 'whatsapp' | 'email_fallback' = 'email_fallback';
      if (owner) {
        const { sendWhatsApp } = await import('@/lib/whatsapp/send');
        const okWa = await sendWhatsApp(owner, body);
        if (okWa) deliveredVia = 'whatsapp';
      }
      if (deliveredVia !== 'whatsapp') {
        const to = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'hola@centinelia.mx';
        try {
          await sendEmail({
            to,
            subject: `${flag} Nash escala (${urgencia})`,
            html:    `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6">${razon.replace(/\n/g, '<br>')}</p>${incidentId ? `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#6b7280">Incidente <code>${incidentId}</code></p>` : ''}`,
            // Ver comentario en responder_cliente_afectado sobre NASH_EMAIL_FROM.
            from:    process.env.NASH_EMAIL_FROM,
          });
        } catch (e) {
          await release2(claimOwner.lockId);
          throw e;
        }
      }
      await commit2(claimOwner.lockId);
      if (incidentId) {
        const { data: inc } = await supabase
          .from('platform_incidents')
          .select('meta')
          .eq('id', incidentId)
          .maybeSingle();
        const prevMeta = (inc?.meta as Record<string, unknown> | null) ?? {};
        await supabase
          .from('platform_incidents')
          .update({
            assigned_to: 'owner',
            meta: { ...prevMeta, escalated_at: new Date().toISOString(), escalation_reason: razon, urgency: urgencia, delivered_via: deliveredVia },
          })
          .eq('id', incidentId);
      }
      return { ok: true, delivered_via: deliveredVia, urgency: urgencia };
    }

    if (toolName === 'verificar_fix') {
      const incidentId = String(toolInput.incidente_id ?? '').trim();
      if (!incidentId) return { ok: false, error: 'incidente_id es obligatorio' };
      const { data: incident } = await supabase
        .from('platform_incidents')
        .select('id, source, source_id, status, github_issue_url')
        .eq('id', incidentId)
        .maybeSingle();
      if (!incident) return { ok: false, error: `incidente ${incidentId} no encontrado` };
      if (incident.status === 'resolved' || incident.status === 'closed') {
        return { ok: true, verified: true, new_status: incident.status as string, notes: 'ya estaba cerrado' };
      }
      const source   = incident.source    as string;
      const sourceId = incident.source_id as string | null;
      let verified = false;
      let notes    = '';

      // Señal fuerte: GitHub issue cerrado. Si Nash mandó el bug a Claude Code
      // y el issue quedó closed, el fix ya se hizo. Esto vale para CUALQUIER
      // source (bug_report, error_log, agent_task…), porque `tool_call_log`
      // rows no se borran cuando Claude Code cierra el bug — sin esta señal,
      // bug_reports quedaban perpetuamente en awaiting_verification y Nash
      // nunca mandaba el correo de "ya está resuelto".
      const ghIssueUrl = incident.github_issue_url as string | null;
      if (ghIssueUrl) {
        const token = process.env.NASH_GITHUB_TOKEN;
        const repo  = process.env.NASH_GITHUB_REPO ?? 'Centinelia/Centinelia';
        const numMatch = ghIssueUrl.match(/\/issues\/(\d+)/);
        if (token && numMatch) {
          try {
            const res = await fetch(`https://api.github.com/repos/${repo}/issues/${numMatch[1]}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept':        'application/vnd.github+json',
                'User-Agent':    'nash-meerkat',
              },
            });
            if (res.ok) {
              const issue = await res.json() as { state?: string; closed_at?: string | null };
              if (issue.state === 'closed') {
                verified = true;
                notes    = `GitHub issue cerrado${issue.closed_at ? ` en ${issue.closed_at}` : ''}`;
              }
            }
          } catch { /* falla silenciosa: caemos a la verificación por source */ }
        }
      }

      if (!verified && !sourceId && source !== 'error_log') {
        return { ok: true, verified: false, new_status: incident.status as string, notes: 'incidente sin source_id no puede auto-verificarse; requiere validación manual' };
      }
      if (verified) {
        // GitHub cerró el issue → salta el chequeo per-source y marca resolved.
        const { error: updErr } = await supabase
          .from('platform_incidents')
          .update({ status: 'resolved', resolution: `Auto-verificado por Nash: ${notes}` })
          .eq('id', incidentId);
        if (updErr) return { ok: false, error: updErr.message };
        return { ok: true, verified: true, new_status: 'resolved', notes };
      }
      if (source === 'agent_task' && sourceId) {
        const { data: task } = await supabase
          .from('agent_tasks')
          .select('status, goal_met, completed_at')
          .eq('id', sourceId)
          .maybeSingle();
        if (!task) { verified = true; notes = 'agent_task ya no existe (borrado)'; }
        else if (task.status === 'completed' || task.goal_met === true) { verified = true; notes = `agent_task ahora status=${task.status}, goal_met=${task.goal_met}`; }
        else notes = `agent_task sigue con status=${task.status}, goal_met=${task.goal_met}`;
      }
      else if (source === 'escalated_inbox' && sourceId) {
        const { data: item } = await supabase.from('ops_inbox').select('status').eq('id', sourceId).maybeSingle();
        if (!item) { verified = true; notes = 'ops_inbox ya no existe'; }
        else if (item.status !== 'escalated') { verified = true; notes = `ops_inbox ahora status=${item.status}`; }
        else notes = 'ops_inbox sigue en status=escalated';
      }
      else if (source === 'failed_handoff' && sourceId) {
        const { data: hf } = await supabase.from('handoff_failed_responses').select('resolved_at').eq('id', sourceId).maybeSingle();
        if (!hf) { verified = true; notes = 'handoff row ya no existe'; }
        else if (hf.resolved_at) { verified = true; notes = `handoff resuelto en ${hf.resolved_at}`; }
        else notes = 'handoff sigue sin resolver';
      }
      else if (source === 'error_log') {
        const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
        const { data: recent } = await supabase
          .from('llm_call_log')
          .select('id')
          .not('error', 'is', null)
          .gte('created_at', cutoff)
          .limit(1);
        if (!recent || recent.length === 0) { verified = true; notes = 'sin errores nuevos en LLM log en 24h'; }
        else notes = `siguen apareciendo errores en LLM log (${recent.length}+ en últimas 24h)`;
      }
      else if (source === 'bug_report' && sourceId) {
        // El source_id apunta al tool_call_log.id del reporte original.
        // Si el owner o alguien lo borró (típicamente porque el bug fue confirmado
        // resuelto), lo tomamos como señal de cierre. Si sigue existiendo, dejamos
        // awaiting_verification para revisión manual.
        const { data: original } = await supabase
          .from('tool_call_log')
          .select('id')
          .eq('id', sourceId)
          .maybeSingle();
        if (!original) { verified = true; notes = 'tool_call_log del reporte original fue borrado (señal ausente)'; }
        else notes = 'reporte original sigue en tool_call_log, requiere validación manual del owner';
      }
      else if (source === 'bug_report') {
        notes = 'bug_report sin source_id no es auto-verificable';
      }
      else {
        notes = `source '${source}' sin verificación automática implementada`;
      }
      if (verified) {
        const { error: updErr } = await supabase
          .from('platform_incidents')
          .update({ status: 'resolved', resolution: `Auto-verificado por Nash: ${notes}` })
          .eq('id', incidentId);
        if (updErr) return { ok: false, error: updErr.message };
        return { ok: true, verified: true, new_status: 'resolved', notes };
      }
      const { error: updErr } = await supabase
        .from('platform_incidents')
        .update({ status: 'awaiting_verification' })
        .eq('id', incidentId);
      if (updErr) return { ok: false, error: updErr.message };
      return { ok: true, verified: false, new_status: 'awaiting_verification', notes };
    }

    if (toolName === 'audit_ops_consumption') {
      // Detección de silent-drain: analiza ratio events/refs (posible re-cobro)
      // y baseline moving-average (spike vs 4 semanas previas) para un portal.
      // Uso: cuando el owner pregunta sobre el pool, o proactivamente cuando
      // detectPlatformAnomalies() lo señala como sospechoso.
      const { auditConsumption, compareWithBaseline } = await import('@/lib/ops/consumption-audit');
      const targetEmail = String(toolInput.portal_email ?? '').trim().toLowerCase();
      if (!targetEmail) return { ok: false, error: 'portal_email es obligatorio' };
      const days = Number(toolInput.days ?? 7);
      const [ratioAudit, baselineAudit] = await Promise.all([
        auditConsumption(targetEmail, days),
        compareWithBaseline(targetEmail),
      ]);
      const ratioAnomalies = ratioAudit.filter(r => r.is_anomalous_ratio);
      const spikeAnomalies = baselineAudit.filter(b => b.is_anomalous_spike);
      return {
        ok:                     true,
        portal_email:           targetEmail,
        window_days:            days,
        sources_analyzed:       ratioAudit.length,
        ratio_findings:         ratioAudit,
        ratio_anomalies:        ratioAnomalies,
        baseline_comparisons:   baselineAudit,
        spike_anomalies:        spikeAnomalies,
        anomaly_count:          ratioAnomalies.length + spikeAnomalies.length,
        interpretation:         (ratioAnomalies.length === 0 && spikeAnomalies.length === 0)
          ? 'Sin anomalías detectadas. Consumo dentro de rangos esperados.'
          : `⚠️ ${ratioAnomalies.length} ratio anomalies (posible re-cobro) + ${spikeAnomalies.length} spikes vs baseline. Revisar sources listadas en ratio_anomalies y spike_anomalies.`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mercado Libre — require portal cookie (not available in email context)
  // ─────────────────────────────────────────────────────────────────────────
  if (['analizar_publicaciones_ml', 'crear_publicacion_ml', 'actualizar_publicacion_ml', 'ver_metricas_ml'].includes(toolName)) {
    if (!ctx.cookieHeader) return { ok: false, error: 'Mercado Libre no está disponible en este canal.' };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const headers = { 'Content-Type': 'application/json', Cookie: `${PORTAL_COOKIE}=${ctx.cookieHeader}` };

    if (toolName === 'analizar_publicaciones_ml') {
      const res  = await fetch(`${appUrl}/api/portal/${portalToken}/integrations/ml/listings`, { headers });
      if (!res.ok) return { ok: false, error: 'Mercado Libre no conectado.' };
      const data = await res.json() as { items: unknown[] };
      const items = data.items ?? [];
      if (!items.length) return { ok: true, items: [], message: 'Sin publicaciones activas en Mercado Libre.' };
      const lines = (items as Array<Record<string, unknown>>).map(i => `- [${i.id}] ${i.title} | $${i.price} MXN | Stock: ${i.available_quantity} | ${i.status} | ${i.permalink}`).join('\n');
      return { ok: true, items, message: `${items.length} publicación(es):\n${lines}` };
    }
    if (toolName === 'crear_publicacion_ml') {
      const res = await fetch(`${appUrl}/api/portal/${portalToken}/integrations/ml/items`, { method: 'POST', headers, body: JSON.stringify(toolInput) });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; return { ok: false, error: e.error ?? 'No se pudo crear la publicación.' }; }
      const data = await res.json() as { item: Record<string, unknown> };
      return { ok: true, item: data.item, message: `Publicación creada. ID: ${data.item?.id}. Ver: ${data.item?.permalink}` };
    }
    if (toolName === 'actualizar_publicacion_ml') {
      const itemId = toolInput.item_id as string;
      if (!itemId) return { ok: false, error: 'Se requiere item_id.' };
      const payload: Record<string, unknown> = {};
      if (toolInput.price              !== undefined) payload.price              = toolInput.price;
      if (toolInput.available_quantity !== undefined) payload.available_quantity = toolInput.available_quantity;
      if (toolInput.title              !== undefined) payload.title              = toolInput.title;
      const res = await fetch(`${appUrl}/api/portal/${portalToken}/integrations/ml/items/${itemId}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(() => ({})) as { error?: string }; return { ok: false, error: e.error ?? 'No se pudo actualizar.' }; }
      return { ok: true, message: `Publicación ${itemId} actualizada.` };
    }
    if (toolName === 'ver_metricas_ml') {
      const res  = await fetch(`${appUrl}/api/portal/${portalToken}/integrations/ml/metrics`, { headers });
      if (!res.ok) return { ok: false, error: 'Mercado Libre no conectado.' };
      const data = await res.json() as { item_count: number; visits: unknown; recent_orders: Array<Record<string, unknown>>; period: { from: string; to: string } };
      const orders = data.recent_orders ?? [];
      const total  = orders.reduce((s, o) => s + ((o.total_amount as number) ?? 0), 0);
      const lines  = orders.slice(0, 5).map(o => `- Orden #${o.id} | $${o.total_amount} | ${o.status} | ${o.date_created}`).join('\n');
      return { ok: true, data, message: [`Mercado Libre (${data.period?.from} al ${data.period?.to}):`, `- Publicaciones: ${data.item_count}`, `- Ventas recientes: ${orders.length} | Total: $${total.toFixed(2)} MXN`, orders.length ? `\n${lines}` : ''].filter(Boolean).join('\n') };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // delegar_tarea
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'delegar_tarea') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const internalHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.VAPI_SERVER_SECRET) internalHeaders['x-vapi-secret'] = process.env.VAPI_SERVER_SECRET;
    const res    = await fetch(`${appUrl}/api/voice/tools/delegar-tarea?agent_id=${agentId}`, { method: 'POST', headers: internalHeaders, body: JSON.stringify(toolInput) });
    if (!res.ok) return { ok: false, error: 'No se pudo delegar la tarea.' };
    const data = await res.json() as { results?: Array<{ result: string }> };
    const message = data.results?.[0]?.result ?? 'Tarea procesada.';
    // A-F5 fix chaining bug #3: parsear "[Criterio no cumplido]" del sufijo
    // para devolver goal_met explícito. ANTES: siempre ok:true, el modelo
    // caller no podía distinguir success vs criterio no met y reportaba
    // "tarea completada" al owner falsamente. Ver Scope A A3 CRITICAL #3.
    // Approval flow ("Requiere aprobación...") también mapea a ok:false para
    // que el modelo sepa que la tarea NO se ejecutó todavía.
    const goalNotMet = /\[Criterio no cumplido\]/i.test(message);
    const needsApproval = /Requiere aprobaci[oó]n/i.test(message);
    if (goalNotMet || needsApproval) {
      return {
        ok: false,
        goal_met: false,
        needs_approval: needsApproval,
        message,
        error: needsApproval
          ? 'La tarea requiere aprobación del owner antes de ejecutarse. NO reportes al llamante que ya se hizo.'
          : 'El peer no pudo cumplir el criterio de éxito. NO reportes al llamante que ya se hizo — reintenta con más contexto o escala.',
      };
    }
    return { ok: true, goal_met: true, message };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // consultar_agente
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'consultar_agente') {
    const cRol  = toolInput.rol      as string;
    const cTask = toolInput.tarea    as string;
    const cCtx  = (toolInput.contexto as string | undefined) ?? '';
    // A-F5 fix chaining bug #2: caller_verified gate. ANTES: executor no leía
    // caller_verified. Chat auto-inyecta true, pero inbox-processor pasaba lo
    // que el modelo elegía (default false). Email externo podía leer info
    // interna vía consultar_agente que buscaba en Drive. Ver Scope A A3 CRIT #2.
    const cVerified = (toolInput.caller_verified as boolean | undefined) ?? false;
    if (!cRol || !cTask) return { ok: false, error: 'Parámetros insuficientes.' };

    // Cobra 1 op upfront por la consulta al compañero. Iteraciones adicionales
    // dentro del loop de investigación (hasta 4 más) se cobran por iteración.
    const consultBaseOps = await consumeAiOp(agentId, 1, { source: 'consultar_agente', label: 'Consulta a compañero especialista' });
    if (!consultBaseOps.ok) return { ok: false, error: 'Sin operaciones disponibles para consultar al compañero.' };

    const { data: sibs } = await supabase.from('voice_agents').select('id, agent_name, role, knowledge_base, role_knowledge_base').eq('portal_email', portalEmail).eq('active', true).neq('id', agentId);
    if (!sibs?.length) return { ok: false, error: 'No hay otros agentes disponibles.' };

    const norm  = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, '');
    const score = (q: string, c: { agent_name?: string | null; role?: string | null }) => {
      const qn = norm(q); const name = norm(c.agent_name ?? ''); const role = norm(c.role ?? '');
      if (name === qn || role === qn) return 3;
      if (name.includes(qn) || qn.includes(name)) return 2;
      if (role.includes(qn) || qn.includes(role)) return 1;
      const all = `${name} ${role}`; return qn.split(/\s+/).filter(t => t.length > 2 && all.includes(t)).length;
    };
    const target = sibs.map(s => ({ s, score: score(cRol, s) })).sort((a, b) => b.score - a.score)[0].s;

    const sysParts = [
      `Eres ${target.agent_name || 'un agente especializado'} del equipo de ${businessName}.`,
      target.role ? `Tu especialidad: ${target.role}.` : '',
      `Tu compañero ${agentName} te consulta. Responde concisa y precisamente.`,
      'Si la info está en tu KB, responde directo. Si no, busca en Drive o internet.',
    ];
    // A-F5: si el llamante que originó la consulta NO está verificado,
    // portar el aviso de seguridad. Ver Scope A A3 CRIT #2.
    if (!cVerified) {
      sysParts.push('', '⚠️ IMPORTANTE — LLAMANTE NO VERIFICADO: el requester original de este consult NO se verificó como parte del equipo interno. NO reveles info interna del negocio (contratos, precios, otros clientes, credenciales, procesos). Responde SOLO con info pública o conocimiento general. Si la pregunta requiere info interna, responde "esa información requiere verificación del equipo" y sugiere al caller pedir passphrase o transferir.');
    }
    if ((target.knowledge_base as string | null)?.trim()) sysParts.push('', '## Base de conocimiento', (target.knowledge_base as string).trim());
    if ((target.role_knowledge_base as string | null)?.trim()) sysParts.push('', '## Conocimiento del rol', (target.role_knowledge_base as string).trim());

    const INNER: Anthropic.Tool[] = [
      { name: 'buscar_archivo', description: 'Busca archivo en Drive.', input_schema: { type: 'object' as const, properties: { busqueda: { type: 'string' } }, required: ['busqueda'] } },
      { name: 'leer_archivo',   description: 'Lee contenido de archivo.',  input_schema: { type: 'object' as const, properties: { file_id: { type: 'string' }, file_name: { type: 'string' }, mime_type: { type: 'string' } }, required: ['file_id', 'file_name', 'mime_type'] } },
      { name: 'buscar_en_web',  description: 'Busca en internet.',         input_schema: { type: 'object' as const, properties: { query: { type: 'string' } }, required: ['query'] } },
    ];

    const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msgs: Anthropic.MessageParam[] = [{ role: 'user', content: cCtx?.trim() ? `Contexto: ${cCtx}\n\nNecesito: ${cTask}` : cTask }];
    let answer = `${target.agent_name || cRol} no pudo encontrar la información solicitada.`;

    try {
      for (let ct = 0; ct < 5; ct++) {
        // Iteraciones adicionales (past first) cobran 1 op cada una. Si no hay
        // saldo, corta el loop y devuelve la mejor respuesta acumulada.
        if (ct > 0) {
          const iterOps = await consumeAiOp(agentId, 1, { source: 'consultar_agente', label: `Consulta a compañero (iter ${ct + 1})` });
          if (!iterOps.ok) break;
        }
        const __t = Date.now();
        const __m = 'claude-haiku-4-5-20251001';
        let resp;
        try {
          resp = await anth.messages.create({ model: __m, max_tokens: 1024, system: [{ type: 'text', text: sysParts.filter(Boolean).join('\n'), cache_control: { type: 'ephemeral' } }], tools: INNER, messages: msgs });
          void logLlmCall({ source: 'consult', model: __m, usage: resp.usage, agentId: target.id as string, latencyMs: Date.now() - __t });
        } catch (err) {
          void logLlmCall({ source: 'consult', model: __m, usage: { input_tokens: 0, output_tokens: 0 }, agentId: target.id as string, latencyMs: Date.now() - __t, error: err instanceof Error ? err.message : String(err) });
          throw err;
        }
        if (resp.stop_reason === 'end_turn') { const txt = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('').trim(); answer = `[${target.agent_name || cRol}]: ${txt}`; break; }
        if (resp.stop_reason !== 'tool_use') break;
        msgs.push({ role: 'assistant', content: resp.content });
        const res: Anthropic.ToolResultBlockParam[] = [];
        for (const blk of resp.content) {
          if (blk.type !== 'tool_use') continue;
          const inp = blk.input as Record<string, string>;
          let r = '';
          if (blk.name === 'buscar_archivo') { const sr = await executeSearchFiles(target.id as string, inp.busqueda, supabase); r = (sr as any).message ?? (sr as any).error ?? ''; }
          else if (blk.name === 'leer_archivo') { const rr = await executeReadFile(target.id as string, inp.file_id, inp.file_name, inp.mime_type, supabase); r = (rr as any).content ?? (rr as any).error ?? ''; }
          else if (blk.name === 'buscar_en_web') { const wr = await searchWeb(inp.query, 5); r = wr.length ? wr.map(x => `${x.title}: ${x.description}`).join('\n') : 'Sin resultados.'; }
          res.push({ type: 'tool_result', tool_use_id: blk.id, content: r });
        }
        msgs.push({ role: 'user', content: res });
      }
    } catch { answer = 'El agente no está disponible.'; }
    return { ok: true, message: answer };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_producto
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_producto') {
    const notionToken  = (agent.notion_access_token as string | null) ?? null;
    const productsDbId = ((agent.features as Record<string, unknown>)?.notion_products_db_id as string | null) ?? null;
    if (!notionToken || !productsDbId)
      return { ok: false, error: 'Catálogo de productos no configurado. Actívalo en Integraciones → Notion.' };
    const { query } = toolInput as { query: string };
    if (!query?.trim()) return { ok: false, error: 'Proporciona un SKU o nombre del producto.' };
    try {
      const product = await searchProduct(notionToken, productsDbId, query.trim());
      if (!product) return { ok: false, error: `Producto "${query}" no encontrado en el catálogo.` };
      const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return { ok: true, ...product, precio_formateado: fmt(product.precio) };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // catalogo_buscar_codigo — pack cloud_catalog. Lookup en Excel/CSV que el
  // cliente mantiene en Dropbox, Google Drive u OneDrive. Feature gated +
  // config JSONB requeridos. Provider elegido en organizations.catalog_config.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'catalogo_buscar_codigo') {
    const { data: org } = await supabase
      .from('organizations')
      .select('catalog_config')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    const agentFeatures = (agent.features as Record<string, unknown> | undefined) ?? {};
    if (!agentFeatures.cloud_catalog) {
      return { ok: false, error: 'El pack Catálogo en la nube no está activo para esta cuenta.' };
    }
    const config = org?.catalog_config as {
      provider: 'dropbox' | 'google' | 'microsoft';
      doc_path: string; sku_column: string; desc_column: string; price_column?: string | null;
    } | null;
    if (!config?.provider || !config.doc_path || !config.sku_column || !config.desc_column) {
      return { ok: false, error: 'Catálogo no configurado. Actívalo en Integraciones → Almacenamiento en la nube del portal.' };
    }
    const { query, exact } = toolInput as { query?: string; exact?: boolean };
    if (!query?.trim()) return { ok: false, error: 'Proporciona un término a buscar (SKU o descripción).' };
    const { searchCatalog } = await import('@/lib/catalog/lookup');
    const res = await searchCatalog(portalEmail, config, query.trim(), { exact: !!exact });
    if ('error' in res) return { ok: false, error: res.error };
    if (res.matches.length === 0) {
      return { ok: false, error: `Sin coincidencias para "${query}" en el catálogo.` };
    }
    return { ok: true, matches: res.matches, total: res.total };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Fiscal: solicitar_factura + consultar_factura
  // Emite CFDIs vía el PAC del negocio (SF, CONTPAQi, etc.). El flujo manual
  // (email al responsable de facturación) fue eliminado 2026-08-19 — si el
  // org no tiene PAC configurado, el empleado avisa al cliente.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'solicitar_factura') {
    const res = await solicitarFactura({
      cliente_nombre:    toolInput.cliente_nombre    as string,
      cliente_rfc:       toolInput.cliente_rfc       as string,
      cliente_email:     toolInput.cliente_email     as string,
      cliente_telefono:  toolInput.cliente_telefono  as string | undefined,
      cliente_direccion: toolInput.cliente_direccion as string | undefined,
      uso_cfdi:          toolInput.uso_cfdi          as string,
      forma_pago:        toolInput.forma_pago        as string,
      metodo_pago:       toolInput.metodo_pago       as string,
      condiciones_pago:  toolInput.condiciones_pago  as string | undefined,
      items:             (toolInput.items as SolicitarFacturaItem[] | undefined) ?? [],
      incluir_iva:       (toolInput.incluir_iva      as boolean | undefined) ?? true,
      notes:             toolInput.notes             as string | undefined,
    }, {
      agentId,
      portalEmail,
      businessName,
      supabase,
      channel:       ctx.channel,
      sourceCallId:  ctx.sourceCallId,
      sourceInboxId: ctx.sourceInboxId,
      sourceContext: ctx.userContext,
    });
    if (!res.ok && res.reason === 'no_pac') {
      return {
        ok: false,
        error: 'Este negocio no tiene PAC configurado. Avísale al cliente que le llamamos cuando esté listo, y notifica al responsable del negocio para conectar Solución Factible u otro proveedor desde Integraciones.',
      };
    }
    if (!res.ok) return { ok: false, error: res.error };
    const totalStr = res.total!.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const clienteEmail = toolInput.cliente_email as string;
    const message = res.outcome === 'stamped'
      ? `Emitida folio ${res.folio_corto} enviada a ${clienteEmail}.`
      : res.outcome === 'retrying'
      ? `Procesando emisión por ${totalStr}, llegará en minutos.`
      : `Registré la solicitud por ${totalStr} pero el PAC rechazó el timbrado. El responsable del negocio debe revisar en el portal.`;
    return {
      ok:      true,
      request_id: res.request_id,
      message,
    };
  }

  if (toolName === 'consultar_factura') {
    const res = await lookupFacturas({
      cliente_rfc:    toolInput.cliente_rfc    as string | undefined,
      cliente_nombre: toolInput.cliente_nombre as string | undefined,
      request_id:     toolInput.request_id     as string | undefined,
    }, agentId, supabase);
    if (!res.ok) return { ok: false, error: res.message };
    return { ok: true, count: res.results.length, results: res.results, message: res.message };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // solicitar_cancelacion_factura — registra solicitud de cancelación de CFDI
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'solicitar_cancelacion_factura') {
    const { solicitarCancelacion } = await import('@/lib/invoicing/solicitar-cancelacion');
    const res = await solicitarCancelacion({
      uuid_o_folio_corto: String(toolInput.uuid_o_folio_corto ?? ''),
      motivo:             String(toolInput.motivo ?? '') as '01'|'02'|'03'|'04',
      uuid_sustituto:     toolInput.uuid_sustituto as string | undefined,
      razon_cliente:      toolInput.razon_cliente  as string | undefined,
    }, {
      agentId,
      portalEmail,
      supabase,
      channel: ctx.channel ?? 'chat',
    });
    if (!res.ok) return { ok: false, error: res.message };
    return { ok: true, cancellation_id: res.cancellation_id, message: res.message };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QuickBooks tools
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_consultar_facturas') {
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const { cliente, solo_pendientes = true } = toolInput as { cliente?: string; solo_pendientes?: boolean };
      const safe = (cliente ?? '').replace(/'/g, '');
      const sql  = `SELECT Id, DocNumber, CustomerRef, Balance, DueDate, TotalAmt FROM Invoice WHERE 1=1${safe ? ` AND CustomerRef.name LIKE '%${safe}%'` : ''}${solo_pendientes ? " AND Balance > '0'" : ''} ORDER BY DueDate ASC MAXRESULTS 15`;
      const data = await qb.query(sql);
      const invs = data?.QueryResponse?.Invoice ?? [];
      const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
      if (!invs.length) return { ok: true, facturas: [], mensaje: `No hay facturas${solo_pendientes ? ' pendientes' : ''}${safe ? ` para "${safe}"` : ''}.` };
      const total = invs.reduce((s: number, i: any) => s + (i.Balance ?? 0), 0);
      return { ok: true, count: invs.length, total: fmt(total), facturas: invs.map((i: any) => ({ numero: i.DocNumber, cliente: i.CustomerRef?.name, pendiente: fmt(i.Balance), total: fmt(i.TotalAmt), vence: i.DueDate ? fmtD(i.DueDate) : null, vencida: i.DueDate && new Date(i.DueDate) < new Date() && i.Balance > 0 })) };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  if (toolName === 'qb_buscar_cliente') {
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const { nombre } = toolInput as { nombre: string };
      const safe = nombre.replace(/'/g, '');
      const [cRes, iRes] = await Promise.all([
        qb.query(`SELECT Id, DisplayName, PrimaryEmailAddr, PrimaryPhone, Balance FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 5`),
        qb.query(`SELECT Id, DocNumber, Balance, TotalAmt, DueDate FROM Invoice WHERE CustomerRef.name LIKE '%${safe}%' AND Balance > '0' ORDER BY DueDate ASC MAXRESULTS 5`),
      ]);
      const customers = cRes?.QueryResponse?.Customer ?? [];
      if (!customers.length) return { ok: false, error: `No encontré cliente "${nombre}".` };
      const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      const c = customers[0];
      return { ok: true, cliente: { id: c.Id, nombre: c.DisplayName, email: c.PrimaryEmailAddr?.Address, telefono: c.PrimaryPhone?.FreeFormNumber, saldo: fmt(c.Balance ?? 0) }, facturas_pendientes: (iRes?.QueryResponse?.Invoice ?? []).map((i: any) => ({ numero: i.DocNumber, pendiente: fmt(i.Balance), total: fmt(i.TotalAmt), vence: i.DueDate })) };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  if (toolName === 'qb_crear_factura') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para crear la factura.' };
    // Refund on any downstream failure: la op se cobró antes de saber si el
    // handler completaría (QB desconectado, cliente inexistente, throw del SDK).
    // Ver Scope B Agent 2 money-critical gaps.
    const refundQbFactura = (reason: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_crear_factura: ${reason}` });
    // Verifier adversarial: qb_crear_factura crea CFDI real en la contabilidad
    // del cliente (destructivo, money-critical). policies.ts declara
    // verifyStrategy='external' pero el executor no lo aplicaba. Ver
    // Scope B Agent 2 verifier-desconectado.
    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdictFactura = await verifyDestructiveAction({
      action:          'creación de factura en QuickBooks (destructivo)',
      target:          String(toolInput.cliente_nombre ?? ''),
      reason:          `Descripción: ${String(toolInput.descripcion ?? '')} — Monto: ${String(toolInput.monto ?? '')} MXN`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdictFactura.safe) {
      await refundQbFactura('verifier_blocked');
      return { ok: false, error: `Verificador bloqueó la factura: ${verdictFactura.concern ?? 'preocupación no especificada'}. Confirma el cliente/monto/descripción con el owner o pide aprobación.` };
    }
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundQbFactura('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }
    try {
      const { cliente_nombre, descripcion, monto, fecha_vencimiento } = toolInput as { cliente_nombre?: string; descripcion?: string; monto?: number; fecha_vencimiento?: string };
      if (!cliente_nombre?.trim()) { await refundQbFactura('missing_cliente_nombre'); return { ok: false, error: 'cliente_nombre es requerido para crear factura.' }; }
      if (!descripcion?.trim())    { await refundQbFactura('missing_descripcion'); return { ok: false, error: 'descripcion es requerida.' }; }
      if (typeof monto !== 'number' || monto <= 0) { await refundQbFactura('invalid_monto'); return { ok: false, error: 'monto (número > 0) es requerido.' }; }
      const safe     = cliente_nombre.replace(/'/g, '');
      const custData = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
      const customer = custData?.QueryResponse?.Customer?.[0];
      if (!customer) { await refundQbFactura('customer_not_found'); return { ok: false, error: `Cliente "${cliente_nombre}" no encontrado.` }; }
      const itemData = await qb.query(`SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 1`);
      const item     = itemData?.QueryResponse?.Item?.[0];
      const line     = item ? { DetailType: 'SalesItemLineDetail', Amount: monto, Description: descripcion, SalesItemLineDetail: { ItemRef: { value: item.Id, name: item.Name }, UnitPrice: monto, Qty: 1 } } : { DetailType: 'DescriptionOnlyLine', Amount: monto, Description: descripcion, DescriptionOnlyLineDetail: {} };
      const body: any = { Line: [line], CustomerRef: { value: customer.Id, name: customer.DisplayName } };
      if (fecha_vencimiento) body.DueDate = fecha_vencimiento;
      const res  = await qb.post('/invoice', body);
      const inv  = res?.Invoice;
      const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return { ok: true, factura_id: inv?.Id, numero: inv?.DocNumber, cliente: customer.DisplayName, monto: fmt(monto), descripcion };
    } catch (err) { await refundQbFactura('exception'); return { ok: false, error: String(err) }; }
  }

  if (toolName === 'qb_registrar_pago') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para registrar el pago.' };
    const refundQbPago = (reason: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_registrar_pago: ${reason}` });
    // Verifier adversarial: qb_registrar_pago crea Payment row en QB del owner
    // (destructivo, afecta libro de cuentas + reconciliation bancaria). Aplica
    // mismo patrón que qb_crear_factura post-F12. Ver Scope B verifier gap.
    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdictPago = await verifyDestructiveAction({
      action:          'registrar pago recibido en QuickBooks (destructivo)',
      target:          String(toolInput.cliente_nombre ?? ''),
      reason:          `Monto: ${String(toolInput.monto ?? '')} MXN — Factura ${toolInput.factura_numero ? `#${toolInput.factura_numero}` : '(auto-aplica a más antigua pendiente)'}`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdictPago.safe) {
      await refundQbPago('verifier_blocked');
      return { ok: false, error: `Verificador bloqueó el registro del pago: ${verdictPago.concern ?? 'preocupación no especificada'}. Confirma cliente/monto/factura con el owner o pide aprobación.` };
    }
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundQbPago('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }
    try {
      const { cliente_nombre, monto, factura_numero } = toolInput as { cliente_nombre?: string; monto?: number; factura_numero?: string };
      if (!cliente_nombre?.trim()) { await refundQbPago('missing_cliente_nombre'); return { ok: false, error: 'cliente_nombre es requerido para registrar pago.' }; }
      if (typeof monto !== 'number' || monto <= 0) { await refundQbPago('invalid_monto'); return { ok: false, error: 'monto (número > 0) es requerido.' }; }
      const safe     = cliente_nombre.replace(/'/g, '');
      const custData = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
      const customer = custData?.QueryResponse?.Customer?.[0];
      if (!customer) { await refundQbPago('customer_not_found'); return { ok: false, error: `Cliente "${cliente_nombre}" no encontrado.` }; }
      const invFilter = factura_numero ? `AND DocNumber = '${factura_numero}'` : `AND Balance > '0' ORDER BY DueDate ASC`;
      const invData   = await qb.query(`SELECT Id, DocNumber, Balance FROM Invoice WHERE CustomerRef = '${customer.Id}' ${invFilter} MAXRESULTS 1`);
      const invoice   = invData?.QueryResponse?.Invoice?.[0];
      const pay: any  = { TotalAmt: monto, CustomerRef: { value: customer.Id, name: customer.DisplayName }, TxnDate: new Date().toISOString().split('T')[0] };
      if (invoice) pay.Line = [{ Amount: monto, LinkedTxn: [{ TxnId: invoice.Id, TxnType: 'Invoice' }] }];
      const res  = await qb.post('/payment', pay);
      const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      // A-F8 silent success: si el usuario NO especificó factura_numero, el
      // pago se auto-aplica a la más antigua pendiente. Antes: response no
      // avisaba cuál se aplicó → confusión ("¿a cuál factura fue?"). Ahora
      // mensaje explícito distingue "auto-aplicó a #X" vs "aplicó a #Y (pedida)".
      const message = invoice
        ? factura_numero
          ? `Pago de ${fmt(monto)} de ${customer.DisplayName} aplicado a factura #${invoice.DocNumber}.`
          : `Pago de ${fmt(monto)} de ${customer.DisplayName} AUTO-APLICADO a factura #${invoice.DocNumber} (la más antigua pendiente porque no se especificó número). Confirma con el cliente si era la correcta.`
        : `Pago de ${fmt(monto)} de ${customer.DisplayName} registrado SIN aplicar a factura (${customer.DisplayName} no tiene facturas pendientes). Queda como crédito.`;
      return { ok: true, pago_id: res?.Payment?.Id, cliente: customer.DisplayName, monto: fmt(monto), factura: invoice?.DocNumber ?? null, auto_applied: !factura_numero && !!invoice, message };
    } catch (err) { await refundQbPago('exception'); return { ok: false, error: String(err) }; }
  }

  if (toolName === 'qb_reporte_ingresos') {
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const PMAP: Record<string, string> = { este_mes: 'THIS_MONTH', mes_pasado: 'LAST_MONTH', este_año: 'THIS_YEAR', año_pasado: 'LAST_YEAR', este_trimestre: 'THIS_FISCAL_QUARTER', trimestre_pasado: 'LAST_FISCAL_QUARTER' };
      const dm   = PMAP[(toolInput.periodo as string | undefined) ?? 'este_mes'] ?? 'THIS_MONTH';
      const [pl, ar] = await Promise.all([qb.get(`/reports/ProfitAndLoss?date_macro=${dm}`), qb.get(`/reports/AgedReceivableDetail?date_macro=${dm}`)]);
      const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      const rep: Record<string, string> = {};
      for (const row of (pl?.Rows?.Row ?? [])) { const lbl = row?.Header?.ColData?.[0]?.value ?? row?.Summary?.ColData?.[0]?.value ?? ''; const val = parseFloat(row?.Summary?.ColData?.[1]?.value ?? ''); if (!lbl || isNaN(val)) continue; if (/ingreso|income|revenue/i.test(lbl)) rep.ingresos = fmt(val); if (/gasto|expense/i.test(lbl)) rep.gastos = fmt(val); if (/net|utilidad/i.test(lbl)) rep.utilidad = fmt(val); }
      const arT = (ar?.Rows?.Row ?? []).reduce((s: number, r: any) => { const v = parseFloat(r?.ColData?.[r.ColData?.length - 1]?.value ?? '0'); return s + (isNaN(v) ? 0 : v); }, 0);
      if (arT > 0) rep.cuentas_por_cobrar = fmt(arT);
      return { ok: true, periodo: dm, reporte: rep };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // PACK ciclo_oc_cfdi — Orden de Compra + Firma + CFDI ciclo completo
  // Aplicable a constructoras / comercializadoras / PYMEs industriales con
  // QuickBooks + PAC conectados. Piloto: AC Proyectos.
  // Ver [[handoff-ac-proyectos-ciclo-oc-cfdi]].
  // ═════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // qb_crear_orden_compra — Crea OC en QB + persiste expediente
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_crear_orden_compra') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para crear la orden de compra.' };
    const refundOc = (reason: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_crear_orden_compra: ${reason}` });

    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const args = toolInput as {
      proveedor_nombre?:  string;
      proveedor_rfc?:     string;
      proveedor_email?:   string;
      conceptos?:         Array<{ descripcion: string; cantidad: number; precio_unitario: number }>;
      folio_interno?:     string;
      descripcion?:       string;
    };
    const conceptos = Array.isArray(args.conceptos) ? args.conceptos : [];
    const total     = conceptos.reduce((s, c) => s + (c.cantidad ?? 0) * (c.precio_unitario ?? 0), 0);

    const verdict = await verifyDestructiveAction({
      action:          'crear orden de compra en QuickBooks (destructivo, afecta cuentas por pagar)',
      target:          String(args.proveedor_nombre ?? ''),
      reason:          `Conceptos: ${conceptos.length} — Total: ${total} MXN`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) {
      await refundOc('verifier_blocked');
      return { ok: false, error: `Verificador bloqueó la OC: ${verdict.concern ?? 'preocupación no especificada'}.` };
    }

    if (!args.proveedor_nombre?.trim()) { await refundOc('missing_proveedor_nombre'); return { ok: false, error: 'proveedor_nombre es requerido.' }; }
    if (conceptos.length === 0)         { await refundOc('missing_conceptos');        return { ok: false, error: 'conceptos (array con descripcion+cantidad+precio_unitario) es requerido.' }; }
    if (total <= 0)                     { await refundOc('invalid_total');            return { ok: false, error: 'El total de la OC debe ser mayor a 0.' }; }

    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundOc('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }

    try {
      // Buscar vendor por nombre (o crearlo si no existe)
      const safeName  = args.proveedor_nombre.replace(/'/g, '');
      const vendData  = await qb.query(`SELECT Id, DisplayName FROM Vendor WHERE DisplayName LIKE '%${safeName}%' MAXRESULTS 1`);
      let vendor      = vendData?.QueryResponse?.Vendor?.[0];
      if (!vendor) {
        const vendorPayload: any = { DisplayName: args.proveedor_nombre };
        if (args.proveedor_email) vendorPayload.PrimaryEmailAddr = { Address: args.proveedor_email };
        const created = await qb.post('/vendor', vendorPayload);
        vendor = created?.Vendor;
        if (!vendor) { await refundOc('vendor_create_failed'); return { ok: false, error: 'No se pudo crear el proveedor en QB.' }; }
      }

      // QB requiere ItemRef o AccountRef en cada línea. Preferimos Item de tipo
      // Inventory (soporta ItemBasedExpenseLineDetail con Qty+UnitPrice). Si no
      // hay, usamos AccountBasedExpenseLineDetail contra primera cuenta Expense
      // (más compat pero pierde granularidad qty/precio en QB).
      const invItemData = await qb.query(`SELECT Id, Name FROM Item WHERE Type = 'Inventory' MAXRESULTS 1`);
      const inventoryItem = invItemData?.QueryResponse?.Item?.[0];
      let accountRef: { Id: string; Name: string } | null = null;
      if (!inventoryItem) {
        const acctData = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1`);
        accountRef = acctData?.QueryResponse?.Account?.[0] ?? null;
        if (!accountRef) { await refundOc('no_item_no_account'); return { ok: false, error: 'QB no tiene Items Inventory ni cuentas de Expense para la OC.' }; }
      }

      const lines = conceptos.map(c => inventoryItem
        ? {
            DetailType: 'ItemBasedExpenseLineDetail',
            Amount:     c.cantidad * c.precio_unitario,
            Description: c.descripcion,
            ItemBasedExpenseLineDetail: {
              ItemRef:   { value: inventoryItem.Id, name: inventoryItem.Name },
              Qty:       c.cantidad,
              UnitPrice: c.precio_unitario,
            },
          }
        : {
            DetailType: 'AccountBasedExpenseLineDetail',
            Amount:     c.cantidad * c.precio_unitario,
            Description: c.descripcion,
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: accountRef!.Id, name: accountRef!.Name },
            },
          });

      // QB requiere APAccountRef (Accounts Payable). Buscar cuenta tipo AP.
      const apData = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Accounts Payable' MAXRESULTS 1`);
      const apAccount = apData?.QueryResponse?.Account?.[0];
      if (!apAccount) { await refundOc('no_ap_account'); return { ok: false, error: 'QB no tiene cuenta Accounts Payable. Crea una en QB antes de crear OCs.' }; }

      const poBody: any = {
        VendorRef:   { value: vendor.Id, name: vendor.DisplayName },
        APAccountRef:{ value: apAccount.Id, name: apAccount.Name },
        Line:        lines,
      };
      const res  = await qb.post('/purchaseorder', poBody);
      const po   = res?.PurchaseOrder;
      if (!po?.Id) { await refundOc('qb_po_create_failed'); return { ok: false, error: 'QB no devolvió PurchaseOrder.' }; }

      const { data: exp, error: expErr } = await supabase.from('expedientes_compras').insert({
        portal_email:      portalEmail,
        agent_id:          agentId,
        folio_interno:     args.folio_interno ?? null,
        descripcion:       args.descripcion ?? null,
        qb_po_id:          String(po.Id),
        qb_po_folio:       po.DocNumber ?? null,
        proveedor_nombre:  vendor.DisplayName,
        proveedor_rfc:     args.proveedor_rfc ?? null,
        proveedor_email:   args.proveedor_email ?? null,
        oc_monto_mxn:      total,
        oc_conceptos:      conceptos,
        status:            'oc_creada',
      }).select('id').single();

      if (expErr) { await refundOc('expediente_insert_failed'); return { ok: false, error: `OC creada en QB (${po.Id}) pero no se pudo persistir el expediente: ${expErr.message}` }; }

      await supabase.from('expediente_eventos').insert({
        expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
        actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'unknown'}`,
        tipo: 'oc_creada', from_status: null, to_status: 'oc_creada',
        detalle: { qb_po_id: po.Id, qb_po_folio: po.DocNumber, total },
      });

      const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return {
        ok:               true,
        expediente_id:    exp.id,
        qb_po_id:         po.Id,
        qb_po_folio:      po.DocNumber,
        proveedor:        vendor.DisplayName,
        total:            fmt(total),
        message:          `OC #${po.DocNumber ?? po.Id} creada en QuickBooks para ${vendor.DisplayName} por ${fmt(total)}. Expediente ${exp.id} abierto.`,
      };
    } catch (err) { await refundOc('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // qb_consultar_orden_compra — Lee OC de QB (read-only, 0 ops)
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_consultar_orden_compra') {
    const args = toolInput as { qb_po_id?: string; expediente_id?: string };
    if (!args.qb_po_id && !args.expediente_id) return { ok: false, error: 'Necesito qb_po_id o expediente_id.' };

    let qbPoId = args.qb_po_id ?? null;
    let expedienteRow: any = null;
    if (args.expediente_id) {
      const { data } = await supabase.from('expedientes_compras')
        .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
      if (!data) return { ok: false, error: 'Expediente no encontrado.' };
      expedienteRow = data;
      qbPoId = qbPoId ?? data.qb_po_id;
    }
    if (!qbPoId) return { ok: false, error: 'El expediente no tiene qb_po_id asociado.' };

    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };

    try {
      const res = await qb.get(`/purchaseorder/${qbPoId}`);
      const po  = res?.PurchaseOrder;
      if (!po) return { ok: false, error: 'OC no encontrada en QB.' };
      return {
        ok:            true,
        qb_po_id:      po.Id,
        folio:         po.DocNumber,
        proveedor:     po.VendorRef?.name,
        total:         po.TotalAmt,
        estado_qb:     po.POStatus,
        expediente:    expedienteRow ? {
          id:                expedienteRow.id,
          status:            expedienteRow.status,
          oc_firmada_at:     expedienteRow.oc_firmada_at,
          oc_pagada_at:      expedienteRow.oc_pagada_at,
          sf_uuid:           expedienteRow.sf_uuid,
        } : null,
      };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // qb_descargar_oc_pdf — Baja PDF de QB, lo sube a Storage, guarda path
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_descargar_oc_pdf') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para descargar el PDF.' };
    const refundDesc = (reason: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_descargar_oc_pdf: ${reason}` });

    const args = toolInput as { expediente_id?: string };
    if (!args.expediente_id) { await refundDesc('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('id, qb_po_id, oc_pdf_path, status')
      .eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundDesc('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (!exp.qb_po_id) { await refundDesc('no_qb_po'); return { ok: false, error: 'El expediente no tiene qb_po_id.' }; }

    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundDesc('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }

    try {
      // QB v3 devuelve PDF binario en /purchaseorder/{id}/pdf con Accept application/pdf.
      // Ojo: qb.apiBase YA incluye /company/{realmId}, no repetirlo.
      const url = `${qb.apiBase}/purchaseorder/${exp.qb_po_id}/pdf?minorversion=65`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${qb.accessToken}`, Accept: 'application/pdf' },
      });
      if (!res.ok) { await refundDesc('qb_pdf_fetch_failed'); return { ok: false, error: `QB devolvió ${res.status} al pedir PDF (URL: ${url}).` }; }
      const arrayBuf = await res.arrayBuffer();
      const pdfBuf   = Buffer.from(arrayBuf);

      const path = `${portalEmail}/oc/${exp.id}.pdf`;
      const up = await supabase.storage.from('cfdi').upload(path, pdfBuf, {
        contentType: 'application/pdf', upsert: true,
      });
      if (up.error) { await refundDesc('storage_upload_failed'); return { ok: false, error: `No se pudo guardar el PDF: ${up.error.message}` }; }

      await supabase.from('expedientes_compras')
        .update({ oc_pdf_path: path })
        .eq('id', exp.id);

      return { ok: true, expediente_id: exp.id, pdf_path: path, size_kb: Math.round(pdfBuf.length / 1024) };
    } catch (err) { await refundDesc('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // firmar_oc — Evalúa reglas de autofirma; si pasan, aplica firma al PDF
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'firmar_oc') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para firmar la OC.' };
    const refundFirmar = (reason: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund firmar_oc: ${reason}` });

    const args = toolInput as { expediente_id?: string };
    if (!args.expediente_id) { await refundFirmar('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundFirmar('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (!exp.oc_pdf_path) { await refundFirmar('no_pdf'); return { ok: false, error: 'Descarga primero el PDF con qb_descargar_oc_pdf.' }; }
    if (exp.oc_firmada_at) { await refundFirmar('already_signed'); return { ok: false, error: 'La OC ya fue firmada.' }; }

    const { evaluateFirmaRules } = await import('@/lib/ciclo-oc/firma-rules');
    const evalRes = await evaluateFirmaRules({
      portalEmail,
      oc_monto_mxn:     Number(exp.oc_monto_mxn ?? 0),
      proveedor_rfc:    exp.proveedor_rfc,
      proveedor_nombre: exp.proveedor_nombre,
      conceptos:        Array.isArray(exp.oc_conceptos) ? exp.oc_conceptos : [],
    }, supabase);

    if (!evalRes.passed) {
      // Escala a humano — marca expediente y crea evento
      await supabase.from('expedientes_compras').update({
        status:                  'requiere_atencion',
        requiere_atencion_razon: evalRes.reason,
        requiere_atencion_at:    new Date().toISOString(),
      }).eq('id', exp.id);

      await supabase.from('expediente_eventos').insert({
        expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
        actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'unknown'}`,
        tipo: 'requiere_atencion', from_status: exp.status, to_status: 'requiere_atencion',
        detalle: { reglas_falladas: evalRes.reglas_falladas, reglas_pasadas: evalRes.reglas_pasadas, monto_tope: evalRes.monto_tope_mxn },
      });

      return {
        ok:                       false,
        requiere_atencion:        true,
        razon:                    evalRes.reason,
        reglas_falladas:          evalRes.reglas_falladas,
        message:                  `No pude firmar automáticamente. Escalo al humano autorizado: ${evalRes.reason}`,
      };
    }

    // Reglas OK — bajar PDF, firma image, aplicar, guardar
    try {
      const { data: org } = await supabase
        .from('organizations').select('ciclo_oc_firma_path').eq('portal_email', portalEmail).single();
      if (!org?.ciclo_oc_firma_path) { await refundFirmar('no_firma_configured'); return { ok: false, error: 'No hay firma digitalizada configurada.' }; }

      const [pdfDl, firmaDl] = await Promise.all([
        supabase.storage.from('cfdi').download(exp.oc_pdf_path),
        supabase.storage.from('cfdi').download(org.ciclo_oc_firma_path),
      ]);
      if (pdfDl.error || !pdfDl.data)     { await refundFirmar('pdf_download_failed');   return { ok: false, error: `No se pudo bajar el PDF: ${pdfDl.error?.message}` }; }
      if (firmaDl.error || !firmaDl.data) { await refundFirmar('firma_download_failed'); return { ok: false, error: `No se pudo bajar la firma: ${firmaDl.error?.message}` }; }

      const pdfBuf   = Buffer.from(await pdfDl.data.arrayBuffer());
      const firmaBuf = Buffer.from(await firmaDl.data.arrayBuffer());

      const { applyFirmaToPdf } = await import('@/lib/ciclo-oc/apply-firma-pdf');
      const signedBuf = await applyFirmaToPdf(pdfBuf, firmaBuf);

      const signedPath = `${portalEmail}/oc/${exp.id}_firmada.pdf`;
      const up = await supabase.storage.from('cfdi').upload(signedPath, signedBuf, {
        contentType: 'application/pdf', upsert: true,
      });
      if (up.error) { await refundFirmar('storage_upload_failed'); return { ok: false, error: `No se pudo guardar el PDF firmado: ${up.error.message}` }; }

      const nowIso = new Date().toISOString();
      const meerkatName = (agent.agent_name as string | null) ?? 'meerkat';
      await supabase.from('expedientes_compras').update({
        status:                  'oc_firmada',
        oc_pdf_firmado_path:     signedPath,
        oc_firmada_por:          `meerkat_auto:${meerkatName}`,
        oc_firmada_at:           nowIso,
        oc_firma_es_auto:        true,
        oc_firma_reglas_pasadas: { pasadas: evalRes.reglas_pasadas, tope_mxn: evalRes.monto_tope_mxn },
      }).eq('id', exp.id);

      await supabase.from('expediente_eventos').insert({
        expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
        actor: `meerkat:${meerkatName.toLowerCase()}`,
        tipo: 'oc_firmada_auto', from_status: exp.status, to_status: 'oc_firmada',
        detalle: { reglas: evalRes.reglas_pasadas, tope_mxn: evalRes.monto_tope_mxn, pdf_firmado_path: signedPath },
      });

      return {
        ok:                     true,
        expediente_id:          exp.id,
        pdf_firmado_path:       signedPath,
        firmada_auto:           true,
        reglas_pasadas:         evalRes.reglas_pasadas,
        message:                `OC firmada automáticamente (${evalRes.reglas_pasadas.length} reglas OK, tope ${evalRes.monto_tope_mxn} MXN).`,
      };
    } catch (err) { await refundFirmar('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // sf_timbrar_desde_oc — Timbra CFDI copiando conceptos de la OC
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'sf_timbrar_desde_oc') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para timbrar el CFDI.' };
    const refundTim = (reason: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund sf_timbrar_desde_oc: ${reason}` });

    const args = toolInput as {
      expediente_id?:  string;
      cliente_nombre?: string;
      cliente_rfc?:    string;
      cliente_email?:  string;
      uso_cfdi?:       string;
      forma_pago?:     string;
      metodo_pago?:    string;
    };
    if (!args.expediente_id) { await refundTim('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    for (const [k, v] of Object.entries({
      cliente_nombre: args.cliente_nombre, cliente_rfc: args.cliente_rfc, cliente_email: args.cliente_email,
      uso_cfdi: args.uso_cfdi, forma_pago: args.forma_pago, metodo_pago: args.metodo_pago,
    })) {
      if (!v?.toString().trim()) { await refundTim(`missing_${k}`); return { ok: false, error: `${k} es requerido para timbrar.` }; }
    }

    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdict = await verifyDestructiveAction({
      action:          'timbrar CFDI ante el SAT (destructivo, fiscal)',
      target:          String(args.cliente_nombre),
      reason:          `RFC ${args.cliente_rfc} — Uso ${args.uso_cfdi} — desde expediente ${args.expediente_id}`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) { await refundTim('verifier_blocked'); return { ok: false, error: `Verificador bloqueó el timbrado: ${verdict.concern ?? 'preocupación no especificada'}.` }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundTim('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (exp.sf_uuid) { await refundTim('already_stamped'); return { ok: false, error: `Ya existe CFDI para este expediente (UUID ${exp.sf_uuid}).` }; }

    const conceptos = Array.isArray(exp.oc_conceptos) ? exp.oc_conceptos : [];
    if (conceptos.length === 0) { await refundTim('no_conceptos'); return { ok: false, error: 'El expediente no tiene conceptos para timbrar.' }; }

    const items = conceptos.map((c: any) => ({
      descripcion:      c.descripcion,
      cantidad:         c.cantidad,
      precio_unitario:  c.precio_unitario,
    }));
    const subtotal = Number(exp.oc_monto_mxn ?? conceptos.reduce((s: number, c: any) => s + (c.cantidad ?? 0) * (c.precio_unitario ?? 0), 0));

    try {
      const { data: req, error: reqErr } = await supabase.from('factura_requests').insert({
        agent_id:         agentId,
        portal_email:     portalEmail,
        cliente_nombre:   args.cliente_nombre,
        cliente_rfc:      args.cliente_rfc,
        cliente_email:    args.cliente_email,
        uso_cfdi:         args.uso_cfdi,
        forma_pago:       args.forma_pago,
        metodo_pago:      args.metodo_pago,
        items,
        subtotal,
        iva:              0,
        total:            subtotal,
        currency:         'MXN',
        source_channel:   ctx.channel ?? 'chat',
        source_context:   `expediente:${exp.id}`,
        status:           'pending',
      }).select('id').single();

      if (reqErr || !req) { await refundTim('factura_request_insert_failed'); return { ok: false, error: `No se pudo crear factura_request: ${reqErr?.message}` }; }

      const { emitirFacturaAuto } = await import('@/lib/invoicing/emitir-factura');
      const outcome = await emitirFacturaAuto(req.id, supabase);

      if (outcome.outcome !== 'stamped') {
        await refundTim(`stamp_${outcome.outcome}`);
        return { ok: false, error: `Timbrado no completado: ${outcome.outcome}${outcome.error ? ` — ${outcome.error}` : ''}`, factura_request_id: req.id };
      }

      const meerkatName = (agent.agent_name as string | null) ?? 'meerkat';
      await supabase.from('expedientes_compras').update({
        status:              'factura_timbrada',
        sf_uuid:             outcome.uuid,
        cliente_nombre:      args.cliente_nombre,
        cliente_rfc:         args.cliente_rfc,
        cliente_email:       args.cliente_email,
        cfdi_monto_mxn:      subtotal,
        cfdi_uso:            args.uso_cfdi,
        cfdi_forma_pago:     args.forma_pago,
        cfdi_metodo_pago:    args.metodo_pago,
        cfdi_xml_path:       outcome.xmlPath ?? null,
        cfdi_pdf_path:       outcome.pdfPath ?? null,
        cfdi_timbrada_at:    new Date().toISOString(),
        factura_request_id:  req.id,
      }).eq('id', exp.id);

      await supabase.from('expediente_eventos').insert({
        expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
        actor: `meerkat:${meerkatName.toLowerCase()}`,
        tipo: 'factura_timbrada', from_status: exp.status, to_status: 'factura_timbrada',
        detalle: { uuid: outcome.uuid, factura_request_id: req.id, subtotal },
      });

      return {
        ok:                  true,
        expediente_id:       exp.id,
        uuid:                outcome.uuid,
        factura_request_id:  req.id,
        pdf_path:            outcome.pdfPath,
        xml_path:            outcome.xmlPath,
        message:             `CFDI timbrado ${outcome.uuid} para ${args.cliente_nombre} por ${subtotal} MXN.`,
      };
    } catch (err) { await refundTim('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // sf_cancelar_cfdi — Nala solicita cancelación de CFDI ante el SAT
  // Requiere invoicing_allow_agent_cancellation=true en org (safeguard).
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'sf_cancelar_cfdi') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para cancelar el CFDI.' };
    const refundCancel = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund sf_cancelar_cfdi: ${r}` });

    const args = toolInput as {
      expediente_id?:  string;
      uuid?:           string;
      motivo?:         '01' | '02' | '03' | '04';
      uuid_sustituto?: string;
      razon_cliente?:  string;
    };

    if (!args.motivo || !['01', '02', '03', '04'].includes(args.motivo)) {
      await refundCancel('invalid_motivo');
      return { ok: false, error: 'motivo es requerido (01=sustitución, 02=error sin relación, 03=no se llevó a cabo la operación, 04=nominativa relacionada).' };
    }
    if (args.motivo === '01' && !args.uuid_sustituto?.trim()) {
      await refundCancel('missing_sustituto');
      return { ok: false, error: 'Motivo 01 (sustitución) requiere uuid_sustituto.' };
    }

    let uuid: string | null = args.uuid ?? null;
    let expedienteId: string | null = null;
    let factRequestId: string | null = null;
    if (args.expediente_id) {
      const { data: exp } = await supabase.from('expedientes_compras')
        .select('id, sf_uuid, status, factura_request_id')
        .eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
      if (!exp) { await refundCancel('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
      if (!exp.sf_uuid) { await refundCancel('no_cfdi'); return { ok: false, error: 'El expediente no tiene CFDI timbrado.' }; }
      uuid = uuid ?? exp.sf_uuid;
      expedienteId = exp.id;
      factRequestId = exp.factura_request_id ?? null;
    }
    if (!uuid) { await refundCancel('missing_uuid'); return { ok: false, error: 'Necesito uuid o expediente_id.' }; }

    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdict = await verifyDestructiveAction({
      action:          'cancelar CFDI ante el SAT (destructivo, fiscal, IRREVERSIBLE si el SAT acepta)',
      target:          uuid,
      reason:          `Motivo ${args.motivo}${args.razon_cliente ? ` — ${args.razon_cliente}` : ''}${args.uuid_sustituto ? ` — sustituye por ${args.uuid_sustituto}` : ''}`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) { await refundCancel('verifier_blocked'); return { ok: false, error: `Verificador bloqueó la cancelación: ${verdict.concern ?? 'sin razón'}.` }; }

    // Cargar org + credenciales + CSD
    const { data: org } = await supabase.from('organizations')
      .select('invoicing_provider, invoicing_credentials_encrypted, invoicing_test_mode, invoicing_allow_agent_cancellation')
      .eq('portal_email', portalEmail).single();
    if (org?.invoicing_provider !== 'solucion_factible') { await refundCancel('no_sf'); return { ok: false, error: 'Solución Factible no está conectado en esta organización.' }; }
    if (!org.invoicing_allow_agent_cancellation) {
      await refundCancel('not_allowed');
      return { ok: false, error: 'El dueño no autorizó cancelaciones por empleado. Actívalo en el portal → Facturación CFDI → Configuración → "Permitir cancelación por empleado".' };
    }
    if (!org.invoicing_credentials_encrypted) { await refundCancel('no_creds'); return { ok: false, error: 'Credenciales SF no configuradas.' }; }

    const { decryptString } = await import('@/lib/invoicing/csd-vault');
    const { getCsd } = await import('@/lib/invoicing/csd-vault');
    const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted)) as { usuario: string; password: string };
    const csd   = await getCsd(portalEmail, supabase);
    if (!csd) { await refundCancel('no_csd'); return { ok: false, error: 'CSD no cargado o expirado.' }; }

    try {
      const { solucionFactibleProvider } = await import('@/lib/invoicing/solucion-factible');
      const submit = await solucionFactibleProvider.cancelar(
        uuid, args.motivo, args.uuid_sustituto ?? null,
        creds, { cerPem: csd.cerPem, keyPem: csd.keyPem, noCertificado: csd.noCertificado },
        { testMode: org.invoicing_test_mode !== false },
      );

      // Registrar en cfdi_cancellations (audit fiscal)
      await supabase.from('cfdi_cancellations').insert({
        factura_request_id:    factRequestId,
        organization_email:    portalEmail,
        uuid_cancelado:        uuid,
        motivo:                args.motivo,
        uuid_sustituto:        args.uuid_sustituto ?? null,
        requested_by:          `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nala'}`,
        requested_by_agent_id: agentId,
        requested_via:         ctx.channel ?? 'chat',
        status:                submit.status === 'sent_to_sat' ? 'sent_to_sat' : 'rejected',
        razon_cliente:         args.razon_cliente ?? null,
        notes:                 submit.message ?? null,
      });

      if (expedienteId) {
        await supabase.from('expedientes_compras').update({
          status:          'cancelado',
          cancelado_at:    new Date().toISOString(),
          cancelado_razon: args.razon_cliente ?? submit.message ?? `Cancelación motivo ${args.motivo}`,
        }).eq('id', expedienteId);

        await supabase.from('expediente_eventos').insert({
          expediente_id: expedienteId, portal_email: portalEmail, agent_id: agentId,
          actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nala'}`,
          tipo: 'cancelado', from_status: 'factura_timbrada', to_status: 'cancelado',
          detalle: { uuid, motivo: args.motivo, uuid_sustituto: args.uuid_sustituto, sf_status: submit.status },
        });
      }

      if (submit.status === 'rejected') {
        return { ok: false, error: `SF rechazó la cancelación: ${submit.message}`, sf_status: 'rejected' };
      }

      return {
        ok:            true,
        uuid,
        sf_status:     submit.status,
        expediente_id: expedienteId,
        message:       `Solicitud de cancelación enviada al SAT (status: ${submit.status}). ${submit.message ?? ''}`,
      };
    } catch (err) { await refundCancel('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // sf_consultar_estado_sat — Nala consulta estado real de cancelación ante SAT
  // Read-only. Sin ops.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'sf_consultar_estado_sat') {
    const args = toolInput as { expediente_id?: string; uuid?: string };
    let uuid: string | null = args.uuid ?? null;
    let expedienteId: string | null = null;
    if (args.expediente_id) {
      const { data: exp } = await supabase.from('expedientes_compras')
        .select('id, sf_uuid').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
      if (!exp?.sf_uuid) return { ok: false, error: 'Expediente sin CFDI timbrado.' };
      uuid = uuid ?? exp.sf_uuid;
      expedienteId = exp.id;
    }
    if (!uuid) return { ok: false, error: 'Necesito uuid o expediente_id.' };

    const { data: org } = await supabase.from('organizations')
      .select('invoicing_provider, invoicing_credentials_encrypted, invoicing_test_mode')
      .eq('portal_email', portalEmail).single();
    if (org?.invoicing_provider !== 'solucion_factible') return { ok: false, error: 'Solución Factible no está conectado.' };
    if (!org.invoicing_credentials_encrypted) return { ok: false, error: 'Credenciales SF no configuradas.' };

    const { decryptString } = await import('@/lib/invoicing/csd-vault');
    const creds = JSON.parse(decryptString(org.invoicing_credentials_encrypted)) as { usuario: string; password: string };

    try {
      const { solucionFactibleProvider } = await import('@/lib/invoicing/solucion-factible');
      const status = await solucionFactibleProvider.consultarEstatusCancelacion(
        uuid, creds, { testMode: org.invoicing_test_mode !== false },
      );
      return {
        ok:            true,
        uuid,
        expediente_id: expedienteId,
        sat_status:    status.status,
        message:       status.message,
      };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // qb_crear_cotizacion — Nox: crea Estimate en QuickBooks para cliente
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_crear_cotizacion') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para crear la cotización.' };
    const refundCot = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_crear_cotizacion: ${r}` });

    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const args = toolInput as {
      cliente_nombre?: string;
      conceptos?:      Array<{ descripcion: string; cantidad: number; precio_unitario: number }>;
      vigencia_dias?:  number;
      notas?:          string;
    };
    const conceptos = Array.isArray(args.conceptos) ? args.conceptos : [];
    const total = conceptos.reduce((s, c) => s + (c.cantidad ?? 0) * (c.precio_unitario ?? 0), 0);

    const verdict = await verifyDestructiveAction({
      action:          'crear cotización (Estimate) en QuickBooks',
      target:          String(args.cliente_nombre ?? ''),
      reason:          `Conceptos: ${conceptos.length} — Total: ${total} MXN`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) { await refundCot('verifier_blocked'); return { ok: false, error: `Verificador bloqueó la cotización: ${verdict.concern ?? 'sin razón'}.` }; }

    if (!args.cliente_nombre?.trim()) { await refundCot('missing_cliente'); return { ok: false, error: 'cliente_nombre es requerido.' }; }
    if (conceptos.length === 0)       { await refundCot('missing_conceptos'); return { ok: false, error: 'conceptos es requerido.' }; }
    if (total <= 0)                   { await refundCot('invalid_total'); return { ok: false, error: 'El total debe ser mayor a 0.' }; }

    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundCot('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }

    try {
      const safe = args.cliente_nombre.replace(/'/g, '');
      const cust = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
      const customer = cust?.QueryResponse?.Customer?.[0];
      if (!customer) { await refundCot('customer_not_found'); return { ok: false, error: `Cliente "${args.cliente_nombre}" no encontrado en QB.` }; }

      const itemData = await qb.query(`SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 1`);
      const fallbackItem = itemData?.QueryResponse?.Item?.[0];

      const lines = conceptos.map(c => {
        const amount = c.cantidad * c.precio_unitario;
        return fallbackItem
          ? { DetailType: 'SalesItemLineDetail', Amount: amount, Description: c.descripcion,
              SalesItemLineDetail: { ItemRef: { value: fallbackItem.Id, name: fallbackItem.Name }, UnitPrice: c.precio_unitario, Qty: c.cantidad } }
          : { DetailType: 'DescriptionOnlyLine', Amount: amount, Description: c.descripcion, DescriptionOnlyLineDetail: {} };
      });

      const body: any = {
        Line:        lines,
        CustomerRef: { value: customer.Id, name: customer.DisplayName },
      };
      if (typeof args.vigencia_dias === 'number' && args.vigencia_dias > 0) {
        const exp = new Date(); exp.setDate(exp.getDate() + args.vigencia_dias);
        body.ExpirationDate = exp.toISOString().split('T')[0];
      }
      if (args.notas) body.CustomerMemo = { value: args.notas };

      const res = await qb.post('/estimate', body);
      const est = res?.Estimate;
      if (!est?.Id) { await refundCot('qb_estimate_failed'); return { ok: false, error: 'QB no devolvió Estimate.' }; }

      const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return {
        ok:            true,
        estimate_id:   est.Id,
        folio:         est.DocNumber,
        cliente:       customer.DisplayName,
        total:         fmt(total),
        vigencia:      body.ExpirationDate ?? null,
        message:       `Cotización #${est.DocNumber ?? est.Id} creada para ${customer.DisplayName} por ${fmt(total)}.`,
      };
    } catch (err) { await refundCot('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // qb_registrar_gasto — Nox: crea Purchase en QB (compra directa)
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_registrar_gasto') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para registrar el gasto.' };
    const refundGasto = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_registrar_gasto: ${r}` });

    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const args = toolInput as {
      concepto?:        string;
      monto?:           number;
      proveedor_nombre?:string;
      cuenta_gasto?:    string;
      forma_pago?:      'efectivo' | 'transferencia' | 'tarjeta' | 'cheque';
      fecha?:           string;
    };

    const verdict = await verifyDestructiveAction({
      action:          'registrar gasto en QuickBooks (Purchase, destructivo)',
      target:          String(args.proveedor_nombre ?? args.concepto ?? ''),
      reason:          `Concepto: ${args.concepto ?? ''} — Monto: ${args.monto} MXN — Forma: ${args.forma_pago ?? 'no especificada'}`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) { await refundGasto('verifier_blocked'); return { ok: false, error: `Verificador bloqueó el gasto: ${verdict.concern ?? 'sin razón'}.` }; }

    if (!args.concepto?.trim())              { await refundGasto('missing_concepto'); return { ok: false, error: 'concepto es requerido.' }; }
    if (typeof args.monto !== 'number' || args.monto <= 0) { await refundGasto('invalid_monto'); return { ok: false, error: 'monto (número > 0) es requerido.' }; }

    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundGasto('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }

    try {
      // Encontrar cuenta de gasto: usa la que el usuario indica o cae a "Expenses" genérica
      const accountName = (args.cuenta_gasto ?? 'Expenses').replace(/'/g, '');
      const acctData = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Expense' AND Name LIKE '%${accountName}%' MAXRESULTS 1`);
      let account = acctData?.QueryResponse?.Account?.[0];
      if (!account) {
        // Fallback: primera cuenta de gasto disponible
        const anyAcct = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1`);
        account = anyAcct?.QueryResponse?.Account?.[0];
      }
      if (!account) { await refundGasto('no_expense_account'); return { ok: false, error: 'No encontré cuentas de gasto en QuickBooks.' }; }

      // Cuenta pagadora (efectivo/banco). Por default: primera Bank o CreditCard.
      const payAccData = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType IN ('Bank','Credit Card') MAXRESULTS 1`);
      const payAccount = payAccData?.QueryResponse?.Account?.[0];
      if (!payAccount) { await refundGasto('no_payment_account'); return { ok: false, error: 'No encontré cuenta de banco o tarjeta.' }; }

      let vendorRef: any = null;
      if (args.proveedor_nombre?.trim()) {
        const vsafe = args.proveedor_nombre.replace(/'/g, '');
        const vend = await qb.query(`SELECT Id, DisplayName FROM Vendor WHERE DisplayName LIKE '%${vsafe}%' MAXRESULTS 1`);
        const v = vend?.QueryResponse?.Vendor?.[0];
        if (v) vendorRef = { value: v.Id, name: v.DisplayName };
      }

      const body: any = {
        AccountRef:  { value: payAccount.Id, name: payAccount.Name },
        PaymentType: payAccount.AccountType === 'Credit Card' ? 'CreditCard' : 'Cash',
        TxnDate:     args.fecha ?? new Date().toISOString().split('T')[0],
        Line: [{
          DetailType: 'AccountBasedExpenseLineDetail',
          Amount:     args.monto,
          Description: args.concepto,
          AccountBasedExpenseLineDetail: { AccountRef: { value: account.Id, name: account.Name } },
        }],
      };
      if (vendorRef) body.EntityRef = { ...vendorRef, type: 'Vendor' };

      const res = await qb.post('/purchase', body);
      const p = res?.Purchase;
      if (!p?.Id) { await refundGasto('qb_purchase_failed'); return { ok: false, error: 'QB no devolvió Purchase.' }; }

      const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return {
        ok:           true,
        gasto_id:     p.Id,
        concepto:     args.concepto,
        monto:        fmt(args.monto),
        cuenta:       account.Name,
        pagado_desde: payAccount.Name,
        proveedor:    vendorRef?.name ?? null,
        message:      `Gasto de ${fmt(args.monto)} registrado en ${account.Name} (pagado desde ${payAccount.Name}).`,
      };
    } catch (err) { await refundGasto('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // qb_registrar_caja_chica — Nox: gasto pequeño registrado contra caja chica
  // Variante convenience de qb_registrar_gasto — busca cuenta "Caja Chica" o
  // "Petty Cash" en QB. Si no existe, sugiere crearla y falla.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_registrar_caja_chica') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para registrar caja chica.' };
    const refundCC = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund qb_registrar_caja_chica: ${r}` });

    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const args = toolInput as {
      concepto?: string;
      monto?:    number;
      fecha?:    string;
      cuenta_gasto?: string;
    };

    const verdict = await verifyDestructiveAction({
      action:          'registrar gasto de caja chica en QuickBooks',
      target:          'Caja Chica',
      reason:          `Concepto: ${args.concepto ?? ''} — Monto: ${args.monto} MXN`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) { await refundCC('verifier_blocked'); return { ok: false, error: `Verificador bloqueó la caja chica: ${verdict.concern ?? 'sin razón'}.` }; }

    if (!args.concepto?.trim()) { await refundCC('missing_concepto'); return { ok: false, error: 'concepto es requerido.' }; }
    if (typeof args.monto !== 'number' || args.monto <= 0) { await refundCC('invalid_monto'); return { ok: false, error: 'monto (número > 0) es requerido.' }; }

    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) { await refundCC('qb_not_connected'); return { ok: false, error: 'QuickBooks no está conectado.' }; }

    try {
      // Buscar cuenta "Caja Chica" / "Petty Cash" en Bank accounts
      const ccData = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Bank' AND (Name LIKE '%Caja Chica%' OR Name LIKE '%Petty Cash%' OR Name LIKE '%Caja%') MAXRESULTS 1`);
      const cajaChica = ccData?.QueryResponse?.Account?.[0];
      if (!cajaChica) {
        await refundCC('no_caja_chica_account');
        return { ok: false, error: 'No encontré una cuenta llamada "Caja Chica" en QuickBooks. Créala como cuenta bancaria en QB y vuelve a intentar.' };
      }

      const gastoName = (args.cuenta_gasto ?? 'Expenses').replace(/'/g, '');
      const gastoData = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Expense' AND Name LIKE '%${gastoName}%' MAXRESULTS 1`);
      let gastoAcct = gastoData?.QueryResponse?.Account?.[0];
      if (!gastoAcct) {
        const anyGasto = await qb.query(`SELECT Id, Name FROM Account WHERE AccountType = 'Expense' MAXRESULTS 1`);
        gastoAcct = anyGasto?.QueryResponse?.Account?.[0];
      }
      if (!gastoAcct) { await refundCC('no_expense_account'); return { ok: false, error: 'No encontré cuentas de gasto.' }; }

      const body: any = {
        AccountRef:  { value: cajaChica.Id, name: cajaChica.Name },
        PaymentType: 'Cash',
        TxnDate:     args.fecha ?? new Date().toISOString().split('T')[0],
        Line: [{
          DetailType: 'AccountBasedExpenseLineDetail',
          Amount:     args.monto,
          Description: args.concepto,
          AccountBasedExpenseLineDetail: { AccountRef: { value: gastoAcct.Id, name: gastoAcct.Name } },
        }],
      };

      const res = await qb.post('/purchase', body);
      const p = res?.Purchase;
      if (!p?.Id) { await refundCC('qb_purchase_failed'); return { ok: false, error: 'QB no devolvió Purchase.' }; }

      const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return {
        ok:               true,
        gasto_id:         p.Id,
        concepto:         args.concepto,
        monto:            fmt(args.monto),
        pagado_desde:     cajaChica.Name,
        cuenta_gasto:     gastoAcct.Name,
        message:          `Caja chica: ${fmt(args.monto)} de "${args.concepto}" pagado desde ${cajaChica.Name}.`,
      };
    } catch (err) { await refundCC('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // qb_crear_orden_compra_desde_cotizacion — Vision AI parsea PDF/imagen y
  // crea OC en QB. Reutiliza qb_crear_orden_compra internamente.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'qb_crear_orden_compra_desde_cotizacion') {
    const args = toolInput as {
      cotizacion_base64?:        string;
      cotizacion_storage_path?:  string;
      mime_type?:                string;
      folio_interno?:            string;
      descripcion?:              string;
    };

    // No consume ops aquí — se consume 1 op cuando qb_crear_orden_compra corra.
    // Si el extractor falla antes, no cobramos por Vision solo.

    let buffer: Buffer;
    let mime = args.mime_type ?? 'application/pdf';

    if (args.cotizacion_storage_path) {
      const dl = await supabase.storage.from('cfdi').download(args.cotizacion_storage_path);
      if (dl.error || !dl.data) return { ok: false, error: `Storage download: ${dl.error?.message}` };
      buffer = Buffer.from(await dl.data.arrayBuffer());
      // Infer mime from extension if not provided
      if (!args.mime_type) {
        const ext = args.cotizacion_storage_path.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') mime = 'application/pdf';
        else if (ext === 'png') mime = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      }
    } else if (args.cotizacion_base64) {
      buffer = Buffer.from(args.cotizacion_base64, 'base64');
    } else {
      return { ok: false, error: 'Necesito cotizacion_base64 o cotizacion_storage_path.' };
    }

    if (buffer.length === 0) return { ok: false, error: 'El archivo está vacío.' };
    if (buffer.length > 15 * 1024 * 1024) return { ok: false, error: 'El archivo excede 15 MB.' };

    let extraccion;
    try {
      const { extractCotizacionFromFile } = await import('@/lib/ciclo-oc/extract-cotizacion');
      extraccion = await extractCotizacionFromFile(buffer, mime);
    } catch (err) {
      return { ok: false, error: `No pude parsear la cotización con Vision: ${(err as Error).message}` };
    }

    if (!extraccion.proveedor?.nombre?.trim()) {
      return { ok: false, error: 'Vision no detectó nombre del proveedor. Revisa que la cotización sea legible o crea la OC manualmente.', extraccion };
    }
    if (extraccion.items.length === 0) {
      return { ok: false, error: 'Vision no detectó items válidos en la cotización.', extraccion };
    }

    // Delegar a qb_crear_orden_compra reciclando el flujo
    const mappedInput = {
      proveedor_nombre: extraccion.proveedor.nombre,
      proveedor_rfc:    extraccion.proveedor.rfc ?? undefined,
      proveedor_email:  extraccion.proveedor.email ?? undefined,
      conceptos:        extraccion.items,
      folio_interno:    args.folio_interno,
      descripcion:      args.descripcion ?? `Desde cotización proveedor (Vision AI, confianza global ${extraccion.confianza?.global ?? 'N/A'})`,
    };

    const result = await executeAgentToolInner('qb_crear_orden_compra', mappedInput as Record<string, unknown>, ctx);
    // Anexar la extracción al resultado para trazabilidad
    if (result && typeof result === 'object') {
      (result as any).extraccion = extraccion;
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_oc_a_firma_humana — Nox escala cuando autofirma no procede
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_oc_a_firma_humana') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para escalar la OC a firma humana.' };
    const refundEsc = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund enviar_oc_a_firma_humana: ${r}` });

    const args = toolInput as { expediente_id?: string; razon?: string };
    if (!args.expediente_id) { await refundEsc('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundEsc('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (!exp.oc_pdf_path) { await refundEsc('no_pdf'); return { ok: false, error: 'Descarga primero el PDF con qb_descargar_oc_pdf.' }; }

    const { loadOrgDirectory } = await import('@/lib/portal/directory');
    const directory = await loadOrgDirectory(portalEmail, supabase);
    const autorizadores = directory.filter(p => p.is_oc_autorizador && p.email?.trim());
    if (autorizadores.length === 0) {
      await refundEsc('no_autorizador');
      return { ok: false, error: 'No hay ninguna persona marcada como autorizador de OC en el directorio. Configúralo en el portal.' };
    }

    // Signed URL para adjuntar (7 días)
    const { data: signed } = await supabase.storage.from('cfdi').createSignedUrl(exp.oc_pdf_path, 60 * 60 * 24 * 7);
    const pdfUrl = signed?.signedUrl ?? null;

    const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const subject = `Autorización requerida — OC ${exp.qb_po_folio ?? exp.id.slice(0, 8)} · ${exp.proveedor_nombre ?? '(sin proveedor)'} · ${fmt(Number(exp.oc_monto_mxn ?? 0))}`;
    const razon = args.razon ?? exp.requiere_atencion_razon ?? 'La OC no cumplió las reglas de autofirma configuradas.';

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid rgba(108,59,255,0.15);">
          <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #f59e0b; margin: 0 0 12px;">Requiere autorización</p>
          <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 20px; color: #1A0A3B;">${businessName}</h1>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480; width: 140px;">Proveedor</td><td style="padding: 6px 0; font-size: 13px; color: #1A0A3B; font-weight: 600;">${exp.proveedor_nombre ?? '—'}</td></tr>
            <tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480;">OC en QB</td><td style="padding: 6px 0; font-size: 13px; color: #1A0A3B;">${exp.qb_po_folio ? `#${exp.qb_po_folio}` : exp.id.slice(0, 8)}</td></tr>
            <tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480;">Monto</td><td style="padding: 6px 0; font-size: 13px; color: #1A0A3B; font-weight: 700;">${fmt(Number(exp.oc_monto_mxn ?? 0))}</td></tr>
          </table>
          <div style="border-top: 1px solid #F0EDF9; padding-top: 20px; margin-bottom: 20px;">
            <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6B6480; margin: 0 0 8px;">Por qué se escala</p>
            <p style="font-size: 13px; line-height: 1.65; color: #1A0A3B; margin: 0;">${razon.replace(/</g, '&lt;')}</p>
          </div>
          ${pdfUrl ? `<a href="${pdfUrl}" style="display: inline-block; padding: 12px 20px; background: #6C3BFF; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 13px;">Ver PDF de la OC</a>` : ''}
          <p style="font-size: 11px; color: #9B8FB5; margin: 24px 0 0;">Cuando decidas, responde este correo o firma físicamente el PDF y regrésaselo a ${(agent.agent_name as string | null) ?? 'tu facturista'}.</p>
        </div>
      </div>
    `.trim();

    let enviados = 0;
    for (const persona of autorizadores) {
      const ok = await sendEmail({ to: persona.email!, subject, html });
      if (ok) enviados++;
    }

    if (enviados === 0) { await refundEsc('email_send_failed'); return { ok: false, error: 'No se pudo enviar el correo a ningún autorizador.' }; }

    await supabase.from('expedientes_compras').update({
      status:                  exp.status === 'requiere_atencion' ? 'requiere_atencion' : exp.status,
      requiere_atencion_razon: razon,
      requiere_atencion_at:    exp.requiere_atencion_at ?? new Date().toISOString(),
    }).eq('id', exp.id);

    await supabase.from('expediente_eventos').insert({
      expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
      actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nox'}`,
      tipo: 'nota', from_status: exp.status, to_status: exp.status,
      detalle: { evento: 'escalacion_firma_humana', destinatarios: autorizadores.length, enviados, razon },
    });

    return {
      ok:                true,
      expediente_id:     exp.id,
      destinatarios:     autorizadores.map(p => ({ name: p.name, email: p.email })),
      enviados,
      message:           `Escalación enviada a ${enviados} autorizador(es). Espero su respuesta para continuar.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_oc_a_pagos — Nala manda OC firmada al depto de pagos
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_oc_a_pagos') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para enviar la OC a pagos.' };
    const refundEnv = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund enviar_oc_a_pagos: ${r}` });

    const args = toolInput as { expediente_id?: string; datos_bancarios?: string; nota?: string };
    if (!args.expediente_id) { await refundEnv('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundEnv('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (!exp.oc_firmada_at) { await refundEnv('not_signed'); return { ok: false, error: 'La OC aún no está firmada. Firma primero.' }; }
    if (!exp.oc_pdf_firmado_path) { await refundEnv('no_signed_pdf'); return { ok: false, error: 'No hay PDF firmado. Corre firmar_oc primero.' }; }

    const { loadOrgDirectory } = await import('@/lib/portal/directory');
    const directory = await loadOrgDirectory(portalEmail, supabase);
    const pagos = directory.filter(p => p.is_oc_pagos && p.email?.trim());
    if (pagos.length === 0) { await refundEnv('no_pagos'); return { ok: false, error: 'No hay nadie marcado como depto de pagos en el directorio.' }; }

    const { data: signed } = await supabase.storage.from('cfdi').createSignedUrl(exp.oc_pdf_firmado_path, 60 * 60 * 24 * 7);
    const pdfUrl = signed?.signedUrl ?? null;

    const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const subject = `Pago requerido — OC ${exp.qb_po_folio ?? exp.id.slice(0, 8)} · ${exp.proveedor_nombre ?? ''} · ${fmt(Number(exp.oc_monto_mxn ?? 0))}`;

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid rgba(108,59,255,0.15);">
          <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #0ea5e9; margin: 0 0 12px;">OC firmada — listo para pago</p>
          <h1 style="font-size: 22px; font-weight: 800; margin: 0 0 20px; color: #1A0A3B;">${exp.proveedor_nombre ?? 'Proveedor sin nombre'}</h1>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480; width: 140px;">OC en QB</td><td style="padding: 6px 0; font-size: 13px; color: #1A0A3B;">${exp.qb_po_folio ? `#${exp.qb_po_folio}` : exp.id.slice(0, 8)}</td></tr>
            <tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480;">Monto a transferir</td><td style="padding: 6px 0; font-size: 14px; color: #1A0A3B; font-weight: 800;">${fmt(Number(exp.oc_monto_mxn ?? 0))}</td></tr>
            <tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480;">RFC proveedor</td><td style="padding: 6px 0; font-size: 13px; color: #1A0A3B; font-family: monospace;">${exp.proveedor_rfc ?? '—'}</td></tr>
            ${args.datos_bancarios ? `<tr><td style="padding: 6px 0; font-size: 12px; color: #6B6480; vertical-align: top;">Datos bancarios</td><td style="padding: 6px 0; font-size: 12px; color: #1A0A3B; white-space: pre-wrap;">${String(args.datos_bancarios).replace(/</g, '&lt;')}</td></tr>` : ''}
          </table>
          ${args.nota ? `<div style="background: #F5F2FB; padding: 12px 14px; border-radius: 10px; margin-bottom: 20px; font-size: 12px; color: #1A0A3B;">${String(args.nota).replace(/</g, '&lt;')}</div>` : ''}
          ${pdfUrl ? `<a href="${pdfUrl}" style="display: inline-block; padding: 12px 20px; background: #6C3BFF; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 13px;">OC firmada (PDF)</a>` : ''}
          <p style="font-size: 11px; color: #9B8FB5; margin: 24px 0 0;">Al hacer la transferencia, respóndeme con el comprobante y lo registro para cerrar el paso.</p>
        </div>
      </div>
    `.trim();

    let enviados = 0;
    for (const p of pagos) {
      const ok = await sendEmail({ to: p.email!, subject, html });
      if (ok) enviados++;
    }
    if (enviados === 0) { await refundEnv('email_send_failed'); return { ok: false, error: 'No se pudo enviar el correo al depto de pagos.' }; }

    await supabase.from('expedientes_compras').update({
      oc_enviada_proveedor_at: exp.oc_enviada_proveedor_at, // no cambia aún — se marca en enviar_oc_a_proveedor
    }).eq('id', exp.id);

    await supabase.from('expediente_eventos').insert({
      expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
      actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nala'}`,
      tipo: 'nota', from_status: exp.status, to_status: exp.status,
      detalle: { evento: 'oc_enviada_a_pagos', destinatarios: pagos.length, enviados, monto: exp.oc_monto_mxn },
    });

    return {
      ok:            true,
      expediente_id: exp.id,
      destinatarios: pagos.map(p => ({ name: p.name, email: p.email })),
      enviados,
      message:       `OC firmada enviada a depto de pagos (${enviados} destinatario(s)). Espero comprobante para registrar el pago.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // registrar_comprobante_pago — Nala guarda comprobante + transiciona a oc_pagada
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'registrar_comprobante_pago') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para registrar el comprobante de pago.' };
    const refundReg = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund registrar_comprobante_pago: ${r}` });

    const args = toolInput as { expediente_id?: string; comprobante_base64?: string; extension?: string; comprobante_storage_path?: string; nota?: string };
    if (!args.expediente_id) { await refundReg('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }
    if (!args.comprobante_base64 && !args.comprobante_storage_path) {
      await refundReg('missing_comprobante');
      return { ok: false, error: 'Necesito comprobante_base64 (contenido del archivo) o comprobante_storage_path (si ya está en Storage).' };
    }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('id, status, oc_firmada_at, portal_email').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundReg('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }

    let comprobantePath = args.comprobante_storage_path ?? null;
    if (!comprobantePath && args.comprobante_base64) {
      const ext = (args.extension ?? 'pdf').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf';
      const buf = Buffer.from(args.comprobante_base64, 'base64');
      if (buf.length === 0) { await refundReg('empty_file'); return { ok: false, error: 'El archivo del comprobante está vacío.' }; }
      if (buf.length > 5 * 1024 * 1024) { await refundReg('file_too_big'); return { ok: false, error: 'El comprobante excede 5 MB.' }; }
      comprobantePath = `${portalEmail}/oc/${exp.id}_comprobante.${ext}`;
      const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
      const up = await supabase.storage.from('cfdi').upload(comprobantePath, buf, { contentType, upsert: true });
      if (up.error) { await refundReg('storage_upload_failed'); return { ok: false, error: `Storage upload: ${up.error.message}` }; }
    }

    const nowIso = new Date().toISOString();
    await supabase.from('expedientes_compras').update({
      status:                   'oc_pagada',
      oc_pagada_at:             nowIso,
      oc_comprobante_pago_path: comprobantePath,
    }).eq('id', exp.id);

    await supabase.from('expediente_eventos').insert({
      expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
      actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nala'}`,
      tipo: 'oc_pagada', from_status: exp.status, to_status: 'oc_pagada',
      detalle: { comprobante_path: comprobantePath, nota: args.nota ?? null },
    });

    return {
      ok:                true,
      expediente_id:     exp.id,
      comprobante_path:  comprobantePath,
      message:           'Comprobante de pago registrado. Expediente en estado `oc_pagada`. Ya se puede enviar al proveedor.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_oc_a_proveedor — Nala manda OC firmada + comprobante al proveedor
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_oc_a_proveedor') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para enviar al proveedor.' };
    const refundEnv = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund enviar_oc_a_proveedor: ${r}` });

    const args = toolInput as { expediente_id?: string; mensaje?: string };
    if (!args.expediente_id) { await refundEnv('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundEnv('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (!exp.proveedor_email?.trim()) { await refundEnv('no_proveedor_email'); return { ok: false, error: 'El expediente no tiene correo de proveedor.' }; }
    if (!exp.oc_pdf_firmado_path) { await refundEnv('no_signed_pdf'); return { ok: false, error: 'No hay OC firmada. Corre firmar_oc primero.' }; }
    if (!exp.oc_pagada_at) { await refundEnv('not_paid'); return { ok: false, error: 'La OC aún no está marcada como pagada. Registra el comprobante primero.' }; }

    // Verifier adversarial — enviamos email externo con datos financieros
    const { verifyDestructiveAction } = await import('@/lib/tools/verifier');
    const verdict = await verifyDestructiveAction({
      action:          'enviar OC firmada + comprobante de pago al proveedor externo (destructivo, cierra ciclo)',
      target:          exp.proveedor_email,
      reason:          `Proveedor: ${exp.proveedor_nombre ?? '—'} — OC ${exp.qb_po_folio ?? exp.id.slice(0, 8)} — monto ${exp.oc_monto_mxn}`,
      businessContext: (agent.knowledge_base as string | null) ?? null,
      currentIsoDate:  new Date().toISOString(),
    });
    if (!verdict.safe) { await refundEnv('verifier_blocked'); return { ok: false, error: `Verificador bloqueó el envío: ${verdict.concern ?? 'sin razón'}.` }; }

    const [pdfSigned, compSigned] = await Promise.all([
      supabase.storage.from('cfdi').createSignedUrl(exp.oc_pdf_firmado_path, 60 * 60 * 24 * 30),
      exp.oc_comprobante_pago_path
        ? supabase.storage.from('cfdi').createSignedUrl(exp.oc_comprobante_pago_path, 60 * 60 * 24 * 30)
        : Promise.resolve({ data: null }),
    ]);
    const pdfUrl = pdfSigned?.data?.signedUrl ?? null;
    const compUrl = (compSigned as any)?.data?.signedUrl ?? null;

    const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const subject = `Orden de Compra ${exp.qb_po_folio ?? ''} · ${businessName} · ${fmt(Number(exp.oc_monto_mxn ?? 0))}`;
    const mensajeCustom = args.mensaje ?? `Adjunto la Orden de Compra firmada y el comprobante de la transferencia realizada. Por favor confírmame recepción y coordinamos la entrega.`;

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: #fff; border-radius: 16px; padding: 32px; border: 1px solid rgba(108,59,255,0.15);">
          <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #22c55e; margin: 0 0 12px;">Pago confirmado</p>
          <h1 style="font-size: 20px; font-weight: 800; margin: 0 0 20px; color: #1A0A3B;">${businessName}</h1>
          <p style="font-size: 14px; line-height: 1.65; color: #1A0A3B; margin: 0 0 24px;">${mensajeCustom.replace(/</g, '&lt;')}</p>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
            ${pdfUrl ? `<a href="${pdfUrl}" style="display: inline-block; padding: 12px 18px; background: #6C3BFF; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 13px;">OC firmada (PDF)</a>` : ''}
            ${compUrl ? `<a href="${compUrl}" style="display: inline-block; padding: 12px 18px; background: #22c55e; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 13px;">Comprobante de pago</a>` : ''}
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 4px 0; font-size: 11px; color: #6B6480; width: 130px;">OC</td><td style="padding: 4px 0; font-size: 12px; color: #1A0A3B;">${exp.qb_po_folio ? `#${exp.qb_po_folio}` : exp.id.slice(0, 8)}</td></tr>
            <tr><td style="padding: 4px 0; font-size: 11px; color: #6B6480;">Monto</td><td style="padding: 4px 0; font-size: 12px; color: #1A0A3B; font-weight: 700;">${fmt(Number(exp.oc_monto_mxn ?? 0))}</td></tr>
          </table>
        </div>
      </div>
    `.trim();

    const ok = await sendEmail({ to: exp.proveedor_email, subject, html });
    if (!ok) { await refundEnv('email_send_failed'); return { ok: false, error: 'No se pudo enviar el correo al proveedor.' }; }

    const nowIso = new Date().toISOString();
    await supabase.from('expedientes_compras').update({
      status:                  'oc_enviada_proveedor',
      oc_enviada_proveedor_at: nowIso,
    }).eq('id', exp.id);

    await supabase.from('expediente_eventos').insert({
      expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
      actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nala'}`,
      tipo: 'oc_enviada_proveedor', from_status: exp.status, to_status: 'oc_enviada_proveedor',
      detalle: { proveedor_email: exp.proveedor_email, con_comprobante: !!compUrl },
    });

    return {
      ok:            true,
      expediente_id: exp.id,
      enviado_a:     exp.proveedor_email,
      message:       `OC firmada + comprobante enviados al proveedor (${exp.proveedor_email}). Expediente en estado \`oc_enviada_proveedor\`.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // archivar_expediente — Nala archiva XML+PDF+acuse a destino configurado
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'archivar_expediente') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para archivar el expediente.' };
    const refundArch = (r: string) => refundOps(agentId, 1, { source: 'tool_execution', label: `Refund archivar_expediente: ${r}` });

    const args = toolInput as { expediente_id?: string };
    if (!args.expediente_id) { await refundArch('missing_expediente'); return { ok: false, error: 'expediente_id es requerido.' }; }

    const { data: exp } = await supabase.from('expedientes_compras')
      .select('*').eq('id', args.expediente_id).eq('portal_email', portalEmail).single();
    if (!exp) { await refundArch('expediente_not_found'); return { ok: false, error: 'Expediente no encontrado.' }; }
    if (!exp.sf_uuid) { await refundArch('no_cfdi'); return { ok: false, error: 'No se puede archivar sin CFDI timbrado (falta sf_uuid).' }; }

    const { data: org } = await supabase.from('organizations')
      .select('ciclo_oc_config').eq('portal_email', portalEmail).single();
    const cfg = (org?.ciclo_oc_config as any) ?? {};
    if (!cfg.archivado_destino) { await refundArch('no_destino'); return { ok: false, error: 'No hay destino de archivado configurado en el portal.' }; }

    // Construir lista de archivos a archivar
    const files: Array<{ tipo: 'oc_firmada' | 'cfdi_xml' | 'cfdi_pdf' | 'cfdi_acuse'; ext: 'pdf' | 'xml'; srcPath: string }> = [];
    if (exp.oc_pdf_firmado_path) files.push({ tipo: 'oc_firmada', ext: 'pdf', srcPath: exp.oc_pdf_firmado_path });
    if (exp.cfdi_xml_path)        files.push({ tipo: 'cfdi_xml',   ext: 'xml', srcPath: exp.cfdi_xml_path });
    if (exp.cfdi_pdf_path)        files.push({ tipo: 'cfdi_pdf',   ext: 'pdf', srcPath: exp.cfdi_pdf_path });
    if (exp.cfdi_acuse_path)      files.push({ tipo: 'cfdi_acuse', ext: 'xml', srcPath: exp.cfdi_acuse_path });

    if (files.length === 0) { await refundArch('no_files'); return { ok: false, error: 'No hay archivos para archivar.' }; }

    try {
      const { archivarExpediente } = await import('@/lib/ciclo-oc/archivo-adapter');
      const result = await archivarExpediente({
        portalEmail,
        expedienteId:    exp.id,
        proveedorNombre: exp.proveedor_nombre,
        qbPoFolio:       exp.qb_po_folio,
        cfdiUuid:        exp.sf_uuid,
        fechaTimbrado:   exp.cfdi_timbrada_at ? new Date(exp.cfdi_timbrada_at) : new Date(),
        files,
      }, cfg, supabase);

      if (!result.ok) { await refundArch('adapter_failed'); return { ok: false, error: result.error ?? 'Archivado falló.' }; }

      const rutaResumen = result.archivados.map(a => a.ruta_destino).join(' | ');
      const nowIso = new Date().toISOString();
      const pending = result.archivados.some(a => a.pending);

      await supabase.from('expedientes_compras').update({
        status:               pending ? exp.status : 'docs_archivados',
        docs_archivados_at:   pending ? null : nowIso,
        docs_archivados_ruta: rutaResumen,
      }).eq('id', exp.id);

      await supabase.from('expediente_eventos').insert({
        expediente_id: exp.id, portal_email: portalEmail, agent_id: agentId,
        actor: `meerkat:${(agent.agent_name as string | null)?.toLowerCase() ?? 'nala'}`,
        tipo: pending ? 'nota' : 'docs_archivados',
        from_status: exp.status,
        to_status: pending ? exp.status : 'docs_archivados',
        detalle: { destino: result.destino, archivados: result.archivados, pending },
      });

      return {
        ok:              true,
        expediente_id:   exp.id,
        destino:         result.destino,
        archivos:        result.archivados.length,
        pending,
        message:         pending
          ? `Archivos marcados para pull por agente externo (${result.destino}). Rutas: ${rutaResumen}`
          : `Archivados ${result.archivados.length} archivos en ${result.destino}: ${rutaResumen}`,
      };
    } catch (err) { await refundArch('exception'); return { ok: false, error: String(err) }; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // revisar_desempeno_equipo — exclusiva de Niva (directora general)
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'revisar_desempeno_equipo') {
    const { reviewTeamPerformance } = await import('@/lib/ops/director-tools');
    const args = toolInput as { periodo?: 'hoy' | 'esta_semana' | 'este_mes' | 'ultima_semana' | 'ultimo_mes' | 'ultimos_30_dias' };
    const res = await reviewTeamPerformance({ supabase, portalEmail, periodo: args.periodo });
    return { ok: res.ok, message: res.summary, rows: res.rows, totals: res.totals };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // aprobar_gasto — exclusiva de Niva (directora general)
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'aprobar_gasto') {
    // Sub-user gate: aprobar gasto es una acción de director (Niva) que deja
    // audit trail comprometiendo presupuesto. Sub-user sin `negocio` no debe
    // aprobar en nombre del owner. Ver Scope D3 HIGH-2.
    if (ctx.requesterIsSubUser && !(ctx.requesterModules ?? []).includes('negocio')) {
      return { ok: false, error: 'Solo el dueño (o un sub-usuario con permiso "negocio") puede aprobar gastos.' };
    }
    const { recordExpenseApproval } = await import('@/lib/ops/director-tools');
    const args = toolInput as { concepto?: string; monto?: number; justificacion?: string; status?: 'approved' | 'rejected' };
    if (!args.concepto || typeof args.monto !== 'number') {
      return { ok: false, error: 'Necesito concepto y monto (número) para registrar la aprobación.' };
    }
    const res = await recordExpenseApproval({
      supabase, portalEmail, approvedBy: agentId,
      concept: args.concepto, amountMxn: args.monto,
      justification: args.justificacion ?? null,
      status: args.status ?? 'approved',
    });
    return res.ok ? { ok: true, message: res.message, id: res.id } : { ok: false, error: res.error };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // evaluar_limite_gasto — Niva la invoca ANTES de aprobar_gasto para
  // verificar contra presupuesto mensual + gasto acumulado del mes.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'evaluar_limite_gasto') {
    const { evaluateExpenseBudget } = await import('@/lib/ops/director-tools');
    const args = toolInput as { monto?: number };
    if (typeof args.monto !== 'number' || !(args.monto > 0)) {
      return { ok: false, error: 'Necesito monto (número > 0).' };
    }
    const res = await evaluateExpenseBudget({ supabase, portalEmail, amountMxn: args.monto });
    return res;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // verificar_gasto_recurrente — cuando llega factura de proveedor, revisa
  // si es proveedor recurrente con histórico aprobado. Señal para auto-marcar
  // como pagada sin escalar al humano.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'verificar_gasto_recurrente') {
    const { verifyRecurringExpense } = await import('@/lib/ops/director-tools');
    const args = toolInput as { proveedor?: string; monto?: number };
    if (!args.proveedor?.trim()) {
      return { ok: false, error: 'Necesito nombre del proveedor.' };
    }
    const res = await verifyRecurringExpense({
      supabase, portalEmail,
      proveedor: args.proveedor,
      monto:     typeof args.monto === 'number' ? args.monto : undefined,
    });
    return res;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_documento_oficina — reutilizar documentos ya generados
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_documento_oficina') {
    const { searchOfficeDocuments, formatDocsForAgent } = await import('@/lib/documents/ops-docs-search');
    const args = toolInput as { query?: string; kind?: string; cliente?: string; limit?: number };
    const docs = await searchOfficeDocuments({
      supabase, portalEmail,
      query: args.query ?? null, kind: args.kind ?? null,
      clientName: args.cliente ?? null, limit: args.limit ?? 10,
    });
    return { ok: true, message: formatDocsForAgent(docs), count: docs.length, docs };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_documento_oficina — adjuntar doc existente a un correo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_documento_oficina') {
    const { sendOfficeDocumentByEmail } = await import('@/lib/documents/ops-docs-search');
    const args = toolInput as { document_id?: string; to?: string; subject?: string; body?: string };
    if (!args.document_id || !args.to || !args.subject || !args.body) {
      return { ok: false, error: 'Necesito document_id, destinatario, asunto y cuerpo.' };
    }

    // Intent lock: dos meerkats podrían adjuntar el MISMO document_id al MISMO
    // destinatario en paralelo (ej: cliente pide "mándame la cotización" y
    // Nia + Nova reaccionan). document_id es el dedupe fuerte — si el
    // documento y el destinatario son idénticos, es el mismo envío.
    const { tryClaimReportIntent, commitReportIntent, releaseReportIntent, formatDuplicateReportMessage } =
      await import('@/lib/ops/report-intent-lock');
    const claim = await tryClaimReportIntent({
      portalEmail,
      kind:      'email',
      target:    args.to,
      subject:   `[doc-attach] ${args.document_id} :: ${args.subject}`,
      agentId,
      agentName,
      extraDedupe: args.document_id,
      sourceContext: {
        tool:        'enviar_documento_oficina',
        channel:     ctx.channel ?? 'chat',
        document_id: args.document_id,
      },
    });
    if (!claim.claimed) {
      return {
        ok: false,
        deduped: true,
        message: formatDuplicateReportMessage(claim),
        already_claimed_by: claim.alreadyClaimedBy,
      };
    }

    const res = await sendOfficeDocumentByEmail({
      supabase, portalEmail, agentId,
      documentId: args.document_id, to: args.to,
      subject: args.subject, body: args.body,
    });
    if (res.ok) await commitReportIntent(claim.lockId);
    else        await releaseReportIntent(claim.lockId);
    return res.ok ? { ok: true, message: res.message ?? 'Correo enviado.' } : { ok: false, error: res.error };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // crear_lead
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'crear_lead') {
    const args = toolInput as Record<string, string | undefined>;
    // source refleja el canal real donde llegó el lead (chat portal, voz, email).
    // Antes hardcodeaba 'chat', escondiendo métricas de leads por canal.
    // Dedup: si el mismo agente ya registró este whatsapp/email en <10min, hacemos
    // update en vez de insertar (previene el bug donde el modelo re-ejecuta la
    // tool tras un "no lo veo" del usuario y crea duplicados).
    try {
      const upsert = await upsertLeadWithDedup(supabase, {
        agentId, source: ctx.channel ?? 'chat',
        nombre:      args.nombre ?? null,
        negocio:     args.negocio ?? null,
        giro:        args.giro ?? null,
        servicio:    args.servicio ?? null,
        presupuesto: args.presupuesto ?? null,
        timeline:    args.timeline ?? null,
        email:       args.email ?? null,
        whatsapp:    args.whatsapp ?? null,
      });
      // Fire-and-forget Sheets sync — never blocks, never propagates.
      void sheetsService.syncLeadToSheets(portalEmail, agentId, args as Record<string, string | undefined>);
      const message = upsert.action === 'updated'
        ? `Ya tenías a ${args.nombre ?? 'este prospecto'} registrado hace unos minutos; actualicé sus datos en Llamadas.`
        : `Lead de ${args.nombre ?? 'nuevo prospecto'} registrado. Visible en Llamadas.`;
      return { ok: true, message };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[executor:crear_lead] failed', { agentId, portalEmail, args, err });
      return { ok: false, error: `No se pudo registrar el lead: ${detail}` };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // crear_contacto_saliente
  //
  // Agrega un prospecto a la lista de contactos salientes (outbound_contacts)
  // para que se le llame después desde una campaña. Dedup mismo agente + mismo
  // teléfono en <10min contra registros pending.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'crear_contacto_saliente') {
    const args = toolInput as Record<string, string | string[] | undefined>;
    const telefono = typeof args.telefono === 'string' ? args.telefono.trim() : '';
    if (!telefono) {
      return { ok: false, error: 'Necesito el teléfono del contacto para agregarlo.' };
    }
    // tags puede llegar como array o como string suelto (ej. "Lead" o "Lead,VIP")
    const rawTags = args.tags;
    const tags: string[] | null = Array.isArray(rawTags)
      ? rawTags.map(t => String(t).trim()).filter(Boolean)
      : typeof rawTags === 'string' && rawTags.trim()
        ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
        : null;
    try {
      const upsert = await upsertOutboundContactWithDedup(supabase, {
        agentId,
        nombre:      typeof args.nombre === 'string' ? args.nombre : null,
        telefono,
        motivo:      typeof args.motivo === 'string' ? args.motivo : null,
        scheduledAt: typeof args.scheduled_at === 'string' ? args.scheduled_at : null,
        email:       typeof args.email === 'string' ? args.email : null,
        tags:        tags && tags.length > 0 ? tags : null,
        source:      ctx.channel === 'voice' ? 'llamada_entrante' : 'manual',
      });
      const message = upsert.action === 'updated'
        ? `Ya tenía a ${args.nombre ?? 'este contacto'} en la lista de salientes; actualicé sus datos.`
        : `${args.nombre ?? 'Contacto'} agregado a la lista de salientes. Aparece en Campañas.`;
      return { ok: true, message };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[executor:crear_contacto_saliente] failed', { agentId, portalEmail, args, err });
      return { ok: false, error: `No se pudo agregar el contacto saliente: ${detail}` };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // agendar_cita
  //
  // Con proteccion contra empalmes: si el agente recibe fecha_iso + hora en
  // formato parseable, calcula starts_at y verifica colisiones ANTES de
  // insertar. Doble capa: (1) appointments_voice del mismo agente, (2) Google
  // Calendar / Outlook si esta conectado. Si conflict, devuelve error para que
  // el modelo proponga otro horario. Si libre y hay calendar conectado, tambien
  // crea el evento ahi.
  //
  // Fallback: si fecha_iso no viene (formato natural viejo), inserta sin check
  // como antes — no rompe agentes que aun no tienen prompt actualizado.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'agendar_cita') {
    const args = toolInput as Record<string, string | number | undefined>;
    const accion   = args.accion as string | undefined;
    const nombre   = args.nombre as string | undefined;
    const servicio = args.servicio as string | undefined;
    const fecha    = args.fecha as string | undefined;
    const hora     = args.hora as string | undefined;
    const telefono = args.telefono as string | undefined;
    const fechaIso = args.fecha_iso as string | undefined;
    const ubicacion = args.ubicacion as string | undefined;
    const duracionMin = typeof args.duracion_min === 'number'
      ? args.duracion_min
      : (typeof args.duracion_min === 'string' ? parseInt(args.duracion_min, 10) : 60);

    // Parsear a Date en zona horaria Mexico City (UTC-6, sin DST desde 2022).
    // Requiere fecha_iso (YYYY-MM-DD) + hora (HH:MM). Si algo falla, startsAt = null.
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    if (fechaIso && hora && /^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
      const m = hora.trim().match(/^(\d{1,2}):?(\d{2})?/);
      if (m) {
        const hh = String(parseInt(m[1], 10)).padStart(2, '0');
        const mm = m[2] ? m[2].padStart(2, '0') : '00';
        const iso = `${fechaIso}T${hh}:${mm}:00-06:00`;
        const d = new Date(iso);
        if (!isNaN(d.getTime())) {
          startsAt = d;
          endsAt = new Date(d.getTime() + duracionMin * 60_000);
        }
      }
    }

    if (accion === 'agendar' || accion === 'modificar') {
      // Guard duro: sin fecha_iso + hora parseables no podemos detectar empalmes.
      // Rechazamos con mensaje explicito para que el modelo reintente correctamente.
      if (!startsAt || !endsAt) {
        return {
          ok:    false,
          error: 'agendar_cita_missing_fecha_iso_or_hora',
          message: 'No puedo confirmar la cita sin fecha_iso (YYYY-MM-DD) y hora (HH:MM 24h). Vuelve a llamar agendar_cita incluyendo AMBOS campos (ej: fecha_iso="2026-08-11", hora="12:00").',
        };
      }

      if (accion === 'modificar' && telefono) {
        await supabase.from('appointments_voice').update({ status: 'cancelada' })
          .eq('agent_id', agentId).eq('telefono', telefono).eq('status', 'confirmada');
      }

      // Conflict check
      {
        // 1) DB interna via starts_at (rows creadas con executor nuevo).
        const { data: dbConflicts } = await supabase
          .from('appointments_voice')
          .select('nombre, hora, telefono')
          .eq('agent_id', agentId)
          .eq('status', 'confirmada')
          .eq('starts_at', startsAt.toISOString());
        if (dbConflicts && dbConflicts.length > 0) {
          const c = dbConflicts[0];
          return {
            ok: false,
            message: `Ese horario ya esta ocupado por una cita con ${c.nombre ?? 'otro cliente'} a las ${c.hora ?? hora}. Propon al cliente un horario distinto.`,
          };
        }

        // 1b) Fallback DB check via fecha + hora string exacto (atrapa rows viejos
        //     con starts_at NULL pero fecha en formato YYYY-MM-DD igual a fecha_iso).
        const { data: legacyConflicts } = await supabase
          .from('appointments_voice')
          .select('nombre, hora, telefono, starts_at')
          .eq('agent_id', agentId)
          .eq('status', 'confirmada')
          .eq('fecha', fechaIso)
          .eq('hora', hora ?? '')
          .is('starts_at', null);
        if (legacyConflicts && legacyConflicts.length > 0) {
          const c = legacyConflicts[0];
          return {
            ok: false,
            message: `Ese horario ya esta ocupado por una cita con ${c.nombre ?? 'otro cliente'} a las ${c.hora ?? hora}. Propon al cliente un horario distinto.`,
          };
        }

        // 2) Google/Outlook Calendar si esta conectado: overlap con eventos externos.
        //    Margen de 15min hacia atras para atrapar eventos que empiezan justo antes.
        const rangeStart = new Date(startsAt.getTime() - 15 * 60_000);
        const calResult = await executeListCalendarEvents(agentId, rangeStart, endsAt, supabase);
        if (calResult.ok && Array.isArray(calResult.events)) {
          const overlapping = calResult.events.filter((e: { start: string; end: string }) => {
            const es = new Date(e.start).getTime();
            const ee = new Date(e.end).getTime();
            return es < endsAt.getTime() && ee > startsAt.getTime();
          });
          if (overlapping.length > 0) {
            const first = overlapping[0] as { title: string; start: string };
            const timeStr = new Date(first.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
            return {
              ok: false,
              message: `El calendario ya tiene "${first.title}" a las ${timeStr}. Propon al cliente un horario distinto.`,
            };
          }
        }
      }

      // Insert principal en appointments_voice — devuelve id para poder linkear
      // el evento de calendario después.
      const { data: insertedAppt } = await supabase.from('appointments_voice').insert({
        agent_id: agentId, nombre: nombre ?? null, telefono: telefono ?? null,
        servicio: servicio ?? null, fecha: fecha ?? null, hora: hora ?? null,
        starts_at: startsAt ? startsAt.toISOString() : null,
        status: 'confirmada',
        location: ubicacion ?? null,
      }).select('id').single();

      // Sync a Google/Outlook Calendar si esta conectado. Fire and log — si falla
      // no revertimos la cita en DB (la cita interna es la fuente de verdad para
      // outbound reminders del cron). Si el evento se crea OK, guardamos el ID
      // + provider en la row para que el portal pueda deep-link al evento.
      if (startsAt && endsAt) {
        const title = `Cita ${servicio ? `— ${servicio} ` : ''}${nombre ? `(${nombre})` : ''}`.trim();
        const created = await executeCreateCalendarEvent(agentId, {
          title,
          start: startsAt.toISOString(),
          end:   endsAt.toISOString(),
          description: telefono ? `Tel: ${telefono}` : undefined,
          location: ubicacion,
        }, supabase);
        if (created.ok && insertedAppt?.id) {
          const event = (created as { event?: { id?: string } }).event;
          const eventId = event?.id;
          // Determinar provider: gmail o outlook. Lo inferimos de la integration
          // activa del agente (per-agent primero, org fallback).
          const { data: perAgent } = await supabase
            .from('email_integrations')
            .select('provider')
            .eq('agent_id', agentId)
            .eq('needs_reauth', false)
            .maybeSingle();
          let provider: string | null = (perAgent?.provider as string | null) ?? null;
          if (!provider) {
            const { data: agentRow } = await supabase
              .from('voice_agents').select('portal_email').eq('id', agentId).maybeSingle();
            if (agentRow?.portal_email) {
              const { data: orgAcct } = await supabase
                .from('integration_accounts')
                .select('provider')
                .eq('portal_email', agentRow.portal_email as string)
                .in('provider', ['gmail', 'outlook'])
                .maybeSingle();
              provider = (orgAcct?.provider as string | null) ?? null;
            }
          }
          if (eventId) {
            await supabase.from('appointments_voice')
              .update({ calendar_event_id: eventId, calendar_provider: provider })
              .eq('id', insertedAppt.id);
          }
        } else if (!created.ok) {
          console.warn('[agendar_cita] calendar sync skipped', { agentId, error: created.error });
        }
      }
    } else if (accion === 'cancelar' && telefono) {
      await supabase.from('appointments_voice').update({ status: 'cancelada' })
        .eq('agent_id', agentId).eq('telefono', telefono).eq('status', 'confirmada');
    }
    const labels: Record<string, string> = {
      agendar:   `Cita agendada para ${fecha ?? ''}${hora ? ` a las ${hora}` : ''}.`,
      modificar: `Cita modificada para ${fecha ?? ''}${hora ? ` a las ${hora}` : ''}.`,
      cancelar:  'Cita cancelada correctamente.',
    };
    return { ok: true, message: labels[accion ?? ''] ?? 'Solicitud de cita procesada.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // registrar_pedido
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'registrar_pedido') {
    const args = toolInput as Record<string, string | undefined>;
    const { error } = await supabase.from('orders_voice').insert({
      agent_id: agentId, nombre: args.nombre ?? null, telefono: args.telefono ?? null,
      items: args.items ?? '', tipo: args.tipo ?? 'recoger',
      direccion: args.direccion ?? null, notas: args.notas ?? null, status: 'nuevo',
    });
    const tipoLabel = args.tipo === 'entrega' ? 'entrega a domicilio' : 'recoger en sucursal';
    return error
      ? { ok: false, error: 'No se pudo registrar el pedido.' }
      : { ok: true, message: `Pedido registrado para ${tipoLabel}. Visible en Llamadas → Pedidos.` };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_cliente
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_cliente') {
    const identificador = toolInput.identificador as string;
    if (!identificador) return { ok: false, error: 'Proporciona nombre, teléfono o email del cliente.' };
    const normId = identificador.replace(/\D/g, '');

    const [callsRes, leadsRes, ordersRes, apptsRes] = await Promise.all([
      supabase.from('voice_calls').select('caller_number, summary, outcome, created_at')
        .eq('agent_id', agentId).ilike('caller_number', `%${normId || identificador}%`)
        .order('created_at', { ascending: false }).limit(5),
      supabase.from('leads_voice').select('nombre, negocio, servicio, email, whatsapp, created_at')
        .eq('agent_id', agentId)
        .or(`nombre.ilike.%${identificador}%,whatsapp.ilike.%${normId || identificador}%`)
        .order('created_at', { ascending: false }).limit(3),
      supabase.from('orders_voice').select('nombre, items, status, created_at')
        .eq('agent_id', agentId)
        .or(`nombre.ilike.%${identificador}%,telefono.ilike.%${normId || identificador}%`)
        .order('created_at', { ascending: false }).limit(3),
      supabase.from('appointments_voice').select('nombre, servicio, fecha, hora, status, created_at')
        .eq('agent_id', agentId)
        .or(`nombre.ilike.%${identificador}%,telefono.ilike.%${normId || identificador}%`)
        .order('created_at', { ascending: false }).limit(3),
    ]);

    const calls  = callsRes.data  ?? [];
    const leads  = leadsRes.data  ?? [];
    const orders = ordersRes.data ?? [];
    const appts  = apptsRes.data  ?? [];

    if (!calls.length && !leads.length && !orders.length && !appts.length) {
      return { ok: true, found: false, message: 'No se encontraron registros previos de ese cliente.' };
    }

    const parts: string[] = [];
    const lead = leads[0] as Record<string, unknown> | undefined;
    if (lead?.nombre)   parts.push(`Nombre: ${lead.nombre}`);
    if (lead?.negocio)  parts.push(`Negocio: ${lead.negocio}`);
    if (lead?.servicio) parts.push(`Servicio de interés: ${lead.servicio}`);
    if (calls.length)   parts.push(`Ha llamado ${calls.length} vez${calls.length > 1 ? 'es' : ''}${(calls[0] as any).summary ? `. Última: ${(calls[0] as any).summary}` : '.'}`);
    const pendingAppts  = appts.filter((a: any) => a.status === 'confirmada');
    if (pendingAppts.length) {
      const a = pendingAppts[0] as any;
      parts.push(`Cita agendada: ${a.servicio ?? ''} el ${a.fecha ?? '?'} a las ${a.hora ?? '?'}.`);
    }
    const pendingOrders = orders.filter((o: any) => o.status === 'nuevo' || o.status === 'en_proceso');
    if (pendingOrders.length) parts.push(`Pedido pendiente: ${(pendingOrders[0] as any).items ?? ''}.`);

    return { ok: true, found: true, message: parts.join(' ') };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // crear_ticket
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'crear_ticket') {
    const { titulo, categoria = 'otro', prioridad = 'normal', descripcion, caller_number } = toolInput as Record<string, string | undefined>;
    if (!titulo) return { ok: false, error: 'El título del ticket es requerido.' };

    const { data: agentRow } = await supabase.from('voice_agents')
      .select('directorio_interno, guardia_schedule, timezone')
      .eq('id', agentId).single();

    const directorio = (agentRow?.directorio_interno ?? []) as DirectorioContacto[];
    let asignadoA:   string | null = null;
    let asignadoTel: string | null = null;

    if (directorio.length) {
      const q     = `${categoria} ${titulo} ${descripcion ?? ''}`.toLowerCase();
      const match = directorio.find(c => c.atiende.toLowerCase().split(/[\s,]+/).some(kw => kw.length > 3 && q.includes(kw)));
      if (match) { asignadoA = match.nombre; asignadoTel = match.telefono || null; }
    }
    if (prioridad === 'alta' || prioridad === 'critica') {
      const guardia = ((agentRow?.guardia_schedule as GuardiaSchedule | null)?.areas ?? []) as GuardiaArea[];
      const q       = `${categoria} ${titulo}`.toLowerCase();
      const area    = guardia.find(a => q.includes(a.nombre.toLowerCase().split(' ')[0].toLowerCase())) ?? guardia[0];
      if (area) {
        const tz     = (agentRow?.timezone as string | null) ?? 'America/Monterrey';
        const oncall = getCurrentOnCall(area, tz);
        if (oncall) { asignadoA = oncall.tecnico; asignadoTel = oncall.telefono; }
      }
    }

    const folio = await getNextTicketFolio(agentId, supabase as any);
    await supabase.from('helpdesk_tickets').insert({
      agent_id: agentId, folio, caller_number: caller_number ?? null,
      categoria: categoria ?? 'otro', prioridad: prioridad ?? 'normal',
      titulo, descripcion: descripcion ?? null, asignado_a: asignadoA, asignado_tel: asignadoTel, status: 'abierto',
    });

    const assignMsg = asignadoA ? ` Asignado a ${asignadoA}.` : '';
    return { ok: true, folio, message: `Ticket ${folio} creado.${assignMsg} Visible en Oficina → Helpdesk.` };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // consultar_incidentes
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'consultar_incidentes') {
    const tema = (toolInput.tema as string | undefined) ?? '';
    const { data: incidents } = await supabase.from('it_incidents')
      .select('titulo, descripcion, mensaje_voz, keywords')
      .eq('agent_id', agentId).eq('activo', true)
      .order('created_at', { ascending: false });

    if (!incidents?.length) return { ok: true, incidents: [], message: 'No hay incidentes activos en este momento.' };

    const q = tema.toLowerCase();
    const matches = q
      ? incidents.filter(i => {
          const all = [...((i.keywords as string[]) ?? []), i.titulo, i.descripcion].join(' ').toLowerCase();
          return q.split(/\s+/).some(w => w.length > 3 && all.includes(w));
        })
      : incidents;

    const active = matches.length ? matches : incidents;
    return { ok: true, count: active.length, incidents: active, message: active.map((i: any) => i.mensaje_voz ?? i.titulo).join(' — ') };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_directorio
  // Dos modos: (1) tipo_contacto = búsqueda directa por flag de DirectoryPerson
  // (contacto_operaciones, autorizador_oc, encargado_pagos, dueno); (2) tipo_-
  // problema = búsqueda libre por área/expertise (Neo helpdesk). Lee de
  // organizations.directory (fuente actual). Voice endpoint hace lo mismo:
  // src/app/api/voice/tools/buscar-directorio/route.ts — mantener alineado.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_directorio') {
    const tipoContacto = (toolInput.tipo_contacto as string | undefined) ?? null;
    const q = ((toolInput.tipo_problema as string | undefined) ?? '').toLowerCase();

    const { data: agentRow } = await supabase.from('voice_agents')
      .select('portal_email, timezone')
      .eq('id', agentId).single();

    const orgEmail = (agentRow?.portal_email as string | null) ?? null;
    const { data: org } = orgEmail
      ? await supabase.from('organizations')
          .select('directory, guardia_schedule')
          .eq('portal_email', orgEmail)
          .single()
      : { data: null };

    const directory: DirectoryPerson[] = ((org as any)?.directory ?? []);
    const guardia   = (((org as any)?.guardia_schedule as GuardiaSchedule | null)?.areas ?? []) as GuardiaArea[];
    const tz        = (agentRow?.timezone as string | null) ?? 'America/Monterrey';

    // Rama por flag: mapping en un solo lugar. Ver también voice endpoint.
    const FLAG_LOOKUPS: Record<string, keyof DirectoryPerson> = {
      contacto_operaciones: 'is_operations_contact',
      autorizador_oc:       'is_oc_autorizador',
      encargado_pagos:      'is_oc_pagos',
      dueno:                'is_owner',
    };

    if (tipoContacto) {
      const flagKey = FLAG_LOOKUPS[tipoContacto];
      if (!flagKey) {
        return { ok: false, error: `Tipo de contacto "${tipoContacto}" no reconocido. Válidos: ${Object.keys(FLAG_LOOKUPS).join(', ')}.` };
      }
      const matches = directory.filter(p => !!(p as any)[flagKey]);
      if (matches.length === 0) {
        return { ok: true, message: `No hay nadie marcado como ${tipoContacto.replace('_', ' ')} en el directorio de la organización. El dueño lo configura en el portal.` };
      }
      const summary = matches.map((p, i) => {
        const parts = [p.name];
        if (p.role)      parts.push(`(${p.role})`);
        if (p.phone)     parts.push(`— ${p.phone}`);
        if (p.email)     parts.push(`· ${p.email}`);
        if (p.extension) parts.push(`ext. ${p.extension}`);
        return matches.length > 1 ? `${i + 1}. ${parts.join(' ')}` : parts.join(' ');
      }).join('\n');
      return { ok: true, message: summary };
    }

    // Rama helpdesk (Neo): match por expertise/departamento + guardia.
    const lines: string[] = [];
    if (directory.length && q) {
      const match = directory.find(p => {
        const expertise = (p.helpdesk_expertise ?? '').toLowerCase();
        const dept      = (p.department ?? '').toLowerCase();
        return expertise.split(/[\s,]+/).some(kw => kw.length > 3 && q.includes(kw))
            || dept.split(/\s+/).some(kw => q.includes(kw));
      });
      if (match) {
        const ext = match.extension ? ` (ext. ${match.extension})` : '';
        const tel = match.phone     ? `, ${match.phone}` : '';
        const dep = match.department ? ` se encarga de ${match.department}` : '';
        lines.push(`${match.name}${dep}${ext}${tel}.`);
      } else {
        lines.push('No encontré un especialista exacto en el directorio.');
      }
    }

    if (guardia.length) {
      const area   = q ? guardia.find(a => q.includes(a.nombre.toLowerCase().split(' ')[0].toLowerCase())) : undefined;
      const target = area ?? guardia[0];
      if (target) {
        const oncall = getCurrentOnCall(target, tz);
        if (oncall) lines.push(`Guardia ahora en ${target.nombre}: ${oncall.tecnico}${oncall.telefono ? `, ${oncall.telefono}` : ''}.`);
      }
    }

    return { ok: true, message: lines.length ? lines.join(' ') : 'No hay directorio configurado para esta área.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // iniciar_onboarding
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'iniciar_onboarding') {
    const contactName  = (toolInput.contact_name  as string | undefined)?.trim() ?? '';
    const contactEmail = (toolInput.contact_email as string | undefined)?.trim() ?? '';
    const templateName = (toolInput.template_name as string | undefined)?.trim() ?? null;

    if (!contactName || !contactEmail) {
      return { ok: false, error: 'Nombre y correo del contacto son requeridos.' };
    }

    // Get all agent IDs in this account
    const { data: peers } = await supabase
      .from('voice_agents').select('id').eq('portal_email', portalEmail);
    const agentIds = (peers ?? []).map((a: any) => a.id as string);

    // Find active templates
    const { data: templates } = await supabase
      .from('onboarding_templates')
      .select('id, name, steps, notes')
      .in('agent_id', agentIds)
      .eq('active', true);

    if (!templates?.length) {
      return { ok: false, error: 'No hay plantillas de onboarding activas. Crea una desde el portal primero.' };
    }

    // Pick best-matching template
    const tpl = templateName
      ? (templates.find((t: any) => (t.name as string).toLowerCase().includes(templateName.toLowerCase())) ?? templates[0])
      : templates[0];

    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const submitToken = randomUUID();
    const submitUrl  = `${baseUrl}/onboarding/${submitToken}`;

    const { data: instance, error } = await supabase.from('onboarding_instances').insert({
      agent_id:       agentId,
      template_id:    (tpl as any).id,
      contact_name:   contactName,
      contact_email:  contactEmail,
      submit_token:   submitToken,
      status:         'pendiente',
      submitted_docs: [],
    }).select('id').single();

    if (error) return { ok: false, error: error.message };

    const { recordOnboardingCreation } = await import('@/lib/state-machines/onboarding-instance');
    await recordOnboardingCreation({
      supabase,
      instanceId: instance!.id as string,
      actor:      `agent:${agentId}`,
      reason:     'naia_initiated_onboarding',
      metadata:   { template_id: (tpl as any).id, contact_name: contactName, contact_email: contactEmail },
    });

    await sendOnboardingWelcome({
      to:           contactEmail,
      clientName:   contactName,
      businessName,
      templateName: (tpl as any).name as string,
      submitUrl,
      steps:        (tpl as any).steps as string[],
      notes:        (tpl as any).notes as string | null,
    });

    return {
      ok:      true,
      message: `Onboarding iniciado para ${contactName}. Le envié el correo de bienvenida a ${contactEmail} con el proceso "${(tpl as any).name}".`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // pedir_a_humano
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'pedir_a_humano') {
    const { pedirAHumano } = await import('@/lib/tools/handlers/pedir-a-humano');
    return await pedirAHumano(toolInput as unknown as Parameters<typeof pedirAHumano>[0], ctx);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // consultar_catalogo_externo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'consultar_catalogo_externo') {
    const tramiteId = toolInput.tramite_id as string | undefined;
    const catalogoKey = toolInput.catalogo_key as string | undefined;
    const filtrosInput = toolInput.filtros as Record<string, unknown> | undefined;

    if (!tramiteId) return { ok: false, error: 'El ID del trámite es requerido (tramite_id).' };
    if (!catalogoKey) return { ok: false, error: 'La clave del catálogo es requerida (catalogo_key).' };

    if (!portalEmail) return { ok: false, error: 'No se pudo determinar la organización.' };

    const tramite = await getTramiteById(tramiteId, portalEmail, supabase);
    if (!tramite) return { ok: false, error: `No se encontró el trámite ${tramiteId}.` };

    // Convertir filtros a Record<string, string> para compatibilidad con fetchCatalogo
    const filtros: Record<string, string> = {};
    if (filtrosInput) {
      for (const [k, v] of Object.entries(filtrosInput)) {
        filtros[k] = String(v ?? '');
      }
    }

    const result = await fetchCatalogo(tramite, catalogoKey, filtros, supabase);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // buscar_en_padron_externo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_en_padron_externo') {
    const tramiteId = toolInput.tramite_id as string | undefined;
    const lookupKey = toolInput.lookup_key as string | undefined;
    const valor = toolInput.valor as string | undefined;

    if (!tramiteId) return { ok: false, error: 'El ID del trámite es requerido (tramite_id).' };
    if (!lookupKey) return { ok: false, error: 'La clave del padrón es requerida (lookup_key).' };
    if (!valor) return { ok: false, error: 'El valor a buscar es requerido (valor).' };

    if (!portalEmail) return { ok: false, error: 'No se pudo determinar la organización.' };

    const tramite = await getTramiteById(tramiteId, portalEmail, supabase);
    if (!tramite) return { ok: false, error: `No se encontró el trámite ${tramiteId}.` };

    const result = await fetchLookup(tramite, lookupKey, valor, supabase);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // enviar_tramite_externo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'enviar_tramite_externo') {
    const tramiteId = toolInput.tramite_id as string | undefined;
    const campos = (toolInput.campos as Record<string, unknown> | undefined) ?? {};

    if (!tramiteId) return { ok: false, error: 'El ID del trámite es requerido (tramite_id).' };

    if (!portalEmail) return { ok: false, error: 'No se pudo determinar la organización.' };

    const tramite = await getTramiteById(tramiteId, portalEmail, supabase);
    if (!tramite) return { ok: false, error: `No se encontró el trámite ${tramiteId}.` };

    const channel = ctx.channel === 'email' ? 'email' : 'chat';
    const result = await submitTramite(tramite, campos, { channel, agentId }, supabase);
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // preparar_brief_del_dia (Nox exclusivo — sin canal voz, solo chat + email)
  // Canal voz ausente de forma INTENCIONAL: Nox/Niva nunca tienen vapi_agent_id
  // según la regla de coordinadores sin voz (NON_VOICE_ROLES en sync.ts).
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'preparar_brief_del_dia') {
    const meerkatId = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
    if (meerkatId !== 'nox') {
      return { ok: false, error: 'Solo Nox puede preparar el brief del día. Consúltalo con Nox usando consultar_agente.' };
    }

    const { collectBriefData } = await import('@/lib/nox/brief-collector');
    const { renderBrief }      = await import('@/lib/nox/brief-renderer');
    const { deliverBrief }     = await import('@/lib/nox/brief-deliverer');

    const tz = (agent.timezone as string | undefined) ?? 'America/Monterrey';

    const { data: orgAgents } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', portalEmail);
    const orgAgentIds = (orgAgents ?? []).map(a => a.id);

    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, owner_name')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const data = await collectBriefData(orgAgentIds, portalEmail, tz, supabase);
    const brief = await renderBrief(data, {
      agentName:    agentName,
      businessName: businessName,
      tz,
      ownerName:    (org?.owner_name as string | null) ?? null,
      kbSnippet:    ((org?.knowledge_base as string | null) ?? '').slice(0, 800) || null,
    });

    const reqChannels = (toolInput.channels as { email?: boolean; whatsapp?: boolean } | undefined) ?? {};
    const status = await deliverBrief(
      brief,
      { id: agentId, agent_name: agentName, business_name: businessName, client_email: (agent.client_email as string | null) ?? null, transfer_whatsapp: (agent.transfer_whatsapp as string | null) ?? null, portal_email: portalEmail, timezone: tz },
      { email: reqChannels.email ?? false, whatsapp: reqChannels.whatsapp ?? false, portal: true },
      'reactive',
      supabase,
    );

    return { ok: true, brief_md: brief.markdown, buckets: brief.buckets, brief_id: status.brief_id, delivery: status };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pilar 2 Creatividad — 4 tools distribuidas por rol
  // ─────────────────────────────────────────────────────────────────────────

  const CREATIVITY_TOOLS = new Set([
    'generar_propuesta_comercial',
    'generar_cotizacion',
    'generar_one_pager',
    'generar_correo_estructurado',
    'generar_pitch_deck',
    'generar_reporte_metricas_excel',
  ]);

  if (CREATIVITY_TOOLS.has(toolName)) {
    const { meerkatCanUse } = await import('@/lib/creativity/meerkat-gates');
    const meerkatId = (agent.features as { meerkat_role_id?: string } | undefined)?.meerkat_role_id;
    const toolKey = toolName as 'generar_propuesta_comercial' | 'generar_cotizacion' | 'generar_one_pager' | 'generar_correo_estructurado' | 'generar_pitch_deck' | 'generar_reporte_metricas_excel';

    if (!meerkatCanUse(meerkatId, toolKey)) {
      return { ok: false, error: `${agentName} no puede usar ${toolName}. Delega a un compañero autorizado usando delegar_tarea.` };
    }

    // Ops charge (ANTES del LLM call)
    const opsCost = toolName === 'generar_propuesta_comercial' ? 5
                  : toolName === 'generar_cotizacion' ? 4
                  : toolName === 'generar_one_pager' ? 3
                  : toolName === 'generar_pitch_deck' ? 6
                  : toolName === 'generar_reporte_metricas_excel' ? 4
                  : 2;
    const opsResult = await consumeAiOp(agentId, opsCost, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsResult.ok) {
      return { ok: false, error: 'Sin operaciones disponibles este mes. Compra más o espera al ciclo siguiente.' };
    }
    // Refund helper — Scope B Agent 2 silent-failure: creativity cobraba 3-6
    // ops antes de buildDeck/buildReport/generateStructuredContent y NO
    // reversaba si fallaba. Owner perdía ops sin recibir PDF.
    const refundCreativity = async (reason: string) => {
      await refundOps(agentId, opsCost, { source: 'tool_execution', label: `Refund ${toolName}: ${reason}` });
    };

    // ── pitch deck ──────────────────────────────────────────────────────────
    if (toolName === 'generar_pitch_deck') {
      const { data: org } = await supabase
        .from('organizations')
        .select('knowledge_base, business_description, brand_website, business_email')
        .eq('portal_email', portalEmail)
        .maybeSingle();
      const servicesKb = (((org?.knowledge_base as string | null) ?? '') + '\n' + ((org?.business_description as string | null) ?? '')).trim() || null;
      const { buildDeck } = await import('@/lib/creativity/deck-builder');
      const result = await buildDeck({
        agentId, agentName, businessName, portalEmail,
        clientName:   (toolInput.client_name as string | null) ?? null,
        clientNeed:   (toolInput.client_need as string | null) ?? null,
        servicesKb,
        extraContext: (toolInput.extra_context as string | null) ?? null,
        contactWebsite: (org?.brand_website as string | null) ?? null,
        contactEmail:   (org?.business_email as string | null) ?? (agent.client_email as string | null) ?? portalEmail,
        contactPhone:   (agent.transfer_whatsapp as string | null) ?? (agent.phone_number as string | null) ?? null,
      }, supabase);
      if (!result.ok) { await refundCreativity(result.error ?? 'buildDeck_failed'); return result; }
      return { ...result, message: `Pitch deck generado: ${result.filename}.\n\nEnlace de descarga (válido 1 hora):\n${result.url}` };
    }

    // ── reporte métricas Excel ───────────────────────────────────────────────
    if (toolName === 'generar_reporte_metricas_excel') {
      const rawWindow = toolInput.window_days as number | string | undefined;
      const windowDays: 7 | 30 = rawWindow === 30 || rawWindow === '30' ? 30 : 7;
      const { buildReport } = await import('@/lib/creativity/report-builder');
      const result = await buildReport(meerkatId as 'noah' | 'nara' | 'nelia', windowDays, { id: agentId, agentName, portalEmail }, supabase);
      if (!result.ok) { await refundCreativity(result.error ?? 'buildReport_failed'); return result; }
      return { ...result, message: `Reporte generado con hojas: ${result.sheets.join(', ')}.\n\nEnlace de descarga (válido 1 hora):\n${result.url}` };
    }

    // Fetch org: KB + descripción + datos de contacto reales (evita que el LLM
    // invente dominios/emails/teléfonos en el CTA de los documentos).
    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, business_description, brand_website, brand_address, business_email')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const servicesKb = (((org?.knowledge_base as string | null) ?? '') + '\n' + ((org?.business_description as string | null) ?? '')).trim();

    // agent.transfer_whatsapp o client_email son los canales de contacto reales del org
    const contactWebsite = (org?.brand_website as string | null) ?? null;
    const contactEmail   = (org?.business_email as string | null) ?? (agent.client_email as string | null) ?? portalEmail;
    const contactPhone   = (agent.transfer_whatsapp as string | null) ?? (agent.phone_number as string | null) ?? null;

    const { generateStructuredContent } = await import('@/lib/creativity/content-generator');
    const kind = toolName === 'generar_propuesta_comercial' ? 'propuesta'
               : toolName === 'generar_cotizacion' ? 'cotizacion'
               : toolName === 'generar_one_pager' ? 'one_pager'
               : 'correo';

    const content = await generateStructuredContent(kind as 'propuesta' | 'cotizacion' | 'one_pager' | 'correo', {
      agentName,
      businessName,
      clientName:     (toolInput.client_name as string | null) ?? null,
      clientNeed:     (toolInput.client_need as string | null) ?? null,
      servicesKb:     servicesKb || null,
      extraContext:   (toolInput.extra_context as string | null) ?? null,
      contactWebsite,
      contactEmail,
      contactPhone,
    });

    if (toolName === 'generar_correo_estructurado') {
      const { draftEmail } = await import('@/lib/creativity/email-drafter');
      const emailResult = await draftEmail(content, { id: agentId, agent_name: agentName }, supabase);
      if (!emailResult.ok) { await refundCreativity(emailResult.error ?? 'draftEmail_failed'); }
      return emailResult;
    } else {
      const { buildDocument } = await import('@/lib/creativity/document-builder');
      const result = await buildDocument(kind as 'propuesta' | 'cotizacion' | 'one_pager', content, { id: agentId, agent_name: agentName, portal_email: portalEmail }, supabase);
      if (!result.ok) { await refundCreativity(result.error ?? 'buildDocument_failed'); return result; }
      // A-F5 fix chaining bug #1: NO expusimos `file_id` (Supabase storage path)
      // en el output para que el modelo no lo pase a enviar_correo pensando que es
      // Drive ID → correo sin adjunto silent. Ver Scope A A3 CRITICAL #1.
      // Modelo debe usar `enviar_documento_oficina({document_id, to, subject, body})`
      // para enviar por email. `document_id` = uuid de ops_documents (renombrado
      // desde el interno para claridad).
      const { file_id: _hiddenStoragePath, ...safeResult } = result;
      void _hiddenStoragePath;
      return {
        ...safeResult,
        document_id: result.document_id,
        message: `Documento generado: ${content.title}.\n\nEnlace de descarga temporal (1 hora): ${result.url}\n\nPARA ENVIAR POR CORREO: invoca enviar_documento_oficina con document_id="${result.document_id}", to, subject, body. NO uses enviar_correo con este archivo (el file_id no funciona para enviar_correo — solo enviar_documento_oficina sabe cómo descargarlo).`,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Google Sheets tools
  // sheets_agregar_fila, sheets_actualizar_fila, sheets_leer, sheets_buscar
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'sheets_agregar_fila') {
    const purpose     = toolInput.purpose           as sheetsService.SheetsMapping['purpose'];
    const customLabel = toolInput.custom_purpose_label as string | undefined;
    const data        = toolInput.data              as Record<string, unknown>;

    let mapping: sheetsService.SheetsMapping | null = null;
    try {
      mapping = await sheetsService.getMapping(portalEmail, purpose, customLabel);
    } catch (err) {
      return { ok: false, reason: 'sheet_no_configurado', purpose, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!mapping) return { ok: false, reason: 'sheet_no_configurado', purpose };

    const res = await sheetsService.appendRow(mapping.id, data);
    return res.ok
      ? { ok: true, row_number: res.data.row_number }
      : { ok: false, reason: res.reason, detail: res.detail };
  }

  if (toolName === 'sheets_actualizar_fila') {
    const purpose     = toolInput.purpose            as sheetsService.SheetsMapping['purpose'];
    const customLabel = toolInput.custom_purpose_label as string | undefined;
    const matchBy     = toolInput.match_by           as string;
    const matchValue  = toolInput.match_value        as string;
    const data        = toolInput.data               as Record<string, unknown>;

    let mapping: sheetsService.SheetsMapping | null = null;
    try {
      mapping = await sheetsService.getMapping(portalEmail, purpose, customLabel);
    } catch (err) {
      return { ok: false, reason: 'sheet_no_configurado', purpose, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!mapping) return { ok: false, reason: 'sheet_no_configurado', purpose };

    const res = await sheetsService.updateRow(mapping.id, matchBy, matchValue, data);
    return res.ok
      ? { ok: true, row_number: res.data.row_number }
      : { ok: false, reason: res.reason, detail: res.detail };
  }

  if (toolName === 'sheets_leer') {
    const purpose     = toolInput.purpose            as sheetsService.SheetsMapping['purpose'];
    const customLabel = toolInput.custom_purpose_label as string | undefined;
    const range       = toolInput.range              as string | undefined;

    let mapping: sheetsService.SheetsMapping | null = null;
    try {
      mapping = await sheetsService.getMapping(portalEmail, purpose, customLabel);
    } catch (err) {
      return { ok: false, reason: 'sheet_no_configurado', purpose, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!mapping) return { ok: false, reason: 'sheet_no_configurado', purpose };

    const res = await sheetsService.readRange(mapping.id, range);
    return res.ok
      ? { ok: true, rows: res.data.rows }
      : { ok: false, reason: res.reason, detail: res.detail };
  }

  if (toolName === 'sheets_buscar') {
    const purpose     = toolInput.purpose            as sheetsService.SheetsMapping['purpose'];
    const customLabel = toolInput.custom_purpose_label as string | undefined;
    const query       = toolInput.query              as string;

    let mapping: sheetsService.SheetsMapping | null = null;
    try {
      mapping = await sheetsService.getMapping(portalEmail, purpose, customLabel);
    } catch (err) {
      return { ok: false, reason: 'sheet_no_configurado', purpose, detail: err instanceof Error ? err.message : String(err) };
    }
    if (!mapping) return { ok: false, reason: 'sheet_no_configurado', purpose };

    const res = await sheetsService.searchInTab(mapping.id, query);
    return res.ok
      ? { ok: true, rows: res.data.rows }
      : { ok: false, reason: res.reason, detail: res.detail };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tags de contactos (Fase E parte 2: canal correo/chat/oficina)
  // Empleado agrega tag a un contacto de outbound_contacts durante o después
  // de una interacción no-voz (chat con owner, procesamiento de correo).
  // Match por sufijo de 10 dígitos; sanitiza tag (lowercase, cap 40 chars,
  // dedup, cap 20 tags totales).
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'agregar_tag_contacto') {
    const telefono = String(toolInput.telefono ?? '').trim();
    const rawTag   = String(toolInput.tag      ?? '').trim();
    const cleanTag = rawTag.toLowerCase().slice(0, 40);
    if (!telefono || !cleanTag) return { ok: false, error: 'Falta teléfono o tag.' };

    const suffix = telefono.replace(/\D+/g, '').slice(-10);
    if (suffix.length < 10) return { ok: false, error: 'Teléfono inválido.' };

    const { data: matches } = await supabase
      .from('outbound_contacts')
      .select('id, telefono, tags')
      .eq('agent_id', agentId);

    const targets = (matches ?? []).filter(r =>
      (r.telefono as string ?? '').replace(/\D+/g, '').endsWith(suffix)
    );

    if (targets.length === 0) {
      return { ok: false, error: `Sin contacto que coincida con ${telefono} en el CRM.` };
    }

    let touched = 0;
    for (const c of targets) {
      const existing = (c.tags as string[] | null) ?? [];
      if (existing.includes(cleanTag)) continue;
      const next = [...existing, cleanTag].slice(0, 20);
      const { error } = await supabase
        .from('outbound_contacts')
        .update({ tags: next })
        .eq('id', c.id as string);
      if (!error) touched++;
    }

    return {
      ok: true,
      touched,
      tag: cleanTag,
      message: touched > 0
        ? `Tag "${cleanTag}" agregado al contacto ${telefono}.`
        : `El contacto ${telefono} ya tenía el tag "${cleanTag}".`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A-F7 Nova despacho de campo
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'asignar_unidad_campo') {
    const args = toolInput as { service_description?: string; location?: string; priority?: string; unidad_nombre?: string; unidad_telefono?: string; eta_minutes?: number; requested_by_name?: string; requested_by_phone?: string; notes?: string };
    if (!args.service_description?.trim()) return { ok: false, error: 'service_description es requerido.' };
    const priority = ['baja','media','alta','critica'].includes(args.priority ?? '') ? args.priority : 'media';
    const status   = args.unidad_nombre?.trim() ? 'asignado' : 'pendiente';
    const { data, error } = await supabase.from('dispatch_assignments').insert({
      agent_id:            agentId,
      portal_email:        portalEmail,
      service_description: args.service_description.trim(),
      location:            args.location?.trim() ?? null,
      priority,
      unidad_nombre:       args.unidad_nombre?.trim() ?? null,
      unidad_telefono:     args.unidad_telefono?.trim() ?? null,
      status,
      requested_by_name:   args.requested_by_name?.trim() ?? null,
      requested_by_phone:  args.requested_by_phone?.trim() ?? null,
      eta_minutes:         typeof args.eta_minutes === 'number' ? args.eta_minutes : null,
      notes:               args.notes?.trim() ?? null,
    }).select('id').single();
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      id: data?.id,
      status,
      message: status === 'asignado'
        ? `Asignación registrada. ${args.unidad_nombre} atenderá ${args.service_description}${args.eta_minutes ? ` (ETA ${args.eta_minutes} min)` : ''}.`
        : `Servicio registrado como pendiente. Falta asignar unidad.`,
    };
  }

  if (toolName === 'consultar_unidades_disponibles') {
    const args = toolInput as { status?: string; limit?: number };
    const filterStatus = ['pendiente','asignado','en_ruta','completado'].includes(args.status ?? '') ? args.status : null;
    let q = supabase
      .from('dispatch_assignments')
      .select('id, service_description, location, priority, unidad_nombre, status, eta_minutes, created_at')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: false })
      .limit(Math.min(args.limit ?? 20, 50));
    if (filterStatus) q = q.eq('status', filterStatus);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: (data ?? []).length, assignments: data ?? [] };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // A-F7 Naia RRHH real
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'registrar_falta' || toolName === 'solicitar_permiso' || toolName === 'verificar_incidencia') {
    const args = toolInput as { employee_name?: string; record_type?: string; start_date?: string; end_date?: string; reason?: string };
    if (!args.employee_name?.trim()) return { ok: false, error: 'employee_name es requerido.' };
    if (!args.start_date?.match(/^\d{4}-\d{2}-\d{2}$/)) return { ok: false, error: 'start_date debe ser YYYY-MM-DD.' };
    const recordType = toolName === 'registrar_falta' ? 'falta'
                     : toolName === 'verificar_incidencia' ? 'incidencia'
                     : (['vacaciones','permiso'].includes(args.record_type ?? '') ? args.record_type! : 'permiso');
    if (recordType === 'permiso' || recordType === 'vacaciones') {
      if (!args.end_date?.match(/^\d{4}-\d{2}-\d{2}$/)) return { ok: false, error: 'end_date debe ser YYYY-MM-DD para permisos/vacaciones.' };
    }
    if (toolName === 'verificar_incidencia' && !args.reason?.trim()) {
      return { ok: false, error: 'reason es requerido para incidencia.' };
    }
    const { data, error } = await supabase.from('hr_records').insert({
      agent_id:       agentId,
      portal_email:   portalEmail,
      employee_name:  args.employee_name.trim(),
      record_type:    recordType,
      start_date:     args.start_date,
      end_date:       args.end_date ?? null,
      reason:         args.reason?.trim() ?? null,
      status:         'registrada',
    }).select('id').single();
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      id: data?.id,
      message: `${recordType[0].toUpperCase()}${recordType.slice(1)} registrada para ${args.employee_name}${args.end_date ? ` del ${args.start_date} al ${args.end_date}` : ` el ${args.start_date}`}. Estado: registrada (pendiente de aprobación).`,
    };
  }

  if (toolName === 'consultar_vacaciones') {
    const args = toolInput as { employee_name?: string; record_type?: string };
    if (!args.employee_name?.trim()) return { ok: false, error: 'employee_name es requerido.' };
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let q = supabase
      .from('hr_records')
      .select('id, record_type, start_date, end_date, reason, status, created_at')
      .eq('portal_email', portalEmail)
      .ilike('employee_name', args.employee_name.trim())
      .gte('start_date', yearAgo)
      .order('start_date', { ascending: false })
      .limit(50);
    if (args.record_type && args.record_type !== 'todos' && ['falta','vacaciones','permiso','incidencia'].includes(args.record_type)) {
      q = q.eq('record_type', args.record_type);
    }
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, count: (data ?? []).length, records: data ?? [] };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // actualizar_disponibilidad_diaria — industry-gated daily availability
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'actualizar_disponibilidad_diaria') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const internalHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.VAPI_SERVER_SECRET) internalHeaders['x-vapi-secret'] = process.env.VAPI_SERVER_SECRET;
    const res = await fetch(
      `${appUrl}/api/voice/tools/actualizar-disponibilidad-diaria?agent_id=${agentId}`,
      {
        method:  'POST',
        headers: internalHeaders,
        body:    JSON.stringify({ ...toolInput, actor: portalEmail }),
      },
    );
    if (!res.ok) return { ok: false, error: 'No se pudo actualizar la disponibilidad.' };
    const data = await res.json() as { result?: string; ok?: boolean; error?: string };
    return { ok: true, message: data.result ?? 'Disponibilidad actualizada.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  return { ok: false, error: `Herramienta desconocida: ${toolName}` };
}
