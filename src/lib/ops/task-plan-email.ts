/**
 * Email HTML para aprobación de plan de tarea. Magic link con token.
 */
import type { TaskPlan } from './task-plan';

export function planApprovalEmailHtml(args: {
  businessName:  string;
  targetAgent:   string;
  callerAgent?:  string | null;
  plan:          TaskPlan;
  approveUrl:    string;
  rejectUrl:     string;
  taskTitle:     string;
}): string {
  const { businessName, targetAgent, callerAgent, plan, approveUrl, rejectUrl, taskTitle } = args;

  const steps = plan.steps.map(s => `
    <li style="margin:0 0 8px;color:#1a0a3b;line-height:1.5;">
      <strong style="color:#6c3bff;">${s.n}.</strong> ${escapeHtml(s.description)}
      ${s.tool_hint ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">↳ Usará: ${escapeHtml(s.tool_hint)}</div>` : ''}
    </li>
  `).join('');

  const risks = plan.risks.length
    ? `<div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 14px;margin:16px 0;border-radius:4px;">
        <div style="font-size:11px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Riesgos que ${targetAgent} identificó</div>
        <ul style="margin:0;padding-left:18px;color:#78350f;font-size:13px;line-height:1.5;">
          ${plan.risks.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const assets = plan.assets.length
    ? `<div style="margin:16px 0;">
        <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Entregables</div>
        <ul style="margin:0;padding-left:18px;color:#1a0a3b;font-size:13px;line-height:1.5;">
          ${plan.assets.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafbff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

        <tr><td style="padding:24px 28px 8px;">
          <div style="font-size:11px;font-weight:600;color:#6c3bff;text-transform:uppercase;letter-spacing:0.08em;">Aprobación de plan</div>
          <h1 style="margin:6px 0 2px;font-size:22px;font-weight:600;color:#1a0a3b;">${escapeHtml(targetAgent)} necesita tu aprobación</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
            ${callerAgent ? `Delegada por ${escapeHtml(callerAgent)} · ` : ''}Negocio: ${escapeHtml(businessName)}
          </p>
        </td></tr>

        <tr><td style="padding:16px 28px 0;">
          <div style="background:#f5f3ff;border-left:3px solid #6c3bff;padding:12px 14px;border-radius:4px;">
            <div style="font-size:11px;font-weight:600;color:#6c3bff;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Tarea</div>
            <div style="font-size:14px;color:#1a0a3b;line-height:1.5;">${escapeHtml(taskTitle)}</div>
          </div>
        </td></tr>

        <tr><td style="padding:16px 28px 0;">
          <p style="margin:0 0 6px;font-size:14px;color:#1a0a3b;line-height:1.5;">
            <strong>Plan que va a ejecutar:</strong>
          </p>
          <p style="margin:0 0 12px;font-size:13px;color:#374151;font-style:italic;line-height:1.5;">
            ${escapeHtml(plan.summary)}
          </p>
          <ol style="margin:0 0 8px;padding-left:0;list-style:none;">
            ${steps}
          </ol>
          ${assets}
          <div style="background:#f3f4f6;padding:10px 12px;border-radius:6px;margin-top:12px;">
            <div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">Se considerará logrado cuando</div>
            <div style="font-size:13px;color:#1a0a3b;line-height:1.4;">${escapeHtml(plan.success_metric)}</div>
          </div>
          ${risks}
        </td></tr>

        <tr><td style="padding:20px 28px 24px;text-align:center;">
          <a href="${approveUrl}" style="display:inline-block;background:#6c3bff;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:14px;font-weight:600;margin:4px;">
            Aprobar y ejecutar
          </a>
          <a href="${rejectUrl}" style="display:inline-block;background:#ffffff;color:#6b7280;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:14px;font-weight:500;border:1px solid #e5e7eb;margin:4px;">
            Rechazar
          </a>
          <p style="margin:14px 0 0;font-size:11px;color:#9ca3af;line-height:1.5;">
            Si apruebas, ${escapeHtml(targetAgent)} empieza en los próximos minutos.<br/>
            Si rechazas, la tarea queda cancelada y puedes recrearla con instrucciones distintas.
          </p>
        </td></tr>

        <tr><td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Enviado por Centinelia · Este enlace es de un solo uso.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
