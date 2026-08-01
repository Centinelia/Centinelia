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
import { generateWord } from '@/lib/documents/word';
import { generateSlides, type Slide } from '@/lib/documents/slides';
import { sendEmail, bugReportHtml } from '@/lib/email/send';
import { sendOnboardingWelcome } from '@/lib/ops/onboarding-mailer';
import { randomUUID } from 'crypto';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import {
  enhanceTextContent, enhanceSlidesContent,
  peerReviewText, peerReviewSlides, isCriticalDocument,
} from '@/lib/documents/quality-enhancer';
import { PORTAL_COOKIE } from '@/lib/portal/auth';

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
    return error ? { ok: false, error: error.message } : { ok: true, draft_id: draft!.id, message: `Borrador creado con ID ${draft!.id}. Visible en Oficina → Contratos.` };
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
      const brand        = brandKitFromAgent(agent);
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
      const enhOps = !isDataDriven ? await consumeAiOp(agentId, 1) : { ok: false };
      if (enhOps.ok) {
        content = await enhanceTextContent({ format: 'pdf', templateType, content, userInstruction: uInst, businessName, businessContext: bCtx });
        if (isCriticalDocument('pdf', templateType)) {
          const peer = await fetchPeerAgent(agentId, portalEmail, supabase);
          if (peer) {
            const revOps = await consumeAiOp(agentId, 1);
            if (revOps.ok) {
              const peerKb = [peer.knowledge_base, peer.role_knowledge_base].filter(Boolean).join('\n') as string;
              content = await peerReviewText({ content, format: 'pdf', templateType, userInstruction: uInst, businessName, peerName: (peer.agent_name as string | null) ?? 'Agente', peerKb });
            }
          }
        }
      }

      const featCfg  = ((agent.features as Record<string, unknown>)?.factura_config ?? {}) as Record<string, unknown>;
      const ordenCfg = ((agent.features as Record<string, unknown>)?.orden_config   ?? {}) as Record<string, unknown>;

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

      let pdfEl: React.ReactElement;

      if (templateType === 'proposal') {
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

      const buf = await renderToBuffer(pdfEl as any);
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
      const brand     = brandKitFromAgent(agent);
      const accent    = (brand as any).primaryColor ?? '#6C3BFF';
      const uInst     = ctx.userContext ?? '';
      const bCtx      = [agent.knowledge_base, agent.role_knowledge_base].filter(Boolean).join('\n').slice(0, 1200) as string;
      let buf: Buffer; let ext: string; let mime: string; let label: string;

      if (format === 'excel') {
        const sheets = (toolInput.sheets as ExcelSheet[] | null) ?? [{ name: fileTitle.slice(0, 31), headers: ['Sin datos'], rows: [['El agente no proporcionó datos.']] }];
        buf = generateExcel(sheets); ext = 'xlsx'; mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; label = 'Excel';
      } else if (format === 'word') {
        const tpl = (toolInput.template_type as 'general' | 'proposal' | 'letter' | undefined) ?? 'general';
        let wc    = (toolInput.content as string | null) ?? '';
        const enhOps = await consumeAiOp(agentId, 1);
        if (enhOps.ok) {
          wc = await enhanceTextContent({ format: 'word', templateType: tpl, content: wc, userInstruction: uInst, businessName, businessContext: bCtx });
          if (isCriticalDocument('word', tpl)) {
            const peer = await fetchPeerAgent(agentId, portalEmail, supabase);
            if (peer) { const revOps = await consumeAiOp(agentId, 1); if (revOps.ok) { const pk = [peer.knowledge_base, peer.role_knowledge_base].filter(Boolean).join('\n') as string; wc = await peerReviewText({ content: wc, format: 'word', templateType: tpl, userInstruction: uInst, businessName, peerName: (peer.agent_name as string | null) ?? 'Agente', peerKb: pk }); } }
          }
        }
        buf = await generateWord({ title: fileTitle, content: wc, templateType: tpl, businessName, accentColor: accent, clientName: toolInput.client_name as string | undefined, clientEmail: toolInput.client_email as string | undefined, totalPrice: toolInput.total_price as string | undefined, validityDays: toolInput.validity_days as number | undefined, recipientName: toolInput.recipient_name as string | undefined, recipientEmail: toolInput.recipient_email as string | undefined });
        ext = 'docx'; mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; label = 'Word';
      } else {
        let slides = (toolInput.slides as Slide[] | null) ?? [{ title: 'Contenido', content: 'El agente no proporcionó diapositivas.' }];
        const enhOps = await consumeAiOp(agentId, 1);
        if (enhOps.ok) {
          slides = await enhanceSlidesContent({ slides, userInstruction: uInst, businessName, businessContext: bCtx });
          const peer = await fetchPeerAgent(agentId, portalEmail, supabase);
          if (peer) { const revOps = await consumeAiOp(agentId, 1); if (revOps.ok) { const pk = [peer.knowledge_base, peer.role_knowledge_base].filter(Boolean).join('\n') as string; slides = await peerReviewSlides({ slides, userInstruction: uInst, businessName, peerName: (peer.agent_name as string | null) ?? 'Agente', peerKb: pk }); } }
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
    return error ? { ok: false, error: 'No se pudo registrar el reporte.' } : { ok: true, folio, message: `Reporte registrado con folio ${folio}.` };
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
    return { ok: true, message: 'Reporte enviado al equipo de Centinelia.' };
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
        const resp = await anth.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, system: [{ type: 'text', text: sysParts.filter(Boolean).join('\n'), cache_control: { type: 'ephemeral' } }], tools: INNER, messages: msgs });
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
    const opsCheck = await consumeAiOp(agentId, 1);
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para crear la factura.' };
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const { cliente_nombre, descripcion, monto, fecha_vencimiento } = toolInput as { cliente_nombre: string; descripcion: string; monto: number; fecha_vencimiento?: string };
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
    const opsCheck = await consumeAiOp(agentId, 1);
    if (!opsCheck.ok) return { ok: false, error: 'Sin tareas disponibles para registrar el pago.' };
    const qb = await getQBClient(portalEmail, supabase);
    if (!qb) return { ok: false, error: 'QuickBooks no está conectado.' };
    try {
      const { cliente_nombre, monto, factura_numero } = toolInput as { cliente_nombre: string; monto: number; factura_numero?: string };
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
    return error
      ? { ok: false, error: 'No se pudo registrar el lead.' }
      : { ok: true, message: `Lead de ${args.nombre ?? 'nuevo prospecto'} registrado. Visible en Llamadas.` };
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
      if (accion === 'modificar' && telefono) {
        await supabase.from('appointments_voice').update({ status: 'cancelada' })
          .eq('agent_id', agentId).eq('telefono', telefono).eq('status', 'confirmada');
      }

      // Conflict check solo si tenemos starts_at parseado.
      if (startsAt && endsAt) {
        // 1) DB interna: mismo starts_at exacto = colision definitiva.
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

    const { error } = await supabase.from('onboarding_instances').insert({
      agent_id:       agentId,
      template_id:    (tpl as any).id,
      contact_name:   contactName,
      contact_email:  contactEmail,
      submit_token:   submitToken,
      status:         'pendiente',
      submitted_docs: [],
    });

    if (error) return { ok: false, error: error.message };

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
  return { ok: false, error: `Herramienta desconocida: ${toolName}` };
}
