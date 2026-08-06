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
import { consumeAiOp } from '@/lib/ai/ops-guard';
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
  // create_contract_draft
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'create_contract_draft') {
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
  // send_email
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'send_email') {
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

    return executeSendEmail({
      agentId, businessName,
      to:           toolInput.to           as string,
      subject:      toolInput.subject      as string,
      body:         toolInput.body         as string,
      cc:           toolInput.cc           as string | undefined,
      attFileId:    toolInput.attachment_file_id   as string | undefined,
      attFileName:  toolInput.attachment_file_name as string | undefined,
      attMimeType:  toolInput.attachment_mime_type as string | undefined,
    }, supabase);
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
    const phone  = toolInput.phone_number as string;
    const name   = (toolInput.contact_name as string | null) ?? undefined;
    const motivo = toolInput.message as string;
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
  if (toolName === 'search_files') {
    return executeSearchFiles(agentId, toolInput.query as string, supabase);
  }
  if (toolName === 'read_file') {
    return executeReadFile(agentId, toolInput.file_id as string, toolInput.file_name as string, (toolInput.mime_type as string | undefined) ?? '', supabase);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calendar tools
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'list_calendar_events') {
    return executeListCalendarEvents(agentId, new Date(toolInput.from as string), new Date(toolInput.to as string), supabase);
  }
  if (toolName === 'create_calendar_event') {
    return executeCreateCalendarEvent(agentId, { title: toolInput.title as string, start: toolInput.start as string, end: toolInput.end as string, description: toolInput.description as string | undefined, location: toolInput.location as string | undefined, attendees: toolInput.attendees as string[] | undefined }, supabase);
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
  if (toolName === 'create_civic_report') {
    const { category, description, location_text, caller_name, caller_number } = toolInput as Record<string, string | undefined>;
    const folio = await generateFolio(agentId, supabase);
    const { error } = await supabase.from('civic_reports').insert({ agent_id: agentId, folio, category: category ?? 'otro', description: description ?? null, location_text: location_text ?? null, caller_name: caller_name ?? null, caller_number: caller_number ?? null, status: 'abierto' });
    if (error) return { ok: false, error: 'No se pudo registrar el reporte.' };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const attachUrl = `${appUrl}/r/${folio}/adjuntar`;
    return { ok: true, folio, attach_url: attachUrl, message: `Reporte registrado con folio ${folio}. Si tiene fotos, puede subirlas aquí: ${attachUrl}` };
  }

  if (toolName === 'lookup_civic_report') {
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

  if (toolName === 'update_civic_report') {
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

    // Dedupe: source_id de incidentes no-cerrados ya rastreados por Nash.
    const { data: trackedRows } = await supabase
      .from('platform_incidents')
      .select('source, source_id')
      .not('status', 'in', '(resolved,closed)')
      .not('source_id', 'is', null);
    const trackedSet = new Set<string>(
      (trackedRows ?? [])
        .filter((r): r is { source: string; source_id: string } => typeof r.source_id === 'string')
        .map(r => `${r.source}:${r.source_id}`)
    );

    // 1) Bug reports enviados vía tool `reportar_falla` (log en tool_call_log).
    const { data: bugRaw } = await supabase
      .from('tool_call_log')
      .select('id, agent_id, portal_email, input_json, created_at')
      .eq('tool_name', 'reportar_falla')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(perSource);
    const bug_reports = (bugRaw ?? [])
      .filter(r => !trackedSet.has(`bug_report:${r.id}`))
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

    const totalNew = bug_reports.length + error_logs.length + escalated_stale.length + failed_handoffs.length + failed_tasks.length;

    return {
      ok: true,
      summary: {
        window_days:            days,
        already_tracked_count:  trackedSet.size,
        total_new_signals:      totalNew,
        bug_reports_count:      bug_reports.length,
        error_logs_count:       error_logs.length,
        escalated_stale_count:  escalated_stale.length,
        failed_handoffs_count:  failed_handoffs.length,
        failed_tasks_count:     failed_tasks.length,
      },
      bug_reports,
      error_logs,
      escalated_stale,
      failed_handoffs,
      failed_tasks,
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
  ].includes(toolName)) {
    const features = (agent.features as Record<string, unknown> | null) ?? {};
    if (features.meerkat_role_id !== 'nash') {
      return { ok: false, error: `Solo Nash puede usar ${toolName}.` };
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
      const affectedId = String(toolInput.agent_id ?? '').trim();
      const mensaje    = String(toolInput.mensaje  ?? '').trim();
      const canal      = String(toolInput.canal    ?? 'email');
      if (!affectedId || !mensaje) return { ok: false, error: 'agent_id y mensaje son obligatorios' };
      if (!['email', 'whatsapp'].includes(canal)) return { ok: false, error: `canal inválido: ${canal}` };
      const { data: target } = await supabase
        .from('voice_agents')
        .select('client_email, transfer_whatsapp, business_name, portal_email')
        .eq('id', affectedId)
        .maybeSingle();
      if (!target) return { ok: false, error: `no encontré voice_agent con id ${affectedId}` };
      if (canal === 'whatsapp') {
        const to = target.transfer_whatsapp as string | null;
        if (!to) return { ok: false, error: 'el cliente no tiene transfer_whatsapp configurado, prueba con email' };
        const { sendWhatsApp } = await import('@/lib/whatsapp/send');
        const okWa = await sendWhatsApp(to, `Centinelia — Nash:\n\n${mensaje}`);
        if (!okWa) return { ok: false, error: 'sendWhatsApp devolvió false — revisa TWILIO_*' };
        return { ok: true, delivered_to: to, channel: 'whatsapp', business: target.business_name };
      }
      const to = target.client_email as string | null;
      if (!to) return { ok: false, error: 'el cliente no tiene client_email configurado' };
      await sendEmail({
        to,
        subject: `Centinelia — Actualización de Nash sobre ${target.business_name ?? 'tu cuenta'}`,
        html:    `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6">${mensaje.replace(/\n/g, '<br>')}</p><p style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#6b7280;margin-top:24px">— Nash, meerkat interno de Centinelia</p>`,
      });
      return { ok: true, delivered_to: to, channel: 'email', business: target.business_name };
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
      if (incident.github_issue_url) {
        return { ok: true, github_issue_url: incident.github_issue_url as string, already_sent: true };
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
          subject: `[Nash → Claude Code fallback] ${incident.title}`,
          html:    `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:14px"><strong>Incidente:</strong> ${incident.id}<br><strong>Prioridad:</strong> ${incident.priority}<br><strong>Fuente:</strong> ${incident.source}</p><h3 style="font-family:system-ui,-apple-system,sans-serif;font-size:14px">Prompt para Claude Code:</h3><pre style="background:#f3f4f6;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap">${prompt.replace(/</g, '&lt;')}</pre>`,
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
        await sendEmail({
          to,
          subject: `${flag} Nash escala (${urgencia})`,
          html:    `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6">${razon.replace(/\n/g, '<br>')}</p>${incidentId ? `<p style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#6b7280">Incidente <code>${incidentId}</code></p>` : ''}`,
        });
      }
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
        .select('id, source, source_id, status')
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
      if (!sourceId && source !== 'error_log') {
        return { ok: true, verified: false, new_status: incident.status as string, notes: 'incidente sin source_id no puede auto-verificarse; requiere validación manual' };
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
      else if (source === 'bug_report') {
        notes = 'bug_report no es auto-verificable; requiere validación manual del owner';
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
  // delegate_task
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'delegate_task') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const internalHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.VAPI_SERVER_SECRET) internalHeaders['x-vapi-secret'] = process.env.VAPI_SERVER_SECRET;
    const res    = await fetch(`${appUrl}/api/voice/tools/delegar-tarea?agent_id=${agentId}`, { method: 'POST', headers: internalHeaders, body: JSON.stringify(toolInput) });
    if (!res.ok) return { ok: false, error: 'No se pudo delegar la tarea.' };
    const data = await res.json() as { results?: Array<{ result: string }> };
    return { ok: true, message: data.results?.[0]?.result ?? 'Tarea procesada.' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // consult_agent
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'consult_agent') {
    const cRol  = toolInput.rol      as string;
    const cTask = toolInput.tarea    as string;
    const cCtx  = (toolInput.contexto as string | undefined) ?? '';
    if (!cRol || !cTask) return { ok: false, error: 'Parámetros insuficientes.' };

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
  // Fiscal: solicitar_factura + consultar_factura
  // Sofia recolecta datos de un cliente que pide su CFDI y delega la emisión
  // al equipo humano (Martha en AC). No timbramos desde Centinelia.
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'solicitar_factura') {
    const invoicingEmail = ((agent.features as Record<string, unknown> | undefined)?.invoicing_email as string | undefined)
      ?? (agent.client_email as string | undefined)
      ?? portalEmail;
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
      invoicingEmail,
    });
    if (!res.ok) return { ok: false, error: res.error };
    const totalStr = res.total!.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    return {
      ok:      true,
      request_id: res.request_id,
      message: `Solicitud de factura registrada por ${totalStr}. Le avisé al equipo de facturación (${res.target_email}) que emita la factura al RFC ${toolInput.cliente_rfc}. El cliente la recibirá en su correo (${toolInput.cliente_email}) en las próximas 24 horas hábiles.`,
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
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const { cliente_nombre, descripcion, monto, fecha_vencimiento } = toolInput as { cliente_nombre?: string; descripcion?: string; monto?: number; fecha_vencimiento?: string };
      if (!cliente_nombre?.trim()) return { ok: false, error: 'cliente_nombre es requerido para crear factura.' };
      if (!descripcion?.trim())    return { ok: false, error: 'descripcion es requerida.' };
      if (typeof monto !== 'number' || monto <= 0) return { ok: false, error: 'monto (número > 0) es requerido.' };
      const safe     = cliente_nombre.replace(/'/g, '');
      const custData = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
      const customer = custData?.QueryResponse?.Customer?.[0];
      if (!customer) return { ok: false, error: `Cliente "${cliente_nombre}" no encontrado.` };
      const itemData = await qb.query(`SELECT Id, Name FROM Item WHERE Type = 'Service' MAXRESULTS 1`);
      const item     = itemData?.QueryResponse?.Item?.[0];
      const line     = item ? { DetailType: 'SalesItemLineDetail', Amount: monto, Description: descripcion, SalesItemLineDetail: { ItemRef: { value: item.Id, name: item.Name }, UnitPrice: monto, Qty: 1 } } : { DetailType: 'DescriptionOnlyLine', Amount: monto, Description: descripcion, DescriptionOnlyLineDetail: {} };
      const body: any = { Line: [line], CustomerRef: { value: customer.Id, name: customer.DisplayName } };
      if (fecha_vencimiento) body.DueDate = fecha_vencimiento;
      const res  = await qb.post('/invoice', body);
      const inv  = res?.Invoice;
      const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return { ok: true, factura_id: inv?.Id, numero: inv?.DocNumber, cliente: customer.DisplayName, monto: fmt(monto), descripcion };
    } catch (err) { return { ok: false, error: String(err) }; }
  }

  if (toolName === 'qb_registrar_pago') {
    const opsCheck = await consumeAiOp(agentId, 1, { source: 'tool_execution', label: 'Ejecución de herramienta interna' });
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para registrar el pago.' };
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const { cliente_nombre, monto, factura_numero } = toolInput as { cliente_nombre?: string; monto?: number; factura_numero?: string };
      if (!cliente_nombre?.trim()) return { ok: false, error: 'cliente_nombre es requerido para registrar pago.' };
      if (typeof monto !== 'number' || monto <= 0) return { ok: false, error: 'monto (número > 0) es requerido.' };
      const safe     = cliente_nombre.replace(/'/g, '');
      const custData = await qb.query(`SELECT Id, DisplayName FROM Customer WHERE DisplayName LIKE '%${safe}%' MAXRESULTS 1`);
      const customer = custData?.QueryResponse?.Customer?.[0];
      if (!customer) return { ok: false, error: `Cliente "${cliente_nombre}" no encontrado.` };
      const invFilter = factura_numero ? `AND DocNumber = '${factura_numero}'` : `AND Balance > '0' ORDER BY DueDate ASC`;
      const invData   = await qb.query(`SELECT Id, DocNumber, Balance FROM Invoice WHERE CustomerRef = '${customer.Id}' ${invFilter} MAXRESULTS 1`);
      const invoice   = invData?.QueryResponse?.Invoice?.[0];
      const pay: any  = { TotalAmt: monto, CustomerRef: { value: customer.Id, name: customer.DisplayName }, TxnDate: new Date().toISOString().split('T')[0] };
      if (invoice) pay.Line = [{ Amount: monto, LinkedTxn: [{ TxnId: invoice.Id, TxnType: 'Invoice' }] }];
      const res  = await qb.post('/payment', pay);
      const fmt  = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
      return { ok: true, pago_id: res?.Payment?.Id, cliente: customer.DisplayName, monto: fmt(monto), factura: invoice?.DocNumber ?? null };
    } catch (err) { return { ok: false, error: String(err) }; }
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
    const res = await sendOfficeDocumentByEmail({
      supabase, portalEmail, agentId,
      documentId: args.document_id, to: args.to,
      subject: args.subject, body: args.body,
    });
    return res.ok ? { ok: true, message: res.message ?? 'Correo enviado.' } : { ok: false, error: res.error };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // crear_lead
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'crear_lead') {
    const args = toolInput as Record<string, string | undefined>;
    // source refleja el canal real donde llegó el lead (chat portal, voz, email).
    // Antes hardcodeaba 'chat', escondiendo métricas de leads por canal.
    const { error } = await supabase.from('leads_voice').insert({
      agent_id: agentId, nombre: args.nombre ?? null, negocio: args.negocio ?? null,
      giro: args.giro ?? null, servicio: args.servicio ?? null, presupuesto: args.presupuesto ?? null,
      timeline: args.timeline ?? null, email: args.email ?? null, whatsapp: args.whatsapp ?? null,
      source: ctx.channel ?? 'chat',
    });
    if (error) return { ok: false, error: 'No se pudo registrar el lead.' };
    // Fire-and-forget Sheets sync — never blocks, never propagates.
    void sheetsService.syncLeadToSheets(portalEmail, agentId, args as Record<string, string | undefined>);
    return { ok: true, message: `Lead de ${args.nombre ?? 'nuevo prospecto'} registrado. Visible en Llamadas.` };
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
          ok: false,
          message: 'No puedo confirmar la cita sin fecha_iso (YYYY-MM-DD) y hora (HH:MM 24h). Pregunta al cliente el dia y hora exactos, y vuelve a llamar agendar_cita incluyendo AMBOS campos.',
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

      // Insert principal en appointments_voice
      await supabase.from('appointments_voice').insert({
        agent_id: agentId, nombre: nombre ?? null, telefono: telefono ?? null,
        servicio: servicio ?? null, fecha: fecha ?? null, hora: hora ?? null,
        starts_at: startsAt ? startsAt.toISOString() : null,
        status: 'confirmada',
      });

      // Sync a Google/Outlook Calendar si esta conectado. Fire and log — si falla
      // no revertimos la cita en DB (la cita interna es la fuente de verdad para
      // outbound reminders del cron).
      if (startsAt && endsAt) {
        const title = `Cita ${servicio ? `— ${servicio} ` : ''}${nombre ? `(${nombre})` : ''}`.trim();
        const created = await executeCreateCalendarEvent(agentId, {
          title,
          start: startsAt.toISOString(),
          end:   endsAt.toISOString(),
          description: telefono ? `Tel: ${telefono}` : undefined,
        }, supabase);
        if (!created.ok) {
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
  // ─────────────────────────────────────────────────────────────────────────
  if (toolName === 'buscar_directorio') {
    const q = ((toolInput.tipo_problema as string | undefined) ?? '').toLowerCase();

    const { data: agentRow } = await supabase.from('voice_agents')
      .select('directorio_interno, guardia_schedule, timezone')
      .eq('id', agentId).single();

    const directorio = (agentRow?.directorio_interno ?? []) as DirectorioContacto[];
    const guardia    = ((agentRow?.guardia_schedule as GuardiaSchedule | null)?.areas ?? []) as GuardiaArea[];
    const tz         = (agentRow?.timezone as string | null) ?? 'America/Monterrey';
    const lines: string[] = [];

    if (directorio.length && q) {
      const match = directorio.find(c =>
        c.atiende.toLowerCase().split(/[\s,]+/).some(kw => kw.length > 3 && q.includes(kw)) ||
        c.area.toLowerCase().split(/\s+/).some(kw => q.includes(kw))
      );
      if (match) {
        const ext = match.extension ? ` (ext. ${match.extension})` : '';
        const tel = match.telefono  ? `, ${match.telefono}` : '';
        lines.push(`${match.nombre} atiende ${match.area}${ext}${tel}.`);
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

    // ── pitch deck ──────────────────────────────────────────────────────────
    if (toolName === 'generar_pitch_deck') {
      const { data: org } = await supabase
        .from('organizations')
        .select('knowledge_base, business_description, brand_website, invoicing_email')
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
        contactEmail:   (org?.invoicing_email as string | null) ?? (agent.client_email as string | null) ?? portalEmail,
        contactPhone:   (agent.transfer_whatsapp as string | null) ?? (agent.phone_number as string | null) ?? null,
      }, supabase);
      if (!result.ok) return result;
      return { ...result, message: `Pitch deck generado: ${result.filename}.\n\nEnlace de descarga (válido 1 hora):\n${result.url}` };
    }

    // ── reporte métricas Excel ───────────────────────────────────────────────
    if (toolName === 'generar_reporte_metricas_excel') {
      const rawWindow = toolInput.window_days as number | string | undefined;
      const windowDays: 7 | 30 = rawWindow === 30 || rawWindow === '30' ? 30 : 7;
      const { buildReport } = await import('@/lib/creativity/report-builder');
      const result = await buildReport(meerkatId as 'noah' | 'nara' | 'nelia', windowDays, { id: agentId, agentName, portalEmail }, supabase);
      if (!result.ok) return result;
      return { ...result, message: `Reporte generado con hojas: ${result.sheets.join(', ')}.\n\nEnlace de descarga (válido 1 hora):\n${result.url}` };
    }

    // Fetch org: KB + descripción + datos de contacto reales (evita que el LLM
    // invente dominios/emails/teléfonos en el CTA de los documentos).
    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, business_description, brand_website, brand_address, invoicing_email')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const servicesKb = (((org?.knowledge_base as string | null) ?? '') + '\n' + ((org?.business_description as string | null) ?? '')).trim();

    // agent.transfer_whatsapp o client_email son los canales de contacto reales del org
    const contactWebsite = (org?.brand_website as string | null) ?? null;
    const contactEmail   = (org?.invoicing_email as string | null) ?? (agent.client_email as string | null) ?? portalEmail;
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
      return await draftEmail(content, { id: agentId, agent_name: agentName }, supabase);
    } else {
      const { buildDocument } = await import('@/lib/creativity/document-builder');
      const result = await buildDocument(kind as 'propuesta' | 'cotizacion' | 'one_pager', content, { id: agentId, agent_name: agentName, portal_email: portalEmail }, supabase);
      if (!result.ok) return result;
      return { ...result, message: `Documento generado: ${content.title}.\n\nEnlace de descarga (válido 1 hora):\n${result.url}` };
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
  return { ok: false, error: `Herramienta desconocida: ${toolName}` };
}
