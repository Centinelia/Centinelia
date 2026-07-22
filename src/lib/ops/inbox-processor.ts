import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { approvalEmailHtml } from '@/lib/ops/approval-email';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { EMAIL_BODY_TRUNCATE_CHARS } from '@/lib/constants';
import { executeSearchFiles, executeReadFile } from '@/lib/services/connector-tools';

const anthropic = new Anthropic();

const CATEGORY_LABELS: Record<string, string> = {
  proveedor: 'Proveedor',
  cliente:   'Cliente',
  urgente:   'Urgente',
  factura:   'Factura',
  spam:      'Spam',
  otro:      'Otro',
};

interface ProcessedEmail {
  category:           string;
  summary:            string;
  draft:              string | null;
  invoiceData:        Record<string, string | number | null> | null;
  invoiceValid:       boolean | null;
  invoiceDiscrepancy: string | null;
}

export async function processInboxEmail(params: {
  agentId:        string;
  source:         string;
  rawMessageId?:  string;
  emailFrom:      string;
  emailSubject:   string;
  emailBody:      string;
  attachments:    Array<{ name: string; url: string; type: string; size: number }>;
  agentName:      string;
  businessName:   string;
  knowledgeBase?: string | null;
  roleKB?:        string | null;
  agentRole?:     string | null;
  ownerEmail:     string;
  portalToken:    string;
}): Promise<void> {
  const {
    agentId, source, rawMessageId, emailFrom, emailSubject,
    emailBody, attachments, agentName, businessName,
    knowledgeBase, roleKB, agentRole, ownerEmail, portalToken,
  } = params;

  const hasInvoiceAttachment = attachments.some(a =>
    a.type === 'application/pdf' || a.name.toLowerCase().includes('factura') || a.name.toLowerCase().includes('invoice')
  );
  const looksLikeInvoice = hasInvoiceAttachment ||
    /factura|invoice|bill|cobro|pago/i.test(emailSubject) ||
    /factura|invoice|bill|cobro/i.test(emailBody.slice(0, 300));

  const contextBlocks: string[] = [];
  if (knowledgeBase?.trim()) contextBlocks.push(`NEGOCIO:\n${knowledgeBase.trim()}`);
  if (agentRole?.trim() && roleKB?.trim()) contextBlocks.push(`ROL DEL AGENTE: ${agentRole}\n${roleKB.trim()}`);
  const contextSection = contextBlocks.length ? `\n\n${contextBlocks.join('\n\n')}` : '';

  const systemPrompt = `Eres ${agentName}, asistente de oficina de ${businessName}. Analizas emails entrantes y produces JSON con la categoría, resumen y borrador de respuesta.${contextSection}

Categorías: proveedor, cliente, urgente, factura, spam, otro.
- "urgente": emergencias, quejas graves, solicitudes de alta prioridad.
- "factura": cualquier email con factura, cargo o solicitud de pago de un proveedor.
- "spam": publicidad, marketing no solicitado.

Responde SOLO con JSON válido, sin markdown, sin texto adicional.`;

  const invoiceInstructions = looksLikeInvoice
    ? `\nAdemás del análisis estándar, extrae los datos de la factura:
- vendor (nombre del proveedor)
- amount (monto numérico, sin símbolo de moneda)
- currency (MXN por default si no se especifica)
- invoice_no (número de factura)
- date (fecha de la factura YYYY-MM-DD o null)
- po_ref (número de orden de compra mencionado o null)

Si algo no se puede determinar del email, pon null.
Incluye en el JSON un campo "invoice_data" con estos campos.
Incluye "invoice_valid": true si todos los datos esenciales están presentes, false si falta información clave.
Si hay discrepancia o dato sospechoso, descríbela en "invoice_discrepancy" (o null si todo OK).` : '';

  const userPrompt = `EMAIL ENTRANTE:
De: ${emailFrom}
Asunto: ${emailSubject}
${attachments.length ? `Adjuntos: ${attachments.map(a => a.name).join(', ')}` : ''}

CUERPO:
${emailBody.slice(0, 3000)}
${invoiceInstructions}

Produce JSON con:
{
  "category": "<categoría>",
  "summary": "<resumen de 1-2 oraciones en español>",
  "draft": "<borrador de respuesta en español, o null si es spam o solo informativo>"
}
${looksLikeInvoice ? '+ los campos invoice_data, invoice_valid, invoice_discrepancy' : ''}`;

  let result: ProcessedEmail = {
    category:           'otro',
    summary:            'Email recibido.',
    draft:              null,
    invoiceData:        null,
    invoiceValid:       null,
    invoiceDiscrepancy: null,
  };

  const opsResult = await consumeAiOp(agentId, 1);
  if (opsResult.ok) {
    // Enrich draft context with a relevant Drive document (best-effort, non-blocking)
    let driveContext = '';
    try {
      // Subject carries the densest keywords; add up to 500 chars of body to catch the actual ask
      const driveQuery = [emailSubject, emailBody.slice(0, 500)].filter(Boolean).join(' ');
      if (driveQuery.trim()) {
        const supabaseDrive = createAdminClient();
        const sr    = await executeSearchFiles(agentId, driveQuery, supabaseDrive);
        const files = (sr.ok && sr.files)
          ? (sr.files as Array<{ id: string; name: string; mimeType?: string }>).slice(0, 2)
          : [];

        const sections: string[] = [];
        await Promise.all(files.map(async f => {
          const rr = await executeReadFile(agentId, f.id, f.name, f.mimeType ?? '', supabaseDrive);
          if (rr.ok && rr.content) {
            sections.push(`### ${f.name}\n${rr.content as string}`);
          }
        }));

        if (sections.length) {
          driveContext = `\n\nDOCUMENTOS RELEVANTES DEL DRIVE:\n${sections.join('\n\n')}`;
        }
      }
    } catch { /* Drive not connected or search failed — continue without enrichment */ }

    try {
      const msg = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system:     systemPrompt + driveContext,
        messages:   [{ role: 'user', content: userPrompt }],
      });
      const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}';
      const parsed = JSON.parse(text);
      result = {
        category:           parsed.category           ?? 'otro',
        summary:            parsed.summary             ?? 'Email recibido.',
        draft:              parsed.draft               ?? null,
        invoiceData:        parsed.invoice_data        ?? null,
        invoiceValid:       parsed.invoice_valid       ?? null,
        invoiceDiscrepancy: parsed.invoice_discrepancy ?? null,
      };
    } catch (err) {
      console.error('[ops/inbox-processor] AI parse error:', err);
    }
  }

  const supabase = createAdminClient();
  const { data: item } = await supabase
    .from('ops_inbox')
    .insert({
      agent_id:           agentId,
      source,
      raw_message_id:     rawMessageId ?? null,
      email_from:         emailFrom,
      email_subject:      emailSubject,
      email_body:         emailBody.slice(0, EMAIL_BODY_TRUNCATE_CHARS),
      attachments,
      category:           result.category,
      ai_summary:         result.summary,
      ai_draft:           result.draft,
      item_type:          looksLikeInvoice ? 'invoice' : 'email',
      invoice_data:       result.invoiceData,
      invoice_valid:      result.invoiceValid,
      invoice_discrepancy: result.invoiceDiscrepancy,
      status:             result.category === 'spam' ? 'skipped' : 'pending',
    })
    .select('id, approval_token, status')
    .single();

  if (!item || item.status === 'skipped') return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const approveUrl = `${baseUrl}/api/ops/approve/${item.approval_token}`;
  const rejectUrl  = `${baseUrl}/api/ops/reject/${item.approval_token}`;
  const portalUrl  = `${baseUrl}/portal/${portalToken}?tab=oficina`;

  const html = approvalEmailHtml({
    businessName,
    emailFrom,
    emailSubject,
    category:           result.category,
    categoryLabel:      CATEGORY_LABELS[result.category] ?? result.category,
    summary:            result.summary,
    draft:              result.draft,
    itemType:           looksLikeInvoice ? 'invoice' : 'email',
    invoiceData:        result.invoiceData,
    invoiceValid:       result.invoiceValid,
    invoiceDiscrepancy: result.invoiceDiscrepancy,
    approveUrl,
    rejectUrl,
    portalUrl,
    attachmentCount:    attachments.length,
  });

  await sendEmail({
    to:      ownerEmail,
    subject: `[${CATEGORY_LABELS[result.category] ?? 'Email'}] ${emailSubject || '(sin asunto)'} — aprobación pendiente`,
    html,
  });
}
