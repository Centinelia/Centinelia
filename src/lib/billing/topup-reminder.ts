/**
 * Envía un email a hola@centinelia.mx cuando un cliente activa un plan,
 * con el breakdown de saldos a agregar en cada plataforma para el primer mes.
 *
 * Usado por el Stripe webhook cuando checkout.session.completed dispara
 * activación de nuevo cliente (self-service o manual). El owner recibe la
 * notificación y sabe exactamente cuánto cargar en Vapi/Twilio/Anthropic.
 */
import { sendEmail, shell } from '@/lib/email/send';

const COST_PER_MIN_VAPI     = 0.06;
const COST_PER_MIN_TWILIO   = 0.02;
const COST_PER_OP_ANTHROPIC = 0.05;
const SAFETY_BUFFER         = 1.30;
const MXN_PER_USD           = 19;

export interface TopupReminderInput {
  businessName: string;
  portalEmail:  string;
  agentName:    string | null;
  minutes:      number;
  aiOps:        number;
  jornadaLabel: string;
  tierLabel:    string;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)} USD`;
}
function fmtMxn(n: number): string {
  return `MXN $${Math.round(n).toLocaleString('es-MX')}`;
}

export async function sendTopupReminderEmail(input: TopupReminderInput): Promise<void> {
  const { businessName, portalEmail, agentName, minutes, aiOps, jornadaLabel, tierLabel } = input;

  const vapi     = minutes * COST_PER_MIN_VAPI     * SAFETY_BUFFER;
  const twilio   = minutes * COST_PER_MIN_TWILIO   * SAFETY_BUFFER;
  const anthropic = aiOps  * COST_PER_OP_ANTHROPIC * SAFETY_BUFFER;
  const total     = vapi + twilio + anthropic;

  const subject = `[Saldos] Nuevo cliente ${businessName} — agregar ${fmtUsd(total)}`;

  const rows = [
    { name: 'Vapi',                url: 'https://dashboard.vapi.ai/org/billing',                                    amount: vapi,      note: 'Cubre STT + TTS + LLM + platform fee' },
    { name: 'Twilio',              url: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview',    amount: twilio,    note: 'Minutos de llamada (números ya fijos aparte)' },
    { name: 'Anthropic (Claude)',  url: 'https://console.anthropic.com/settings/billing',                            amount: anthropic, note: 'Inbox_processor + delegar_tarea + Nash + chat' },
  ];

  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #3D2E6A">
        <p style="margin:0 0 4px;color:#F1EEFF;font-weight:600;font-size:14px">${r.name}</p>
        <p style="margin:0;color:#C8BEE8;font-size:12px">${r.note}</p>
      </td>
      <td style="padding:12px 16px;text-align:right;border-bottom:1px solid #3D2E6A">
        <p style="margin:0 0 4px;color:#F1EEFF;font-weight:700;font-size:16px">${fmtUsd(r.amount)}</p>
        <a href="${r.url}" style="color:#9B6DFF;font-size:11px;text-decoration:none">abrir dashboard →</a>
      </td>
    </tr>
  `).join('');

  const body = `
    <p style="color:#F1EEFF;font-size:14px;line-height:1.6;margin:0 0 20px">
      Activaste plan para <strong>${businessName}</strong>${agentName ? ` (empleado <strong>${agentName}</strong>)` : ''}.
      Antes de que arranquen las llamadas, agrega el saldo del primer mes en cada plataforma.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1D1141;border:1px solid #3D2E6A;border-radius:8px;margin:0 0 20px">
      <tr>
        <td style="padding:12px 16px;background:#2A1B5C;border-bottom:1px solid #3D2E6A" colspan="2">
          <p style="margin:0;color:#9B6DFF;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em">Cliente</p>
          <p style="margin:4px 0 0;color:#F1EEFF;font-size:13px">${businessName} — ${portalEmail}</p>
          <p style="margin:4px 0 0;color:#C8BEE8;font-size:12px">${jornadaLabel} · ${tierLabel} · ${minutes} min + ${aiOps} ops/mes</p>
        </td>
      </tr>
      ${rowsHtml}
      <tr>
        <td style="padding:16px;background:rgba(155,109,255,0.08);border-top:2px solid #9B6DFF">
          <p style="margin:0;color:#F1EEFF;font-weight:700;font-size:15px">TOTAL a agregar</p>
        </td>
        <td style="padding:16px;background:rgba(155,109,255,0.08);border-top:2px solid #9B6DFF;text-align:right">
          <p style="margin:0;color:#9B6DFF;font-weight:700;font-size:20px">${fmtUsd(total)}</p>
          <p style="margin:2px 0 0;color:#C8BEE8;font-size:11px">≈ ${fmtMxn(total * MXN_PER_USD)} (TC ${MXN_PER_USD})</p>
        </td>
      </tr>
    </table>

    <p style="color:#8C7FB8;font-size:12px;line-height:1.5;margin:0">
      Incluye buffer del 30% sobre consumo estimado. Vapi tarda 1-2h en reflejar la recarga, Anthropic hasta 24h en cuentas nuevas — no dejes esto para el último momento.
    </p>
  `;

  await sendEmail({
    to:      'hola@centinelia.mx',
    subject,
    html:    shell(body),
  });
}
