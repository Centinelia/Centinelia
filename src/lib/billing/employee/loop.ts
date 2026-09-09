/**
 * loop.ts -- Loop de razonamiento del empleado digital de facturacion.
 *
 * BillingEmployee.runOnEmail(emailId) es el punto de entrada principal:
 *   1. Lee el email de billing_incoming_emails.
 *   2. Verifica frescura del adaptador (si > 6h, escala de inmediato).
 *   3. Construye el contexto dinamico para el system prompt.
 *   4. Ejecuta el loop LLM con tools hasta que el modelo deje de invocar tools
 *      o se alcance MAX_ITERATIONS.
 *   5. Retorna RunResult con contadores de ventas, escalaciones, consultas y errores.
 *
 * Adaptador: por ahora se recibe como parametro de construccion. La Fase 2
 * conectara el adaptador real de CONTPAQi via la integration config de Supabase.
 *
 * Modelo: claude-sonnet-4-6 por default (configurable via BILLING_LOOP_MODEL).
 * max_tokens: 4096. MAX_ITERATIONS: 20.
 *
 * Fase 2 -- conectar adaptador real:
 *   En BillingEmployee.forIntegration(integrationId) se leera la config de
 *   organization_integrations, se instanciara el adaptador correcto (CONTPAQiAdapter
 *   u otro) y se construira el BillingEmployee con el contexto completo.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildSystemPrompt } from './system-prompt';
import { buildEmployeeTools, toAnthropicTools } from './tools';
import type { BillingAdapter } from '../adapter';
import type { OrgCtx } from '../matching/client';
import { chargePool } from '../pool-charge';
import { logLlmCall } from '@/lib/observability/llm-log';

// ---------------------------------------------------------------------------
// Tipos publicos
// ---------------------------------------------------------------------------

export interface RunResult {
  processed: number;
  escalated: number;
  consulted: number;
  errors: string[];
}

export interface BillingEmployeeConfig {
  /** Portal email de la organizacion (identidad unica en el sistema). */
  portalEmail: string;
  /** ID de la integration en organization_integrations. */
  integrationId: string;
  /** Token de acceso a Dropbox de la organizacion. */
  dropboxToken: string;
  /** Ruta base en Dropbox donde se guardan los excels. Ej: /Facturacion/2026. */
  dropboxBasePath: string;
  /** Email al que se envian las escalaciones urgentes. */
  escalationEmail: string;
  /** Nombre de la organizacion (para el system prompt). */
  orgName?: string;
  /**
   * ID del voice_agent que representa a Nala en esta organización. Cuando
   * se pasa, cada iteración del LLM loop cobra 1 op batched al pool del
   * cliente con source='nala_billing_loop'. Sin agentId, el loop corre
   * pero NO cobra (degradación graceful — útil para tests + rollout
   * gradual controlado por kill switch en pool-charge).
   */
  agentId?: string;
  /**
   * SMTP per-agent (features.smtp_config). Cuando se pasa, los tools de
   * outbound (enviar_correo, reply_email, escalate) envían via este SMTP
   * en vez de Resend. Necesario para clientes sin dominio verificado en
   * Resend (Beatriz, GAC, AC Proyectos). Dry run FASE 4 (2026-09-07).
   */
  smtp?: import('../mail/send').AgentSmtpOverride;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 20;
/** Umbral en minutos para escalacion inmediata por frescura del adaptador. */
const FRESHNESS_ESCALATE_THRESHOLD_MIN = 360; // 6 horas

// ---------------------------------------------------------------------------
// BillingEmployee
// ---------------------------------------------------------------------------

export class BillingEmployee {
  private readonly ctx: OrgCtx;

  constructor(
    private readonly adapter: BillingAdapter,
    private readonly config: BillingEmployeeConfig,
  ) {
    this.ctx = {
      portalEmail: config.portalEmail,
      integrationId: config.integrationId,
    };
  }

  /**
   * Procesa un correo entrante de facturacion de principio a fin.
   *
   * @param emailId - ID del registro en billing_incoming_emails.
   * @returns RunResult con contadores de la sesion.
   */
  async runOnEmail(emailId: string): Promise<RunResult> {
    const supabase = createAdminClient();
    const result: RunResult = { processed: 0, escalated: 0, consulted: 0, errors: [] };

    // -------------------------------------------------------------------------
    // 1. Leer el email de la base de datos
    // -------------------------------------------------------------------------
    const { data: emailRow, error: emailError } = await supabase
      .from('billing_incoming_emails')
      .select('id, from_address, subject, body_text, attachments_meta, attachment_count, received_at')
      .eq('id', emailId)
      .maybeSingle();

    if (emailError) {
      result.errors.push(`DB lookup failed for emailId=${emailId}: ${emailError.message}`);
      return result;
    }

    if (!emailRow) {
      result.errors.push(`No billing_incoming_emails row found for emailId=${emailId}`);
      return result;
    }

    // -------------------------------------------------------------------------
    // 1b. Fast-path para Excel (Tortillería piloto)
    // -------------------------------------------------------------------------
    // Si el correo trae adjuntos .xlsx/.xls y el agente tiene mapping guardado
    // de tortillería, se procesan con el pipeline determinístico (sin LLM):
    // parser + mapping + reglas → billing_pending_review. Skip del loop LLM
    // porque el output del parser es 100% determinístico contra el formato
    // que Beatriz envía cada lunes.
    try {
      const metasFast = Array.isArray(emailRow.attachments_meta)
        ? emailRow.attachments_meta as Array<{ storageKey?: string; filename?: string; contentType?: string; index?: number }>
        : [];
      const excelMetas = metasFast.filter((m) => {
        const ct = (m.contentType ?? '').toLowerCase();
        const fn = (m.filename ?? '').toLowerCase();
        return ct.includes('spreadsheetml') || ct.includes('ms-excel') || fn.endsWith('.xlsx') || fn.endsWith('.xls');
      });
      if (excelMetas.length > 0 && this.config.agentId) {
        const { getTortilleriaMapping } = await import('../tortilleria/mapping-store');
        const mapping = await getTortilleriaMapping(this.config.agentId, supabase);
        if (mapping) {
          const { loadBillingAttachments } = await import('../storage/attachments');
          const withKeys = excelMetas
            .filter((m): m is { storageKey: string; filename: string; contentType?: string; index?: number } => !!m.storageKey && !!m.filename);
          const loaded = await loadBillingAttachments(withKeys.map((m, i) => ({
            storageKey:  m.storageKey,
            index:       m.index ?? i,
            filename:    m.filename,
            contentType: m.contentType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          })));

          // Config fiscal desde organization_integrations.
          const { data: integRow } = await supabase
            .from('organization_integrations')
            .select('config')
            .eq('portal_email', this.config.portalEmail)
            .eq('type', 'contpaqi')
            .maybeSingle<{ config: Record<string, unknown> }>();
          const fiscal = (integRow?.config?.['fiscal'] as Record<string, string> | undefined) ?? {};

          const { runExcelFlow } = await import('../tortilleria/excel-flow');
          const excelResult = await runExcelFlow({
            portalEmail: this.config.portalEmail,
            emailId,
            agentId:     this.config.agentId,
            attachments: loaded.map((l, i) => ({
              filename:    l.filename,
              contentType: l.contentType,
              buffer:      l.buffer,
              index:       i,
            })),
            config: {
              rfcEmisor:          fiscal['rfc_emisor'] ?? '',
              serieDefault:       fiscal['serie_default'] ?? 'T',
              usoCFDIDefault:     fiscal['uso_cfdi_default'] ?? 'G03',
              claveSATDefault:    fiscal['clave_sat_default_producto'] ?? '50161509',
              regimenFiscal:      fiscal['regimen_fiscal'] ?? '601',
              codigoPostalEmisor: fiscal['codigo_postal_emisor'] ?? '',
            },
            supabase,
          });

          if (excelResult.processed) {
            result.processed = excelResult.invoiceCount;
            result.escalated = excelResult.cardCount;
            for (const e of excelResult.errors) result.errors.push(`excel: ${e.tituloBloque}: ${e.reason}`);
            return result;
          }
        }
      }
    } catch (excelFlowErr) {
      const msg = excelFlowErr instanceof Error ? excelFlowErr.message : String(excelFlowErr);
      result.errors.push(`Excel fast-path fallo: ${msg}. Continuando con flow LLM.`);
      // Continuamos al flow normal (LLM vision) como fallback.
    }

    // -------------------------------------------------------------------------
    // 2. Verificar frescura del adaptador
    // -------------------------------------------------------------------------
    let freshnessSummary = 'estado desconocido';
    try {
      const health = await this.adapter.freshness();
      freshnessSummary = health.lastSyncAt
        ? `ultima sincronizacion hace ${health.minutesStale} min`
        : 'nunca sincronizado';

      if (health.minutesStale >= FRESHNESS_ESCALATE_THRESHOLD_MIN) {
        // Escalar antes de procesar: adaptador con datos muy viejos.
        result.errors.push(
          `Freshness critica: ${health.minutesStale} min sin sincronizar. Escalando antes de procesar.`,
        );
        result.escalated++;
        // No continuar con el loop -- retornar para que el handler de queue
        // pueda marcar el job como fallido y el cron lo reintente cuando el
        // adaptador este fresco.
        return result;
      }
    } catch (freshnessErr) {
      const msg = freshnessErr instanceof Error ? freshnessErr.message : String(freshnessErr);
      result.errors.push(`freshness() failed: ${msg}`);
      // No bloquear -- el loop puede continuar y el LLM invocara freshness_check
      // si lo necesita.
    }

    // -------------------------------------------------------------------------
    // 3. Obtener reglas y aliases para el system prompt
    // -------------------------------------------------------------------------
    let reglasJson = '[]';
    let aliasesJson = '[]';

    try {
      const { data: reglas, error: reglasError } = await supabase
        .from('billing_client_rules')
        .select('rfc, frequency, default_payment_method, aliases')
        .eq('integration_id', this.ctx.integrationId)
        .limit(20);
      if (reglasError) {
        console.warn('[billing.loop] failed to load billing_client_rules:', reglasError.message);
        result.errors.push(`billing_client_rules load failed: ${reglasError.message}`);
      } else if (reglas) {
        reglasJson = JSON.stringify(reglas);
      }
    } catch (reglasErr) {
      const msg = reglasErr instanceof Error ? reglasErr.message : String(reglasErr);
      console.warn('[billing.loop] unexpected error loading billing_client_rules:', msg);
    }

    try {
      const { data: aliases, error: aliasesError } = await supabase
        .from('billing_product_aliases')
        .select('adapter_sku, alias_text')
        .eq('integration_id', this.ctx.integrationId)
        .limit(30);
      if (aliasesError) {
        console.warn('[billing.loop] failed to load billing_product_aliases:', aliasesError.message);
      } else if (aliases) {
        aliasesJson = JSON.stringify(aliases);
      }
    } catch (aliasesErr) {
      const msg = aliasesErr instanceof Error ? aliasesErr.message : String(aliasesErr);
      console.warn('[billing.loop] unexpected error loading billing_product_aliases:', msg);
    }

    // -------------------------------------------------------------------------
    // 4. Construir system prompt y tools
    // -------------------------------------------------------------------------
    const systemPrompt = buildSystemPrompt({
      emailId,
      orgName: this.config.orgName ?? this.config.portalEmail,
      adapterName: this.adapter.name,
      freshnessSummary,
      reglasJson,
      aliasesJson,
    });

    const tools = buildEmployeeTools({
      adapter: this.adapter,
      ctx: this.ctx,
      emailId,
      dropboxToken: this.config.dropboxToken,
      dropboxBasePath: this.config.dropboxBasePath,
      escalationEmail: this.config.escalationEmail,
      ...(this.config.agentId ? { agentId: this.config.agentId } : {}),
      ...(this.config.smtp    ? { smtp:    this.config.smtp    } : {}),
    });

    const anthropicTools = toAnthropicTools(tools);

    // -------------------------------------------------------------------------
    // 5. Mensaje inicial al LLM con el contexto del correo
    // -------------------------------------------------------------------------
    const emailContext = [
      `De: ${emailRow.from_address}`,
      `Asunto: ${emailRow.subject ?? '(sin asunto)'}`,
      `Recibido: ${emailRow.received_at ?? new Date().toISOString()}`,
      '',
      'Cuerpo:',
      emailRow.body_text ?? '(sin texto)',
    ].join('\n');

    // attachments_meta is populated by the migration + inbox route update (Plan A fix C3).
    // Fall back to attachment_count for graceful operation before migration is applied.
    const attachmentsMeta = emailRow.attachments_meta;
    const attachmentCount = emailRow.attachment_count ?? 0;
    const attachmentsNote =
      Array.isArray(attachmentsMeta) && attachmentsMeta.length > 0
        ? `\n\nAdjuntos detectados: ${JSON.stringify(attachmentsMeta)}`
        : attachmentCount > 0
          ? `\n\nAdjuntos detectados: ${attachmentCount} archivo(s). Usa extract_note_from_image para procesar las imagenes del payload original.`
          : '\n\nSin adjuntos detectados.';

    const userMessage =
      `Procesa el correo de facturacion (id: ${emailId}).\n\n${emailContext}${attachmentsNote}\n\n` +
      `Aplica el procedimiento estandar para cada notita de venta que encuentres.`;

    // -------------------------------------------------------------------------
    // 5b. Cargar bytes de imagen desde Storage y normalizarlos
    // -------------------------------------------------------------------------
    // Los tools extract_note_from_image / extract_remisiones_from_image esperan
    // image_base64 pero el LLM no puede pasarlo si no ve la imagen. Solución:
    // cargar los buffers desde Storage (subidos por el cron IMAP), normalizar
    // a JPEG 1568×1568, y (a) inyectarlos como multimodal blocks para que
    // Claude los vea; (b) exponerlos al handler de tools vía imageBank para
    // que la tool los recupere por index sin depender del LLM. Dry run FASE 4.
    const imageBank: Array<{ index: number; filename: string; mimeType: 'image/jpeg'; buffer: Buffer; base64: string }> = [];
    const initialContent: Anthropic.ContentBlockParam[] = [{ type: 'text', text: userMessage }];
    try {
      const metasRaw = Array.isArray(emailRow.attachments_meta) ? emailRow.attachments_meta : [];
      const withKeys = metasRaw
        .map((m, i) => (m as { storageKey?: string; index?: number; filename?: string; contentType?: string }))
        .filter((m): m is { storageKey: string; index?: number; filename?: string; contentType?: string } => !!m?.storageKey)
        .map((m, i) => ({
          storageKey:  m.storageKey,
          index:       m.index ?? i,
          filename:    m.filename ?? `attachment-${i}`,
          contentType: m.contentType ?? 'application/octet-stream',
        }));
      if (withKeys.length > 0) {
        const { loadBillingAttachments } = await import('../storage/attachments');
        const { normalizeImageForVision } = await import('../vision/image-normalize');
        const loaded = await loadBillingAttachments(withKeys);
        for (let i = 0; i < loaded.length; i++) {
          const raw = loaded[i];
          if (!/^image\//i.test(raw.contentType)) continue;
          try {
            const norm = await normalizeImageForVision({ buffer: raw.buffer, mimeType: raw.contentType });
            const b64 = norm.buffer.toString('base64');
            imageBank.push({ index: i, filename: raw.filename, mimeType: 'image/jpeg', buffer: norm.buffer, base64: b64 });
            initialContent.push({
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
            });
            initialContent.push({ type: 'text', text: `(Adjunto ${i}: ${raw.filename})` });
          } catch (normErr) {
            const msg = normErr instanceof Error ? normErr.message : String(normErr);
            initialContent.push({ type: 'text', text: `(Adjunto ${i}: ${raw.filename} — no se pudo normalizar: ${msg})` });
          }
        }
      }
    } catch (loadErr) {
      const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
      result.errors.push(`Warn: no se pudieron cargar bytes de adjuntos: ${msg}`);
    }
    // Expone el bank al context de tools para que extract_*_from_image lo consulte por index.
    (this.ctx as unknown as { imageBank?: typeof imageBank }).imageBank = imageBank;

    // -------------------------------------------------------------------------
    // 6. Loop LLM
    // -------------------------------------------------------------------------
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.BILLING_LOOP_MODEL ?? DEFAULT_MODEL;

    type MessageParam = { role: 'user' | 'assistant'; content: Anthropic.MessageParam['content'] };
    const messages: MessageParam[] = [
      { role: 'user', content: initialContent },
    ];

    let iterationsExecuted = 0;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response: Anthropic.Message;
      const __t = Date.now();
      try {
        response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: anthropicTools,
          messages: messages as Anthropic.MessageParam[],
        });
        iterationsExecuted++;
        void logLlmCall({
          source:      'billing_employee_loop',
          model,
          usage:       response.usage,
          agentId:     this.config.agentId ?? null,
          portalEmail: this.config.portalEmail ?? null,
          latencyMs:   Date.now() - __t,
          meta:        { emailId, iteration },
        });
      } catch (llmErr) {
        void logLlmCall({
          source:      'billing_employee_loop',
          model,
          usage:       { input_tokens: 0, output_tokens: 0 },
          agentId:     this.config.agentId ?? null,
          portalEmail: this.config.portalEmail ?? null,
          latencyMs:   Date.now() - __t,
          error:       llmErr instanceof Error ? llmErr.message : String(llmErr),
          meta:        { emailId, iteration },
        });
        const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
        result.errors.push(`LLM call failed at iteration ${iteration}: ${msg}`);
        break;
      }

      // Agregar respuesta del asistente al historial.
      messages.push({ role: 'assistant', content: response.content });

      // Si el modelo no invoco tools o decidio parar, terminar el loop.
      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      // Auditoría 2026-09-04 ronda 2: manejar stop_reasons no-happy.
      // max_tokens: si viene con tool_uses pendientes, ejecutarlos y salir del
      //   loop — la siguiente iteración con tool_results órfanos causa API 400.
      // refusal/pause_turn: salir del loop y registrar como error.
      // stop_sequence: raro pero tratable como end_turn.
      const isTerminalStop = response.stop_reason === 'end_turn'
        || response.stop_reason === 'stop_sequence';
      const isAbnormalStop = response.stop_reason === 'refusal'
        || response.stop_reason === 'pause_turn'
        || response.stop_reason === 'max_tokens';

      if (toolUses.length === 0 || isTerminalStop) {
        break;
      }
      if (isAbnormalStop) {
        result.errors.push(`llm_stop_reason: ${response.stop_reason}`);
      }

      // -----------------------------------------------------------------------
      // Despachar tool calls
      // -----------------------------------------------------------------------
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const use of toolUses) {
        const tool = tools.find((t) => t.name === use.name);

        if (!tool) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: `Error: herramienta desconocida "${use.name}"`,
            is_error: true,
          });
          result.errors.push(`unknown_tool: ${use.name}`);
          continue;
        }

        try {
          // Timeout global por tool: 60s. Sin esto un adapter congelado
          // (CONTPAQi Windows agent muerto, Dropbox 30s hang, SF SOAP timeout)
          // dejaba el job en `status='running'` sin `finished_at` hasta que
          // el cron externo lo matara. Auditoría 2026-09-04 ronda 2.
          const output = await Promise.race([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tool.handler(use.input as any),
            new Promise((_r, reject) =>
              setTimeout(() => reject(new Error(`tool ${use.name} timeout 60s`)), 60_000),
            ),
          ]);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(output),
          });

          // Actualizar contadores segun la tool invocada.
          if (use.name === 'append_daily_sale' || use.name === 'append_pending_client_sale') {
            result.processed++;
          } else if (use.name === 'escalate') {
            result.escalated++;
          } else if (use.name === 'reply_email') {
            result.consulted++;
          }
        } catch (toolErr) {
          const msg = toolErr instanceof Error ? toolErr.message : String(toolErr);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: `Error al ejecutar ${use.name}: ${msg}`,
            is_error: true,
          });
          result.errors.push(`${use.name}: ${msg}`);
        }
      }

      // Agregar resultados de tools al historial.
      messages.push({ role: 'user', content: toolResults });
    }

    // Cobrar al pool las iteraciones que realmente ejecutamos (batched-consume).
    // Un correo típico = 3-10 iters × Sonnet 4-6 (~$0.03-0.10 USD real). Si
    // agentId no está seteado (test / config incompleta), no cobra pero
    // tampoco crashea. Kill switch en pool-charge decide si se ejecuta.
    if (this.config.agentId && iterationsExecuted > 0) {
      try {
        await chargePool({
          agentId:      this.config.agentId,
          source:       'nala_billing_loop',
          reference_id: emailId,
          label:        `Procesar correo (${iterationsExecuted} iters LLM)`,
          context:      `Modelo ${model}. Sales: ${result.processed}. Escalated: ${result.escalated}. Consulted: ${result.consulted}. Errors: ${result.errors.length}`,
        }, iterationsExecuted);
      } catch (chargeErr) {
        console.error('[billing/employee] chargePool iterations failed:',
          chargeErr instanceof Error ? chargeErr.message : String(chargeErr));
      }
    }

    return result;
  }
}
