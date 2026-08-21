/**
 * tools.ts -- Registro de herramientas del empleado digital de facturacion.
 *
 * buildEmployeeTools() retorna el array de tools listas para enviar al SDK de
 * Anthropic y para despachar los handlers cuando el LLM las invoca.
 *
 * Cada tool tiene:
 *   - name, description, input_schema (formato Anthropic tool_use)
 *   - handler: funcion async que ejecuta la logica real
 *
 * Dependencias:
 *   - BillingAdapter (searchClient, searchProduct, getClientByRFC, freshness)
 *   - OrgCtx (portalEmail, integrationId)
 *   - Modulos de matching, vision, storage, excel, mail
 *   - createAdminClient para acceso a DB
 */

import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages';
import type { BillingAdapter } from '../adapter';
import type { OrgCtx } from '../matching/client';
import { matchClient, learnClientAlias } from '../matching/client';
import { matchProduct, learnProductAlias } from '../matching/product';
import { extractNoteFromImage } from '../vision/extract';
import { DropboxClient } from '../storage/dropbox';
import { SnapshotStorage } from '../storage/snapshot';
import { ExcelWorkbook } from '../excel/workbook';
import { DailySalesSchema, PendingClientSchema } from '../excel/schemas';
import { sendBillingMail, replyToInboundEmail } from '../mail/send';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPendingPath } from '../rules/paths';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

export interface EmployeeTool {
  name: string;
  description: string;
  input_schema: AnthropicTool['input_schema'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any) => Promise<unknown>;
}

export interface ToolsContext {
  adapter: BillingAdapter;
  ctx: OrgCtx;
  emailId: string;
  dropboxToken: string;
  dropboxBasePath: string;
  escalationEmail: string;
}

// ---------------------------------------------------------------------------
// buildEmployeeTools
// ---------------------------------------------------------------------------

export function buildEmployeeTools(toolsCtx: ToolsContext): EmployeeTool[] {
  const { adapter, ctx, emailId, dropboxToken, dropboxBasePath, escalationEmail } = toolsCtx;
  const supabase = createAdminClient();
  const dropbox = new DropboxClient(dropboxToken);
  const snapshots = new SnapshotStorage();

  return [
    // -------------------------------------------------------------------------
    // extract_note_from_image
    // -------------------------------------------------------------------------
    {
      name: 'extract_note_from_image',
      description:
        'Extrae datos estructurados de una foto de notita de venta manuscrita. ' +
        'Devuelve cliente_texto, productos (nombre, cantidad, unidad), metodo_pago, fecha, monto_total y scores de confianza.',
      input_schema: {
        type: 'object',
        properties: {
          image_base64: {
            type: 'string',
            description: 'Contenido de la imagen en base64.',
          },
          mime_type: {
            type: 'string',
            description: 'MIME type de la imagen. Ej: image/jpeg, image/png.',
          },
        },
        required: ['image_base64', 'mime_type'],
      },
      handler: async (input: { image_base64: string; mime_type: string }) => {
        const buffer = Buffer.from(input.image_base64, 'base64');
        return extractNoteFromImage(buffer, input.mime_type);
      },
    },

    // -------------------------------------------------------------------------
    // match_client
    // -------------------------------------------------------------------------
    {
      name: 'match_client',
      description:
        'Busca un cliente por texto libre (nombre, alias o fragmento) en el catalogo del adaptador. ' +
        'Regresa el top candidato, la decision (auto/auto_with_flag/consult/unknown) y la razon.',
      input_schema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Texto a buscar. Puede ser el nombre escrito en la notita.',
          },
        },
        required: ['text'],
      },
      handler: async (input: { text: string }) => {
        return matchClient(input.text, adapter, ctx);
      },
    },

    // -------------------------------------------------------------------------
    // match_product
    // -------------------------------------------------------------------------
    {
      name: 'match_product',
      description:
        'Busca un producto por texto libre (nombre, descripcion o SKU parcial) en el catalogo del adaptador. ' +
        'Regresa el top candidato, la decision y la razon.',
      input_schema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Texto a buscar. Puede ser el nombre escrito en la notita.',
          },
        },
        required: ['text'],
      },
      handler: async (input: { text: string }) => {
        return matchProduct(input.text, adapter, ctx);
      },
    },

    // -------------------------------------------------------------------------
    // learn_client_alias
    // -------------------------------------------------------------------------
    {
      name: 'learn_client_alias',
      description:
        'Registra un alias aprendido para un cliente. ' +
        'Usar cuando el cliente fue identificado con decision auto_with_flag para que la proxima vez sea auto.',
      input_schema: {
        type: 'object',
        properties: {
          rfc: {
            type: 'string',
            description: 'RFC del cliente al que corresponde el alias.',
          },
          alias: {
            type: 'string',
            description: 'Texto tal como aparecio en la notita (se normaliza internamente).',
          },
        },
        required: ['rfc', 'alias'],
      },
      handler: async (input: { rfc: string; alias: string }) => {
        await learnClientAlias(input.rfc, input.alias, ctx, emailId);
        return { ok: true };
      },
    },

    // -------------------------------------------------------------------------
    // learn_product_alias
    // -------------------------------------------------------------------------
    {
      name: 'learn_product_alias',
      description:
        'Registra un alias aprendido para un producto. ' +
        'Usar cuando el producto fue identificado con decision auto_with_flag.',
      input_schema: {
        type: 'object',
        properties: {
          sku: {
            type: 'string',
            description: 'SKU del producto al que corresponde el alias.',
          },
          alias: {
            type: 'string',
            description: 'Texto tal como aparecio en la notita.',
          },
        },
        required: ['sku', 'alias'],
      },
      handler: async (input: { sku: string; alias: string }) => {
        await learnProductAlias(input.sku, input.alias, ctx, emailId);
        return { ok: true };
      },
    },

    // -------------------------------------------------------------------------
    // get_billing_rules
    // -------------------------------------------------------------------------
    {
      name: 'get_billing_rules',
      description:
        'Devuelve las reglas de facturacion configuradas para un cliente por su RFC. ' +
        'Si no hay overrides, retorna null (usar default: frequency=daily, metodo segun notita).',
      input_schema: {
        type: 'object',
        properties: {
          rfc: {
            type: 'string',
            description: 'RFC del cliente.',
          },
        },
        required: ['rfc'],
      },
      handler: async (input: { rfc: string }) => {
        const { data, error } = await supabase
          .from('billing_client_rules')
          .select('rfc, frequency, default_payment_method, aliases, notes')
          .eq('integration_id', ctx.integrationId)
          .eq('rfc', input.rfc)
          .maybeSingle();

        if (error) {
          throw new Error(`[tools/get_billing_rules] DB error: ${error.message}`);
        }

        return data ?? null;
      },
    },

    // -------------------------------------------------------------------------
    // read_excel
    // -------------------------------------------------------------------------
    {
      name: 'read_excel',
      description:
        'Lee un archivo Excel de Dropbox y devuelve las filas de una hoja especifica. ' +
        'Usar para revisar el estado actual antes de escribir.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Ruta del archivo en Dropbox. Ej: /Ventas/Ventas_2026-08-17.xlsx',
          },
          sheet_name: {
            type: 'string',
            description: 'Nombre de la hoja a leer.',
          },
        },
        required: ['file_path', 'sheet_name'],
      },
      handler: async (input: { file_path: string; sheet_name: string }) => {
        const fullPath = input.file_path.startsWith('/')
          ? input.file_path
          : `${dropboxBasePath}/${input.file_path}`;

        let buffer: Buffer;
        try {
          buffer = await dropbox.readFile(fullPath);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`[tools/read_excel] Dropbox read failed for ${fullPath}: ${msg}`);
        }

        // Use DailySalesSchema as fallback for unknown sheets; caller knows the schema.
        const wb = await ExcelWorkbook.fromBuffer(buffer, DailySalesSchema);
        return { rows: wb.getRows(input.sheet_name) };
      },
    },

    // -------------------------------------------------------------------------
    // write_excel
    // -------------------------------------------------------------------------
    {
      name: 'write_excel',
      description:
        'Crea un snapshot del archivo actual, luego sobrescribe el archivo en Dropbox. ' +
        'Nunca usar sin snapshot. Usar append_daily_sale o append_pending_client_sale para casos estandar.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Ruta del archivo en Dropbox.',
          },
          sheet_name: {
            type: 'string',
            description: 'Nombre de la hoja donde agregar la fila.',
          },
          row: {
            type: 'object',
            description: 'Objeto con los valores de la fila. Las claves deben coincidir con el schema.',
          },
        },
        required: ['file_path', 'sheet_name', 'row'],
      },
      handler: async (input: { file_path: string; sheet_name: string; row: Record<string, unknown> }) => {
        const fullPath = input.file_path.startsWith('/')
          ? input.file_path
          : `${dropboxBasePath}/${input.file_path}`;

        // Intentar leer el archivo existente; si no existe, crear uno vacio.
        let buffer: Buffer;
        let isNew = false;
        try {
          buffer = await dropbox.readFile(fullPath);
        } catch {
          // Archivo no encontrado -- crear workbook vacio
          isNew = true;
          const schema = input.sheet_name === 'Ventas' ? DailySalesSchema : PendingClientSchema;
          const wb = ExcelWorkbook.empty(schema);
          buffer = await wb.toBuffer();
        }

        // Snapshot obligatorio antes de cualquier escritura.
        const snapshotId = await snapshots.snapshot(ctx.portalEmail, fullPath, buffer);

        // Cargar el workbook (o el vacio recien creado) y agregar la fila.
        const schema = input.sheet_name === 'Ventas' ? DailySalesSchema : PendingClientSchema;
        const wb = isNew
          ? ExcelWorkbook.empty(schema)
          : await ExcelWorkbook.fromBuffer(buffer, schema);

        wb.appendRow(input.sheet_name, input.row);

        const newBuffer = await wb.toBuffer();
        await dropbox.writeFile(fullPath, newBuffer);

        return { ok: true, snapshotId, path: fullPath };
      },
    },

    // -------------------------------------------------------------------------
    // append_daily_sale
    // -------------------------------------------------------------------------
    {
      name: 'append_daily_sale',
      description:
        'Agrega una fila de venta al Excel diario Ventas_YYYY-MM-DD.xlsx. ' +
        'Helper de alto nivel: calcula la fecha actual, construye la ruta y llama a write_excel internamente.',
      input_schema: {
        type: 'object',
        properties: {
          fecha: {
            type: 'string',
            description: 'Fecha de la venta en formato YYYY-MM-DD. Si se omite, se usa la fecha actual.',
          },
          cliente: {
            type: 'string',
            description: 'Razon social del cliente.',
          },
          rfc: {
            type: 'string',
            description: 'RFC del cliente.',
          },
          productos: {
            type: 'string',
            description: 'Descripcion de productos (texto libre, Ej: "2 kg tortilla, 1 kg manteca").',
          },
          total: {
            type: 'number',
            description: 'Monto total de la venta.',
          },
          metodo: {
            type: 'string',
            description: 'Metodo de pago. Ej: efectivo, transferencia, tarjeta.',
          },
        },
        required: ['cliente', 'rfc', 'productos', 'total', 'metodo'],
      },
      handler: async (input: {
        fecha?: string;
        cliente: string;
        rfc: string;
        productos: string;
        total: number;
        metodo: string;
      }) => {
        const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
        const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const fileName = `Ventas_${fecha}.xlsx`;
        const fullPath = `${dropboxBasePath}/${fileName}`;

        // Leer archivo existente o crear uno vacio.
        let buffer: Buffer;
        let isNew = false;
        try {
          buffer = await dropbox.readFile(fullPath);
        } catch {
          isNew = true;
          const wb = ExcelWorkbook.empty(DailySalesSchema);
          buffer = await wb.toBuffer();
        }

        // Snapshot obligatorio.
        const snapshotId = await snapshots.snapshot(ctx.portalEmail, fullPath, buffer);

        const wb = isNew
          ? ExcelWorkbook.empty(DailySalesSchema)
          : await ExcelWorkbook.fromBuffer(buffer, DailySalesSchema);

        // Numero correlativo: filas existentes + 1.
        const existingRows = wb.getRows('Ventas');
        const num = existingRows.length + 1;

        wb.appendRow('Ventas', {
          num,
          hora,
          cliente: input.cliente,
          rfc: input.rfc,
          productos: input.productos,
          total: input.total,
          metodo: input.metodo,
          status: 'pendiente_timbrar',
          factura: '',
        });

        const newBuffer = await wb.toBuffer();
        await dropbox.writeFile(fullPath, newBuffer);

        return { ok: true, snapshotId, fileName, num };
      },
    },

    // -------------------------------------------------------------------------
    // append_pending_client_sale
    // -------------------------------------------------------------------------
    {
      name: 'append_pending_client_sale',
      description:
        'Agrega una fila al Excel de pendientes del cliente ' +
        '(Clientes_Periodicos/<RFC>/Pendientes.xlsx). ' +
        'Usar para clientes con facturacion semanal o mensual.',
      input_schema: {
        type: 'object',
        properties: {
          rfc: {
            type: 'string',
            description: 'RFC del cliente. Se usa como parte del nombre del archivo.',
          },
          fecha: {
            type: 'string',
            description: 'Fecha de la venta en formato YYYY-MM-DD.',
          },
          productos: {
            type: 'string',
            description: 'Descripcion de productos.',
          },
          total: {
            type: 'number',
            description: 'Monto total de la venta.',
          },
          metodo: {
            type: 'string',
            description: 'Metodo de pago.',
          },
          referencia: {
            type: 'string',
            description: 'Referencia o ID del correo fuente.',
          },
        },
        required: ['rfc', 'productos', 'total', 'metodo'],
      },
      handler: async (input: {
        rfc: string;
        fecha?: string;
        productos: string;
        total: number;
        metodo: string;
        referencia?: string;
      }) => {
        const fecha = input.fecha ?? new Date().toISOString().slice(0, 10);
        const fullPath = buildPendingPath(dropboxBasePath, input.rfc);

        let buffer: Buffer;
        let isNew = false;
        try {
          buffer = await dropbox.readFile(fullPath);
        } catch {
          isNew = true;
          const wb = ExcelWorkbook.empty(PendingClientSchema);
          buffer = await wb.toBuffer();
        }

        // Snapshot obligatorio.
        const snapshotId = await snapshots.snapshot(ctx.portalEmail, fullPath, buffer);

        const wb = isNew
          ? ExcelWorkbook.empty(PendingClientSchema)
          : await ExcelWorkbook.fromBuffer(buffer, PendingClientSchema);

        const existingRows = wb.getRows('Pendientes');
        const num = existingRows.length + 1;

        wb.appendRow('Pendientes', {
          num,
          fecha,
          productos: input.productos,
          total: input.total,
          metodo: input.metodo,
          ventasSources: input.referencia ?? emailId,
        });

        const newBuffer = await wb.toBuffer();
        await dropbox.writeFile(fullPath, newBuffer);

        return { ok: true, snapshotId, path: fullPath, num };
      },
    },

    // -------------------------------------------------------------------------
    // enviar_correo
    // -------------------------------------------------------------------------
    {
      name: 'enviar_correo',
      description:
        'Envia un correo saliente. Usar para comunicaciones proactivas (reportes, alertas informativas). ' +
        'Para responder al correo original usar reply_email.',
      input_schema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Destinatario.',
          },
          subject: {
            type: 'string',
            description: 'Asunto del correo.',
          },
          body: {
            type: 'string',
            description: 'Cuerpo del correo en HTML.',
          },
        },
        required: ['to', 'subject', 'body'],
      },
      handler: async (input: { to: string; subject: string; body: string }) => {
        const result = await sendBillingMail({
          to: input.to,
          subject: input.subject,
          body: input.body,
        });
        return result;
      },
    },

    // -------------------------------------------------------------------------
    // reply_email
    // -------------------------------------------------------------------------
    {
      name: 'reply_email',
      description:
        'Responde al correo original del empleado (preserva threading SMTP). ' +
        'Usar para consultas (cliente desconocido, producto desconocido, datos faltantes).',
      input_schema: {
        type: 'object',
        properties: {
          body: {
            type: 'string',
            description: 'Cuerpo del correo de respuesta en texto plano o HTML.',
          },
        },
        required: ['body'],
      },
      handler: async (input: { body: string }) => {
        const result = await replyToInboundEmail(emailId, input.body);
        return result;
      },
    },

    // -------------------------------------------------------------------------
    // log_activity
    // -------------------------------------------------------------------------
    {
      name: 'log_activity',
      description:
        'Registra un evento en la bitacora de actividad del empleado (billing_activity_log). ' +
        'Severity: info para acciones normales, warning para alertas, error para fallas.',
      input_schema: {
        type: 'object',
        properties: {
          action_type: {
            type: 'string',
            description: 'Tipo de accion. Ej: nota_capturada, cliente_consultado, venta_registrada, error_critico.',
          },
          severity: {
            type: 'string',
            enum: ['info', 'warning', 'error'],
            description: 'Nivel de severidad del evento.',
          },
          entity_ref: {
            type: 'string',
            description: 'Referencia a la entidad involucrada (RFC del cliente, SKU, nombre de archivo, etc.).',
          },
          context: {
            type: 'object',
            description: 'Datos adicionales del evento (JSON libre).',
          },
        },
        required: ['action_type', 'severity'],
      },
      handler: async (input: {
        action_type: string;
        severity: 'info' | 'warning' | 'error';
        entity_ref?: string;
        context?: Record<string, unknown>;
      }) => {
        const { error } = await supabase.from('billing_activity_log').insert({
          portal_email: ctx.portalEmail,
          integration_id: ctx.integrationId,
          action_type: input.action_type,
          severity: input.severity,
          entity_ref: input.entity_ref ?? null,
          context: { ...(input.context ?? {}), email_id: emailId },
        });

        if (error) {
          // No lanzar error para no romper el loop por un fallo de logging.
          console.error('[tools/log_activity] insert error:', error.message);
          return { ok: false, error: error.message };
        }

        return { ok: true };
      },
    },

    // -------------------------------------------------------------------------
    // escalate
    // -------------------------------------------------------------------------
    {
      name: 'escalate',
      description:
        'Escalacion urgente: envia correo de alerta al responsable de la organizacion y registra en bitacora con severity=error. ' +
        'Usar cuando no es posible continuar sin intervencion humana.',
      input_schema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Descripcion breve del problema que requiere atencion.',
          },
          urgency: {
            type: 'string',
            enum: ['high', 'critical'],
            description: 'Nivel de urgencia.',
          },
          context: {
            type: 'object',
            description: 'Datos adicionales para el responsable (JSON libre).',
          },
        },
        required: ['topic', 'urgency'],
      },
      handler: async (input: {
        topic: string;
        urgency: 'high' | 'critical';
        context?: Record<string, unknown>;
      }) => {
        // Enviar correo de escalacion.
        const urgencyLabel = input.urgency === 'critical' ? 'CRITICO' : 'URGENTE';
        const subject = `[Facturacion ${urgencyLabel}] ${input.topic}`;
        const contextBlock = input.context
          ? `<pre>${JSON.stringify(input.context, null, 2)}</pre>`
          : '';

        const body = `
<p>El empleado digital de facturacion requiere intervencion humana.</p>
<p><strong>Tema:</strong> ${input.topic}</p>
<p><strong>Correo de origen:</strong> ${emailId}</p>
<p><strong>Organizacion:</strong> ${ctx.portalEmail}</p>
${contextBlock}
<p>Por favor revise y tome accion.</p>
        `.trim();

        let mailResult: { messageId: string } | null = null;
        try {
          mailResult = await sendBillingMail({
            to: escalationEmail,
            subject,
            body,
          });
        } catch (mailErr) {
          console.error('[tools/escalate] mail send failed:', mailErr);
        }

        // Registrar en bitacora.
        await supabase.from('billing_activity_log').insert({
          portal_email: ctx.portalEmail,
          integration_id: ctx.integrationId,
          action_type: 'escalation',
          severity: 'error',
          entity_ref: input.topic,
          context: {
            email_id: emailId,
            urgency: input.urgency,
            ...(input.context ?? {}),
            mail_sent: !!mailResult,
          },
        });

        return {
          ok: true,
          mailSent: !!mailResult,
          messageId: mailResult?.messageId ?? null,
        };
      },
    },

    // -------------------------------------------------------------------------
    // freshness_check
    // -------------------------------------------------------------------------
    {
      name: 'freshness_check',
      description:
        'Consulta el estado de salud y frescura del adaptador de facturacion. ' +
        'Retorna lastSyncAt, minutesStale, healthy y un mensaje de diagnostico opcional.',
      input_schema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return adapter.freshness();
      },
    },
  ];
}

/**
 * Convierte el array de EmployeeTool al formato que espera el SDK de Anthropic
 * (sin el campo handler, que es solo interno).
 */
export function toAnthropicTools(tools: EmployeeTool[]): AnthropicTool[] {
  return tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
}
