import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { consumeAiOp } from '@/lib/ai/ops-guard';

const anthropic = new Anthropic();

const TYPE_LABELS: Record<string, string> = {
  contrato:    'Contrato',
  pago:        'Pago',
  permiso:     'Permiso',
  renovacion:  'Renovación',
  otro:        'Documento',
};

export async function checkExpiringContracts(): Promise<{ alerted: number }> {
  const supabase = createAdminClient();
  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  // Pull all active contracts with upcoming expiry
  const maxDays = 60;
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + maxDays);

  const { data: contracts } = await supabase
    .from('ops_contracts')
    .select('*, voice_agents!inner(id, business_name, client_email, agent_name, knowledge_base, portal_token)')
    .eq('status', 'activo')
    .lte('expiry_date', maxDate.toISOString().slice(0, 10))
    .gte('expiry_date', today.toISOString().slice(0, 10));

  if (!contracts?.length) return { alerted: 0 };

  let alerted = 0;

  for (const contract of contracts) {
    const expiry      = new Date(contract.expiry_date + 'T12:00:00');
    const daysLeft    = Math.round((expiry.getTime() - today.getTime()) / 86400000);
    const alertDays   = (contract.alert_days_before as number[]) ?? [30, 7, 1];

    if (!alertDays.includes(daysLeft)) continue;

    const agent         = (contract as any).voice_agents;
    const ownerEmail    = agent?.client_email as string | null;
    if (!ownerEmail) continue;

    // Generate renewal draft if not already present
    let renewalDraft = contract.renewal_draft as string | null;
    if (!renewalDraft) {
      const opsResult = await consumeAiOp(contract.agent_id as string, 1);
      if (opsResult.ok) {
        renewalDraft = await generateRenewalDraft({
          contractName:  contract.name as string,
          contractType:  contract.contract_type as string,
          counterparty:  contract.counterparty as string | null,
          daysLeft,
          businessName:  agent.business_name as string,
          knowledgeBase: agent.knowledge_base as string | null,
        });
        await supabase.from('ops_contracts').update({ renewal_draft: renewalDraft }).eq('id', contract.id);
      }
    }

    const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const portalUrl = agent.portal_token ? `${baseUrl}/portal/${agent.portal_token}?tab=oficina` : baseUrl;
    const typeLabel = TYPE_LABELS[contract.contract_type as string] ?? 'Documento';

    await sendEmail({
      to:      ownerEmail,
      subject: `${typeLabel} por vencer en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}: ${contract.name}`,
      html:    contractAlertHtml({
        businessName:  agent.business_name as string,
        contractName:  contract.name as string,
        contractType:  typeLabel,
        counterparty:  contract.counterparty as string | null,
        expiryDate:    expiry.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        daysLeft,
        renewalDraft,
        portalUrl,
      }),
    });

    await supabase
      .from('ops_contracts')
      .update({ last_alerted_at: new Date().toISOString() })
      .eq('id', contract.id);

    alerted++;
  }

  // Mark expired contracts
  await supabase
    .from('ops_contracts')
    .update({ status: 'vencido' })
    .eq('status', 'activo')
    .lt('expiry_date', today.toISOString().slice(0, 10));

  return { alerted };
}

async function generateRenewalDraft(opts: {
  contractName:  string;
  contractType:  string;
  counterparty:  string | null;
  daysLeft:      number;
  businessName:  string;
  knowledgeBase: string | null;
}): Promise<string> {
  const { contractName, contractType, counterparty, daysLeft, businessName, knowledgeBase } = opts;

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system:     `Eres asistente de oficina de ${businessName}.${knowledgeBase ? `\n\n${knowledgeBase}` : ''}`,
      messages:   [{
        role:    'user',
        content: `Redacta un borrador breve de solicitud de renovación para este documento:

Documento: ${contractName}
Tipo: ${contractType}
${counterparty ? `Contraparte: ${counterparty}` : ''}
Vence en: ${daysLeft} días

El borrador debe ser profesional, directo y listo para editar. Máximo 150 palabras.`,
      }],
    });
    return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  } catch {
    return '';
  }
}

function contractAlertHtml(opts: {
  businessName:  string;
  contractName:  string;
  contractType:  string;
  counterparty:  string | null;
  expiryDate:    string;
  daysLeft:      number;
  renewalDraft:  string | null;
  portalUrl:     string;
}): string {
  const { businessName, contractName, contractType, counterparty, expiryDate, daysLeft, renewalDraft, portalUrl } = opts;
  const urgency   = daysLeft <= 1 ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : '#6C3BFF';
  const BG        = '#120726';
  const CARD      = 'rgba(255,255,255,0.055)';
  const BORDER    = 'rgba(255,255,255,0.10)';
  const TEXT      = '#e2e8f0';
  const SUB       = 'rgba(255,255,255,0.58)';
  const MUTE      = 'rgba(255,255,255,0.35)';
  const ACCENT    = '#9B6DFF';
  const LOGO      = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/logo-tagline.png`;

  const urgencyLabel = daysLeft <= 1 ? '¡Vence hoy!' : daysLeft <= 7 ? `Vence en ${daysLeft} días` : `Vence en ${daysLeft} días`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <div style="background:#EDE8FF;border-radius:16px 16px 0 0;padding:20px 32px;text-align:center;border-bottom:1px solid rgba(108,59,255,0.15)">
      <img src="${LOGO}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
    </div>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:${urgency}22;border:1px solid ${urgency}40;border-radius:20px;padding:6px 16px;color:${urgency};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${urgencyLabel}</span>
      </div>
      <h1 style="color:${TEXT};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">${contractType} por vencer</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${businessName}</p>
      <div style="background:rgba(255,255,255,0.04);border:1px solid ${BORDER};border-radius:10px;padding:16px;margin-bottom:16px">
        <p style="color:${TEXT};font-size:15px;font-weight:700;margin:0 0 8px">${contractName}</p>
        ${counterparty ? `<p style="color:${SUB};font-size:13px;margin:0 0 4px">Contraparte: ${counterparty}</p>` : ''}
        <p style="color:${urgency};font-size:13px;font-weight:600;margin:0">Vence: ${expiryDate}</p>
      </div>
      ${renewalDraft ? `
      <div style="background:rgba(108,59,255,0.08);border:1px solid rgba(108,59,255,0.2);border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="color:${MUTE};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px">Borrador de renovación</p>
        <p style="color:${TEXT};font-size:13px;line-height:1.75;margin:0;white-space:pre-wrap">${renewalDraft}</p>
      </div>` : ''}
      <div style="text-align:center">
        <a href="${portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Ver en el portal</a>
      </div>
    </div>
    <div style="text-align:center;padding:24px 0 0">
      <p style="color:${MUTE};font-size:12px;margin:0">
        <a href="https://www.centinelia.mx" style="color:${MUTE};text-decoration:none">centinelia.mx</a>
        &nbsp;·&nbsp;
        <a href="mailto:hola@centinelia.mx" style="color:${ACCENT};text-decoration:none">hola@centinelia.mx</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
