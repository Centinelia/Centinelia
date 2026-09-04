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
    // 6. Loop LLM
    // -------------------------------------------------------------------------
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.BILLING_LOOP_MODEL ?? DEFAULT_MODEL;

    type MessageParam = { role: 'user' | 'assistant'; content: Anthropic.MessageParam['content'] };
    const messages: MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    let iterationsExecuted = 0;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          tools: anthropicTools,
          messages: messages as Anthropic.MessageParam[],
        });
        iterationsExecuted++;
      } catch (llmErr) {
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
