/**
 * Navi — 14 handlers estándar + 2 herramientas exclusivas de variante Agencia.
 *
 * Estructura:
 *   - NAVI_STANDARD_TOOLS: Set con los 14 nombres de herramienta (variante PyME).
 *   - NAVI_AGENCIA_TOOLS: Set con 2 herramientas exclusivas de variante Agencia.
 *   - runNaviTool: delegador principal llamado desde executor.ts.
 *   - Helpers internos: resolveSocialAccount, resolveCanvaClient.
 *   - 14 handlers estándar + 2 handlers de agencia.
 *
 * Reglas de seguridad aplicadas (R43, R46, R47, R49):
 *   - role='navi': auto-resuelve la única cuenta social del agente.
 *   - role='navi_agencia': exige target_account_id explícito.
 *   - Siempre verifica ownership: social_account.portal_email === input.portal_email.
 *   - CanvaProvider construido por agente desde integration_accounts.
 *   - MetaPublisher construido por social_account con page access_token.
 *
 * Consumo de ops (R44, R57):
 *   canva_listar_plantillas=0, canva_generar_diseno=2, canva_exportar=1,
 *   generar_caption=1, generar_hashtags=1, crear_borrador_post=2,
 *   programar_publicacion=1, publicar_ahora=1, ig_responder_comentario=1,
 *   ig_responder_dm=1, consultar_metricas_post=0, proponer_calendario_editorial=5,
 *   listar_media_del_cliente=0, usar_media_del_cliente=1,
 *   listar_cuentas_gestionadas=0, replicar_contenido_entre_cuentas=3.
 *
 * logLlmCall (R45, R54): source, model, usage, agentId, portalEmail — en cada llamada Anthropic.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { CanvaProvider } from '@/lib/social/canva';
import { MetaPublisher } from '@/lib/social/publishers/meta';
import type { SocialAccount } from '@/lib/social/types';
import { logLlmCall } from '@/lib/observability/llm-log';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { classifySentiment } from '@/lib/social/sentiment';
import Anthropic from '@anthropic-ai/sdk';

type SupabaseClient = ReturnType<typeof createAdminClient>;

// ─── Conjunto de herramientas estándar Navi (variante PyME) ──────────────────

export const NAVI_STANDARD_TOOLS = new Set<string>([
  'canva_listar_plantillas',
  'canva_generar_diseno',
  'canva_exportar',
  'generar_caption',
  'generar_hashtags',
  'crear_borrador_post',
  'programar_publicacion',
  'publicar_ahora',
  'ig_responder_comentario',
  'ig_responder_dm',
  'consultar_metricas_post',
  'proponer_calendario_editorial',
  'listar_media_del_cliente',
  'usar_media_del_cliente',
]);

// ─── Herramientas exclusivas de variante Agencia (R53) ───────────────────────

export const NAVI_AGENCIA_TOOLS = new Set<string>([
  'listar_cuentas_gestionadas',
  'replicar_contenido_entre_cuentas',
]);

// Ops consumidas por herramienta (R44, R57)
const OPS_POR_HERRAMIENTA: Record<string, number> = {
  canva_listar_plantillas:         0,
  canva_generar_diseno:            2,
  canva_exportar:                  1,
  generar_caption:                 1,
  generar_hashtags:                1,
  crear_borrador_post:             2,
  programar_publicacion:           1,
  publicar_ahora:                  1,
  ig_responder_comentario:         1,
  ig_responder_dm:                 1,
  consultar_metricas_post:         0,
  proponer_calendario_editorial:   5,
  listar_media_del_cliente:        0,
  usar_media_del_cliente:          1,
  listar_cuentas_gestionadas:      0,
  replicar_contenido_entre_cuentas: 3,
};

// Modelos Anthropic usados en esta capa
const HAIKU = 'claude-haiku-4-5-20251001';

// ─── Clase de error de herramienta Navi ──────────────────────────────────────

export class NaviToolError extends Error {
  code: string;
  constructor(code: string, message: string) {
    // Incluir el código en el mensaje para que los tests puedan usar .toThrow('CODE')
    super(`${code}: ${message}`);
    this.name = 'NaviToolError';
    this.code = code;
  }
}

// ─── Contexto de llamada al delegador ────────────────────────────────────────

export interface NaviToolCtx {
  agentId:     string;
  portalEmail: string;
  supabase?:   SupabaseClient;
}

// ─── Delegador principal ──────────────────────────────────────────────────────

/**
 * Delegador llamado desde executeAgentToolInner en executor.ts.
 * Valida que la herramienta pertenezca al dominio Navi, la ejecuta,
 * y consume las ops correspondientes al completarse con éxito.
 */
export async function runNaviTool(
  toolName:  string,
  input:     Record<string, unknown>,
  ctx:       NaviToolCtx,
): Promise<unknown> {
  const isStandard = NAVI_STANDARD_TOOLS.has(toolName);
  const isAgencia  = NAVI_AGENCIA_TOOLS.has(toolName);

  if (!isStandard && !isAgencia) {
    throw new NaviToolError(
      'UNKNOWN_NAVI_TOOL',
      `Herramienta '${toolName}' no reconocida en el módulo Navi.`,
    );
  }

  const sb = ctx.supabase ?? createAdminClient();

  // Despachar herramientas de agencia (R53, R59)
  if (isAgencia) {
    const result = await dispatchNaviAgenciaTool(toolName, input, ctx, sb);
    const ops = OPS_POR_HERRAMIENTA[toolName] ?? 0;
    if (ops > 0) {
      await consumeAiOp(ctx.agentId, ops, {
        source: `navi_tool:${toolName}`,
        label:  `Navi Agencia — ${toolName}`,
      });
    }
    return result;
  }

  const result = await dispatchNaviTool(toolName, input, ctx.agentId, ctx.portalEmail, sb);

  // Consumir ops al finalizar exitosamente
  const ops = OPS_POR_HERRAMIENTA[toolName] ?? 0;
  if (ops > 0) {
    await consumeAiOp(ctx.agentId, ops, {
      source: `navi_tool:${toolName}`,
      label:  `Navi — ${toolName}`,
    });
  }

  return result;
}

// ─── Router interno por nombre de herramienta ─────────────────────────────────

async function dispatchNaviTool(
  toolName:    string,
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  switch (toolName) {
    case 'canva_listar_plantillas':       return handleCanvaListarPlantillas(input, agentId, portalEmail, sb);
    case 'canva_generar_diseno':          return handleCanvaGenerarDiseno(input, agentId, portalEmail, sb);
    case 'canva_exportar':                return handleCanvaExportar(input, agentId, portalEmail, sb);
    case 'generar_caption':               return handleGenerarCaption(input, agentId, portalEmail, sb);
    case 'generar_hashtags':              return handleGenerarHashtags(input, agentId, portalEmail, sb);
    case 'crear_borrador_post':           return handleCrearBorradorPost(input, agentId, portalEmail, sb);
    case 'programar_publicacion':         return handleProgramarPublicacion(input, agentId, portalEmail, sb);
    case 'publicar_ahora':                return handlePublicarAhora(input, agentId, portalEmail, sb);
    case 'ig_responder_comentario':       return handleIgResponderComentario(input, agentId, portalEmail, sb);
    case 'ig_responder_dm':               return handleIgResponderDm(input, agentId, portalEmail, sb);
    case 'consultar_metricas_post':       return handleConsultarMetricasPost(input, agentId, portalEmail, sb);
    case 'proponer_calendario_editorial': return handleProponerCalendarioEditorial(input, agentId, portalEmail, sb);
    case 'listar_media_del_cliente':      return handleListarMediaDelCliente(input, agentId, portalEmail, sb);
    case 'usar_media_del_cliente':        return handleUsarMediaDelCliente(input, agentId, portalEmail, sb);
    default:
      throw new NaviToolError('UNKNOWN_NAVI_TOOL', `Herramienta '${toolName}' no tiene handler.`);
  }
}

// ─── Router interno para herramientas de variante Agencia ─────────────────────

async function dispatchNaviAgenciaTool(
  toolName:    string,
  input:       Record<string, unknown>,
  ctx:         NaviToolCtx,
  sb:          SupabaseClient,
): Promise<unknown> {
  switch (toolName) {
    case 'listar_cuentas_gestionadas':
      return handleListarCuentasGestionadas(input, ctx, sb);
    case 'replicar_contenido_entre_cuentas':
      return handleReplicarContenidoEntreCuentas(input, ctx, sb);
    default:
      throw new NaviToolError('UNKNOWN_NAVI_TOOL', `Herramienta de agencia '${toolName}' no tiene handler.`);
  }
}

// ─── Handler: listar_cuentas_gestionadas (R56, R57) ──────────────────────────

async function handleListarCuentasGestionadas(
  input: Record<string, unknown>,
  ctx:   NaviToolCtx,
  sb:    SupabaseClient,
): Promise<unknown> {
  const agentId     = (input.agent_id as string | undefined) ?? ctx.agentId;
  const portalEmail = (input.portal_email as string | undefined) ?? ctx.portalEmail;

  const { data: accounts } = await sb
    .from('social_accounts')
    .select('id, external_username, page_id, status, paused, brand_summary, agent_id')
    .eq('portal_email', portalEmail)
    .eq('agent_id', agentId);

  const rows = (accounts ?? []) as Array<Record<string, unknown>>;

  // Enriquecer con próxima publicación por cuenta
  const enriched = await Promise.all(rows.map(async (acc) => {
    const { data: next } = await sb
      .from('content_drafts')
      .select('scheduled_for, caption')
      .eq('social_account_id', acc.id as string)
      .in('status', ['scheduled', 'approved'])
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    return { ...acc, next_publication: next ?? null };
  }));

  return {
    ok:       true,
    accounts: enriched,
    message:  `Encontré ${enriched.length} cuentas gestionadas`,
  };
}

// ─── Handler: replicar_contenido_entre_cuentas (R56) ─────────────────────────

async function handleReplicarContenidoEntreCuentas(
  input: Record<string, unknown>,
  ctx:   NaviToolCtx,
  sb:    SupabaseClient,
): Promise<unknown> {
  const portalEmail      = (input.portal_email as string | undefined) ?? ctx.portalEmail;
  const agentId          = (input.agent_id as string | undefined) ?? ctx.agentId;
  const sourceMediaId    = input.source_media_id as string;
  const targetAccountIds = input.target_account_ids as string[] | undefined;

  // Guard: target_account_ids debe ser array no vacío (R56)
  if (!Array.isArray(targetAccountIds) || targetAccountIds.length === 0) {
    throw new NaviToolError('INVALID_TARGETS', 'target_account_ids debe ser un arreglo no vacío de UUIDs.');
  }

  // Verificar ownership del source (R56 §1)
  const { data: sourceDraft } = await sb
    .from('content_drafts')
    .select('*')
    .eq('published_media_id', sourceMediaId)
    .single();

  if (
    !sourceDraft ||
    (sourceDraft as Record<string, unknown>).portal_email !== portalEmail ||
    (sourceDraft as Record<string, unknown>).agent_id !== agentId
  ) {
    throw new NaviToolError(
      'SOURCE_NOT_FOUND',
      'No encontré publicación con ese media_id que pertenezca a tu Navi.',
    );
  }

  const src = sourceDraft as Record<string, unknown>;
  const client = new Anthropic();
  const drafts: unknown[] = [];

  // Por cada target (R56 §2-4)
  for (const targetId of targetAccountIds) {
    // Verificar ownership del target
    const { data: targetAcc } = await sb
      .from('social_accounts')
      .select('*')
      .eq('id', targetId)
      .single();

    const acc = targetAcc as Record<string, unknown> | null;

    if (!acc || acc.portal_email !== portalEmail || acc.agent_id !== agentId) {
      throw new NaviToolError(
        'ACCOUNT_NOT_MANAGED',
        `ACCOUNT_NOT_MANAGED: ${targetId}`,
      );
    }

    // Adaptar caption al brand voice del target (R56 §3)
    const t0 = Date.now();
    const response = await client.messages.create({
      model:      HAIKU,
      max_tokens: 400,
      system:     `Adaptas captions manteniendo la idea pero cambiando el tono para la voz de marca: ${(acc.brand_summary as string | null) ?? '(voz genérica profesional)'}`,
      messages:   [{
        role:    'user',
        content: (src.caption as string) ?? '',
      }],
    });

    void logLlmCall({
      source:      'replicar_contenido_entre_cuentas',
      model:       HAIKU,
      usage:       response.usage,
      agentId:     ctx.agentId,
      portalEmail: ctx.portalEmail,
      latencyMs:   Date.now() - t0,
      meta:        { target_account_id: targetId, source_media_id: sourceMediaId },
    });

    const adaptedCaption = response.content[0]?.type === 'text'
      ? response.content[0].text
      : (src.caption as string) ?? '';

    // Insertar borrador para el target (R56 §4)
    const { data: draft } = await sb
      .from('content_drafts')
      .insert({
        portal_email:      portalEmail,
        agent_id:          agentId,
        social_account_id: targetId,
        media_urls:        (src.media_urls as string[]) ?? [],
        caption:           adaptedCaption,
        hashtags:          (src.hashtags as string[]) ?? [],
        media_type:        (src.media_type as string) ?? 'image',
        status:            'pending_approval',
        auto_publish:      false,
        navi_reasoning:    `Replicado de post ${sourceMediaId}`,
      })
      .select()
      .single();

    drafts.push(draft);
  }

  // consumeAiOp una sola vez con count=3 fijo (R56 §5, R57) — llamado desde runNaviTool post-dispatch

  return {
    ok:      true,
    drafts,
    message: `Creé ${drafts.length} borradores para revisión`,
  };
}

// ─── Helper: enforcement de target_account_id para navi_agencia (R55) ────────
//
// Usado por handlers que no trabajan con cuentas sociales directamente
// (canva_generar_diseno, proponer_calendario_editorial, programar_publicacion,
// publicar_ahora, consultar_metricas_post) para lanzar MISSING_TARGET_ACCOUNT
// cuando el agente es navi_agencia pero no provee target_account_id.

async function requireTargetForAgencia(
  sb:             SupabaseClient,
  agentId:        string,
  targetAccountId: string | undefined,
): Promise<void> {
  if (targetAccountId) return; // Si se provee, no hay nada que verificar aquí

  const { data: agentRow } = await sb
    .from('voice_agents')
    .select('role')
    .eq('id', agentId)
    .single();

  const role = (agentRow?.role as string | null) ?? '';
  if (role === 'navi_agencia') {
    throw new NaviToolError(
      'MISSING_TARGET_ACCOUNT',
      'Para la variante Agencia es obligatorio especificar target_account_id.',
    );
  }
}

// ─── Helper: resolver cuenta social con ownership y modo dual ─────────────────

interface ResolveSocialAccountOpts {
  targetAccountId?: string;
  requireTarget?:   boolean; // true → agencia exige el campo
}

async function resolveSocialAccount(
  sb:          SupabaseClient,
  agentId:     string,
  portalEmail: string,
  opts:        ResolveSocialAccountOpts = {},
): Promise<SocialAccount> {
  // Obtener role del agente para determinar modo
  const { data: agentRow } = await sb
    .from('voice_agents')
    .select('role')
    .eq('id', agentId)
    .single();

  const role = (agentRow?.role as string | null) ?? '';
  let accountId = opts.targetAccountId;

  if (!accountId) {
    if (role === 'navi_agencia' && opts.requireTarget) {
      throw new NaviToolError(
        'MISSING_TARGET_ACCOUNT',
        'Para la variante Agencia es obligatorio especificar target_account_id.',
      );
    }
    // role='navi' sin target → auto-resolver la única cuenta del agente
    const { data: acc } = await sb
      .from('social_accounts')
      .select('id')
      .eq('agent_id', agentId)
      .eq('provider', 'meta_instagram')
      .single();
    accountId = acc?.id as string | undefined;
  }

  if (!accountId) {
    throw new NaviToolError(
      'NO_SOCIAL_ACCOUNT',
      'No se encontró ninguna cuenta de Instagram conectada para este agente.',
    );
  }

  // Obtener fila completa y validar ownership (R43)
  const { data: socialAccount } = await sb
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (
    !socialAccount ||
    socialAccount.portal_email !== portalEmail ||
    socialAccount.agent_id !== agentId
  ) {
    throw new NaviToolError(
      'ACCOUNT_NOT_MANAGED',
      'La cuenta solicitada no pertenece a este agente o portal.',
    );
  }

  return socialAccount as unknown as SocialAccount;
}

// ─── Helper: construir CanvaProvider por agente (R46) ────────────────────────

async function resolveCanvaClient(
  sb:          SupabaseClient,
  agentId:     string,
  portalEmail: string,
): Promise<CanvaProvider> {
  const { data: ia } = await sb
    .from('integration_accounts')
    .select('access_token')
    .eq('portal_email', portalEmail)
    .eq('agent_id', agentId)
    .eq('provider', 'canva')
    .eq('capability', 'design')
    .single();

  if (!ia?.access_token) {
    throw new NaviToolError(
      'CANVA_NOT_CONNECTED',
      'Canva no está conectado para este agente. Vincúlalo desde el portal.',
    );
  }

  return new CanvaProvider(ia.access_token as string);
}

// ─── Helper: construir MetaPublisher por social_account (R47) ────────────────

function buildMetaPublisher(acc: SocialAccount): MetaPublisher {
  return new MetaPublisher(acc);
}

// ─── Helper: defense-in-depth kill switch por cuenta (R91, R92, R95) ─────────
//
// Lanza ACCOUNT_PAUSED si social_accounts.paused === true.
// Llamado en todos los handlers de acción que causan side-effect real en IG:
// crearBorradorPost, programarPublicacion, publicarAhora,
// igResponderComentario, igResponderDm.
//
// El cron publish-scheduled-posts YA skipea cuentas pausadas (R62/R95).
// Esta capa es defense-in-depth para llamadas directas de handler.

function assertNotPaused(acc: SocialAccount): void {
  if (acc.paused === true) {
    const handle = acc.external_username ?? acc.id;
    throw new NaviToolError(
      'ACCOUNT_PAUSED',
      `La cuenta ${handle} está pausada. Reactívala primero en el portal.`,
    );
  }
}

// ─── Handler: canva_listar_plantillas ────────────────────────────────────────

async function handleCanvaListarPlantillas(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const canva     = await resolveCanvaClient(sb, agentId, portalEmail);
  const categoria = (input.category as string | undefined) as 'post' | 'reel' | 'story' | 'carousel' | undefined;
  const templates = await canva.listBrandTemplates(categoria);
  return { ok: true, templates, total: templates.length };
}

// ─── Handler: canva_generar_diseno ────────────────────────────────────────────

async function handleCanvaGenerarDiseno(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  // Enforcement de target_account_id para navi_agencia (R55)
  await requireTargetForAgencia(sb, agentId, input.target_account_id as string | undefined);

  const canva      = await resolveCanvaClient(sb, agentId, portalEmail);
  const templateId = input.template_id as string;
  const dataFields = (input.data_fields as Record<string, unknown>) ?? {};

  if (!templateId) {
    throw new NaviToolError('MISSING_TEMPLATE_ID', 'Se requiere template_id para generar un diseño.');
  }

  const { designId, previewUrl } = await canva.autofillTemplate(templateId, dataFields);
  return { ok: true, design_id: designId, preview_url: previewUrl };
}

// ─── Handler: canva_exportar ──────────────────────────────────────────────────

async function handleCanvaExportar(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const canva    = await resolveCanvaClient(sb, agentId, portalEmail);
  const designId = input.design_id as string;
  const format   = (input.format as string | undefined) ?? 'jpg';

  if (!designId) {
    throw new NaviToolError('MISSING_DESIGN_ID', 'Se requiere design_id para exportar.');
  }

  const allowed = ['png', 'jpg', 'mp4', 'pdf'];
  if (!allowed.includes(format)) {
    throw new NaviToolError('INVALID_FORMAT', `Formato '${format}' no válido. Usa: ${allowed.join(', ')}.`);
  }

  const result = await canva.exportDesign(designId, format as 'png' | 'jpg' | 'mp4' | 'pdf');
  return { ok: true, url: result.url, expires_at: result.expiresAt.toISOString() };
}

// ─── Handler: generar_caption ─────────────────────────────────────────────────

async function handleGenerarCaption(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  _sb:         SupabaseClient,
): Promise<unknown> {
  const contexto   = (input.context as string | undefined) ?? '';
  const mediaType  = (input.media_type as string | undefined) ?? 'image';
  const brandVoice = (input.brand_voice as string | undefined) ?? '';

  const client = new Anthropic();
  const t0 = Date.now();

  const resp = await client.messages.create({
    model:      HAIKU,
    max_tokens: 400,
    system:     `Eres Navi, asistente de redes sociales. Genera captions creativos para Instagram${brandVoice ? ` con la siguiente voz de marca: ${brandVoice}` : ''}. Sé conciso, auténtico y relevante.`,
    messages:   [{ role: 'user', content: `Genera un caption para un ${mediaType} de Instagram. Contexto: ${contexto || '(sin contexto adicional)'}. Máximo 120 palabras.` }],
  });

  void logLlmCall({
    source:      'navi_generar_caption',
    model:       HAIKU,
    usage:       resp.usage,
    agentId,
    portalEmail,
    latencyMs:   Date.now() - t0,
  });

  const caption = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
  return { ok: true, caption };
}

// ─── Handler: generar_hashtags ────────────────────────────────────────────────

async function handleGenerarHashtags(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  _sb:         SupabaseClient,
): Promise<unknown> {
  const topic   = (input.topic as string | undefined) ?? '';
  const count   = Math.min(Number(input.count ?? 10), 30);
  const nicho   = (input.niche as string | undefined) ?? '';

  const client = new Anthropic();
  const t0 = Date.now();

  const resp = await client.messages.create({
    model:      HAIKU,
    max_tokens: 300,
    system:     'Eres un experto en estrategia de hashtags para Instagram en México. Genera hashtags relevantes, sin repetir, en español e inglés según el nicho.',
    messages:   [{
      role:    'user',
      content: `Genera exactamente ${count} hashtags para Instagram sobre: "${topic}"${nicho ? ` en el nicho de ${nicho}` : ''}. Devuelve solo los hashtags separados por espacios, empezando cada uno con #.`,
    }],
  });

  void logLlmCall({
    source:      'navi_generar_hashtags',
    model:       HAIKU,
    usage:       resp.usage,
    agentId,
    portalEmail,
    latencyMs:   Date.now() - t0,
  });

  const raw      = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
  const hashtags = raw.match(/#[\wÀ-ſ]+/g) ?? [];
  return { ok: true, hashtags };
}

// ─── Handler: crear_borrador_post ─────────────────────────────────────────────

async function handleCrearBorradorPost(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const targetAccountId = input.target_account_id as string | undefined;
  const slotId          = input.slot_id as string | undefined;
  const mediaType       = (input.media_type as string | undefined) ?? 'image';
  const mediaUrls       = (input.media_urls as string[] | undefined) ?? [];
  const hashtags        = (input.hashtags as string[] | undefined) ?? [];
  const scheduledFor    = input.scheduled_for as string | undefined;
  const templateId      = input.template_id as string | undefined;
  let   caption         = input.caption as string | undefined;

  // Resolver cuenta social con IDOR check (R43)
  const acc = await resolveSocialAccount(sb, agentId, portalEmail, {
    targetAccountId,
    requireTarget: true,
  });

  // Kill switch: no crear borrador si la cuenta está pausada (R91, R92)
  assertNotPaused(acc);

  // Verificar slot si se proporcionó
  // Ownership se verifica a través del editorial_calendar padre (que sí tiene portal_email).
  // editorial_calendar_slots no tiene portal_email ni agent_id por diseño de esquema.
  let autoPublish = false;
  if (slotId) {
    const { data: slot } = await sb
      .from('editorial_calendar_slots')
      .select('auto_publish, calendar_id')
      .eq('id', slotId)
      .single();

    if (!slot) {
      throw new NaviToolError('SLOT_NOT_OWNED', 'El slot del calendario no existe.');
    }

    // Verificar ownership a través del calendario padre
    const { data: calendar } = await sb
      .from('editorial_calendars')
      .select('portal_email')
      .eq('id', slot.calendar_id)
      .single();

    if (!calendar || calendar.portal_email !== portalEmail) {
      throw new NaviToolError('SLOT_NOT_OWNED', 'El slot del calendario no pertenece a este portal.');
    }

    autoPublish = !!slot.auto_publish;
  }

  const status = autoPublish ? 'approved' : 'pending_approval';

  // Generar caption si no viene (usa brand_summary de la cuenta)
  if (!caption) {
    const client = new Anthropic();
    const t0 = Date.now();
    const resp = await client.messages.create({
      model:      HAIKU,
      max_tokens: 400,
      system:     `Eres Navi, asistente de redes sociales para Instagram. Genera captions auténticos${acc.brand_summary ? ` con esta voz de marca: ${acc.brand_summary}` : ''}. Sin hashtags (se agregan aparte).`,
      messages:   [{
        role:    'user',
        content: `Genera un caption para un ${mediaType} de Instagram. Máximo 100 palabras.${mediaUrls.length > 0 ? ` Contexto visual: hay ${mediaUrls.length} imagen(es)/video(s).` : ''}`,
      }],
    });
    void logLlmCall({
      source:      'navi_crear_borrador_caption',
      model:       HAIKU,
      usage:       resp.usage,
      agentId,
      portalEmail,
      latencyMs:   Date.now() - t0,
    });
    caption = resp.content[0]?.type === 'text' ? resp.content[0].text : '';
  }

  const { data: draft, error } = await sb
    .from('content_drafts')
    .insert({
      portal_email:      portalEmail,
      agent_id:          agentId,
      social_account_id: acc.id,
      template_id:       templateId ?? null,
      slot_id:           slotId ?? null,
      media_urls:        mediaUrls,
      caption,
      hashtags,
      media_type:        mediaType,
      scheduled_for:     scheduledFor ?? null,
      status,
      auto_publish:      autoPublish,
    })
    .select()
    .single();

  if (error) {
    throw new NaviToolError('DB_ERROR', `Error al crear borrador: ${error.message}`);
  }

  return { ok: true, draft, message: `Borrador creado en estado ${status}.` };
}

// ─── Handler: programar_publicacion ──────────────────────────────────────────

async function handleProgramarPublicacion(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  // Enforcement de target_account_id para navi_agencia (R55)
  await requireTargetForAgencia(sb, agentId, input.target_account_id as string | undefined);

  const draftId     = input.draft_id as string;
  const scheduledFor = input.scheduled_for as string;

  if (!draftId)      throw new NaviToolError('MISSING_DRAFT_ID', 'Se requiere draft_id.');
  if (!scheduledFor) throw new NaviToolError('MISSING_SCHEDULED_FOR', 'Se requiere scheduled_for (ISO 8601).');

  // Obtener borrador y verificar ownership + estado
  const { data: draft } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .single();

  if (!draft || draft.portal_email !== portalEmail || draft.agent_id !== agentId) {
    throw new NaviToolError('DRAFT_NOT_OWNED', 'El borrador no pertenece a este agente.');
  }

  const allowedStatuses = ['approved', 'scheduled'];
  if (!allowedStatuses.includes(draft.status as string)) {
    throw new NaviToolError(
      'INVALID_STATUS',
      `No se puede programar un borrador en estado '${draft.status}'. Debe estar en estado 'approved' o 'scheduled'.`,
    );
  }

  // Kill switch: resolver cuenta social y verificar que no esté pausada (R91, R92)
  const accForPausedCheck = await resolveSocialAccount(sb, agentId, portalEmail, {
    targetAccountId: draft.social_account_id as string,
    requireTarget:   false,
  });
  assertNotPaused(accForPausedCheck);

  const { data: updated, error } = await sb
    .from('content_drafts')
    .update({ status: 'scheduled', scheduled_for: scheduledFor })
    .eq('id', draftId)
    .select()
    .single();

  if (error) throw new NaviToolError('DB_ERROR', `Error al programar: ${error.message}`);

  return { ok: true, draft: updated, message: `Publicación programada para ${scheduledFor}.` };
}

// ─── Handler: publicar_ahora ──────────────────────────────────────────────────

async function handlePublicarAhora(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  // Enforcement de target_account_id para navi_agencia (R55)
  await requireTargetForAgencia(sb, agentId, input.target_account_id as string | undefined);

  const draftId = input.draft_id as string;
  if (!draftId) throw new NaviToolError('MISSING_DRAFT_ID', 'Se requiere draft_id.');

  // Obtener borrador y verificar ownership + estado
  const { data: draft } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .single();

  if (!draft || draft.portal_email !== portalEmail || draft.agent_id !== agentId) {
    throw new NaviToolError('DRAFT_NOT_OWNED', 'El borrador no pertenece a este agente.');
  }

  const allowedStatuses = ['approved', 'scheduled'];
  if (!allowedStatuses.includes(draft.status as string)) {
    throw new NaviToolError(
      'INVALID_STATUS',
      `No se puede publicar un borrador en estado '${draft.status}'. Debe estar en estado 'approved' o 'scheduled'.`,
    );
  }

  // Resolver cuenta social
  const acc = await resolveSocialAccount(sb, agentId, portalEmail, {
    targetAccountId: draft.social_account_id as string,
    requireTarget: false,
  });

  // Kill switch: no publicar si la cuenta está pausada (R91, R92)
  assertNotPaused(acc);

  // Marcar como publicando
  await sb
    .from('content_drafts')
    .update({ status: 'publishing' })
    .eq('id', draftId);

  const publisher = buildMetaPublisher(acc);

  try {
    // Crear contenedor en Meta
    const { containerId } = await publisher.createMediaContainer({
      mediaType: (draft.media_type as 'image' | 'carousel' | 'reel' | 'story'),
      mediaUrls: (draft.media_urls as string[]) ?? [],
      caption:   (draft.caption as string | undefined) ?? undefined,
    });

    // Esperar a que esté listo
    const ready = await publisher.waitForContainerReady(containerId);
    if (ready !== 'ready') {
      throw new Error('El contenedor de Meta no quedó listo a tiempo.');
    }

    // Publicar
    const { mediaId, permalink } = await publisher.publishContainer(containerId);

    // Actualizar borrador como publicado
    const { data: published } = await sb
      .from('content_drafts')
      .update({
        status:             'published',
        published_at:       new Date().toISOString(),
        published_media_id: mediaId,
        published_permalink: permalink,
      })
      .eq('id', draftId)
      .select()
      .single();

    return { ok: true, draft: published, media_id: mediaId, permalink, message: 'Publicación exitosa en Instagram.' };

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Marcar como fallido
    await sb
      .from('content_drafts')
      .update({ status: 'failed', error_message: errMsg })
      .eq('id', draftId);

    throw new NaviToolError('PUBLISH_FAILED', `Error al publicar en Instagram: ${errMsg}`);
  }
}

// ─── Handler: ig_responder_comentario ────────────────────────────────────────

async function handleIgResponderComentario(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const commentId       = input.comment_id as string;
  const message         = input.message as string;
  const targetAccountId = input.target_account_id as string | undefined;

  if (!commentId) throw new NaviToolError('MISSING_COMMENT_ID', 'Se requiere comment_id.');
  if (!message)   throw new NaviToolError('MISSING_MESSAGE', 'Se requiere message.');

  // Validar sentimiento antes de responder (safety gate)
  const sentiment = await classifySentiment(message, { agentId, portalEmail });
  if (sentiment === 'crisis' || sentiment === 'negative') {
    return {
      ok:        false,
      escalate:  true,
      sentiment,
      message:   'El mensaje requiere revisión humana antes de enviarse. Escala al responsable de comunidad.',
    };
  }

  // Resolver cuenta social para verificar ownership
  const acc = await resolveSocialAccount(sb, agentId, portalEmail, {
    targetAccountId,
    requireTarget: true,
  });

  // Kill switch: no responder si la cuenta está pausada (R91, R92)
  assertNotPaused(acc);

  const publisher = buildMetaPublisher(acc);
  await publisher.replyToComment(commentId, message);

  return { ok: true, comment_id: commentId, message: 'Respuesta al comentario enviada exitosamente.' };
}

// ─── Handler: ig_responder_dm ─────────────────────────────────────────────────

async function handleIgResponderDm(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const threadId        = input.thread_id as string;
  const message         = input.message as string;
  const targetAccountId = input.target_account_id as string | undefined;

  if (!threadId) throw new NaviToolError('MISSING_THREAD_ID', 'Se requiere thread_id.');
  if (!message)  throw new NaviToolError('MISSING_MESSAGE', 'Se requiere message.');

  // Validar sentimiento antes de responder (safety gate)
  const sentiment = await classifySentiment(message, { agentId, portalEmail });
  if (sentiment === 'crisis' || sentiment === 'negative') {
    return {
      ok:        false,
      escalate:  true,
      sentiment,
      message:   'El mensaje requiere revisión humana antes de enviarse. Escala al responsable de comunidad.',
    };
  }

  // Resolver cuenta social para verificar ownership
  const acc = await resolveSocialAccount(sb, agentId, portalEmail, {
    targetAccountId,
    requireTarget: true,
  });

  // Kill switch: no responder si la cuenta está pausada (R91, R92)
  assertNotPaused(acc);

  const publisher = buildMetaPublisher(acc);
  await publisher.replyToDm(threadId, message);

  return { ok: true, thread_id: threadId, message: 'Respuesta al DM enviada exitosamente.' };
}

// ─── Handler: consultar_metricas_post ────────────────────────────────────────

async function handleConsultarMetricasPost(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const contentDraftId  = input.content_draft_id as string;
  const targetAccountId = input.target_account_id as string | undefined;

  // Enforcement de target_account_id para navi_agencia (R55)
  await requireTargetForAgencia(sb, agentId, targetAccountId);

  if (!contentDraftId) throw new NaviToolError('MISSING_DRAFT_ID', 'Se requiere content_draft_id.');

  // Verificar ownership del draft
  const { data: draft } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', contentDraftId)
    .single();

  if (!draft || draft.portal_email !== portalEmail || draft.agent_id !== agentId) {
    throw new NaviToolError('DRAFT_NOT_OWNED', 'El borrador no pertenece a este agente.');
  }

  if (draft.status !== 'published') {
    throw new NaviToolError('NOT_PUBLISHED', 'Solo se pueden consultar métricas de publicaciones ya publicadas.');
  }

  // Buscar snapshot reciente en social_metrics (< 24h)
  const STALE_MS = 24 * 60 * 60 * 1000;
  const { data: snapshot } = await sb
    .from('social_metrics')
    .select('*')
    .eq('content_draft_id', contentDraftId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const isStale = !snapshot ||
    (Date.now() - new Date(snapshot.created_at as string).getTime() > STALE_MS);

  if (!isStale && snapshot) {
    return { ok: true, metrics: snapshot, source: 'cache' };
  }

  // Refrescar desde Meta si el snapshot es inexistente o añejo
  const acc = await resolveSocialAccount(sb, agentId, portalEmail, {
    targetAccountId: targetAccountId ?? (draft.social_account_id as string),
    requireTarget: false,
  });

  const publisher = buildMetaPublisher(acc);
  const mediaId   = draft.published_media_id as string;

  if (!mediaId) {
    throw new NaviToolError('NO_MEDIA_ID', 'El borrador publicado no tiene published_media_id.');
  }

  const fresh = await publisher.fetchMetrics(mediaId);

  // Persistir snapshot
  // Nota: social_metrics no tiene agent_id ni portal_email; snapshot_type es requerido.
  await sb.from('social_metrics').insert({
    content_draft_id: contentDraftId,
    snapshot_type:    '24h' as const,
    impressions:      fresh.impressions ?? 0,
    reach:            fresh.reach ?? 0,
    likes:            fresh.likes ?? 0,
    comments:         fresh.comments ?? 0,
    shares:           fresh.shares ?? 0,
    saves:            fresh.saves ?? 0,
    plays:            fresh.plays ?? 0,
    raw_response:     fresh.rawResponse ?? null,
  });

  return { ok: true, metrics: fresh, source: 'live' };
}

// ─── Handler: proponer_calendario_editorial ───────────────────────────────────

async function handleProponerCalendarioEditorial(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  // Enforcement de target_account_id para navi_agencia (R55)
  await requireTargetForAgencia(sb, agentId, input.target_account_id as string | undefined);

  const month       = (input.month as string | undefined) ?? new Date().toISOString().slice(0, 7);
  const postsPerWeek = Number(input.posts_per_week ?? 3);
  const themes      = (input.themes as string[] | undefined) ?? [];
  const brandVoice  = (input.brand_voice as string | undefined) ?? '';

  const client = new Anthropic();
  const t0 = Date.now();

  const resp = await client.messages.create({
    model:      HAIKU,
    max_tokens: 1000,
    system:     `Eres Navi, estratega de contenido para Instagram en México. Propones calendarios editoriales concretos y creativos${brandVoice ? ` alineados con esta voz de marca: ${brandVoice}` : ''}. Responde en JSON con la estructura: { "slots": [{ "date": "YYYY-MM-DD", "media_type": "image|reel|story|carousel", "theme": "...", "caption_idea": "...", "hashtag_suggestions": ["..."] }] }`,
    messages:   [{
      role:    'user',
      content: `Propón un calendario editorial para ${month} con ${postsPerWeek} publicaciones por semana${themes.length > 0 ? `. Temas principales: ${themes.join(', ')}` : ''}. Responde ÚNICAMENTE con el JSON válido.`,
    }],
  });

  void logLlmCall({
    source:      'navi_calendario_editorial',
    model:       HAIKU,
    usage:       resp.usage,
    agentId,
    portalEmail,
    latencyMs:   Date.now() - t0,
  });

  const raw     = resp.content[0]?.type === 'text' ? resp.content[0].text : '{}';
  let   proposal: unknown;
  try {
    proposal = JSON.parse(raw);
  } catch {
    proposal = { raw };
  }

  return {
    ok:       true,
    month,
    proposal,
    message:  'Propuesta de calendario editorial generada. Revísala en el portal y aprueba los slots que quieras.',
  };
}

// ─── Handler: listar_media_del_cliente ────────────────────────────────────────

async function handleListarMediaDelCliente(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const limit = Math.min(Number(input.limit ?? 20), 50);

  const { data: media, error } = await sb
    .from('user_media_uploads')
    .select('*')
    .eq('portal_email', portalEmail)
    .eq('agent_id', agentId)
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new NaviToolError('DB_ERROR', `Error al listar media: ${error.message}`);

  return { ok: true, media: media ?? [], total: (media ?? []).length };
}

// ─── Handler: usar_media_del_cliente (R49) ────────────────────────────────────

async function handleUsarMediaDelCliente(
  input:       Record<string, unknown>,
  agentId:     string,
  portalEmail: string,
  sb:          SupabaseClient,
): Promise<unknown> {
  const draftId = input.draft_id as string;
  const mediaId = input.media_id as string;

  if (!draftId) throw new NaviToolError('MISSING_DRAFT_ID', 'Se requiere draft_id.');
  if (!mediaId) throw new NaviToolError('MISSING_MEDIA_ID', 'Se requiere media_id.');

  // Verificar ownership del borrador
  const { data: draft } = await sb
    .from('content_drafts')
    .select('*')
    .eq('id', draftId)
    .single();

  if (!draft || draft.portal_email !== portalEmail || draft.agent_id !== agentId) {
    throw new NaviToolError('OWNERSHIP_ERROR', 'El borrador no pertenece a este agente o portal.');
  }

  // Verificar ownership del media
  const { data: media } = await sb
    .from('user_media_uploads')
    .select('*')
    .eq('id', mediaId)
    .single();

  if (!media || media.portal_email !== portalEmail || media.agent_id !== agentId) {
    throw new NaviToolError('OWNERSHIP_ERROR', 'El archivo de media no pertenece a este agente o portal.');
  }

  // Agregar file_url al array media_urls del draft
  const currentUrls = (draft.media_urls as string[]) ?? [];
  const fileUrl     = media.file_url as string;
  const updatedUrls = [...currentUrls, fileUrl];

  const { data: updatedDraft, error: draftErr } = await sb
    .from('content_drafts')
    .update({ media_urls: updatedUrls })
    .eq('id', draftId)
    .select()
    .single();

  if (draftErr) throw new NaviToolError('DB_ERROR', `Error al actualizar borrador: ${draftErr.message}`);

  // Marcar media como usada
  await sb
    .from('user_media_uploads')
    .update({ status: 'used', used_in_draft_id: draftId })
    .eq('id', mediaId);

  return {
    ok:      true,
    draft:   updatedDraft,
    message: `Archivo de media vinculado al borrador. Total de archivos: ${updatedUrls.length}.`,
  };
}
