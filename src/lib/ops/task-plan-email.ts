/**
 * Email HTML para aprobación de plan de tarea. Magic link con token.
 * Usa el shell premium compartido de src/lib/email/send.ts (mismo look que
 * heartbeat, weekly-insights, Nox check-in) + identidad meerkat del target.
 */
import type { TaskPlan } from './task-plan';
import { shell, badge, heading, infoCard, sectionLabel, mdToEmailHtml, type MeerkatIdentity } from '@/lib/email/send';

/**
 * Bloque de 3 CTAs con jerarquía visual clara:
 *   - PRIMARY:   Aprobar (verde, sólido, grande)
 *   - SECONDARY: Editar (borde violeta, medio)
 *   - TERTIARY:  Rechazar (link rojo, chico, sin borde)
 * Layout responsive vía tabla (aguanta Gmail/Outlook/mobile).
 */
function actionButtons(approveUrl: string, editUrl: string, rejectUrl: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 8px">
    <tr>
      <td align="center" style="padding:0 0 12px">
        <a href="${approveUrl}" style="display:inline-block;background:linear-gradient(135deg,#22c55e,#4ade80);background-color:#22c55e;color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:12px;box-shadow:0 4px 12px rgba(34,197,94,0.25);letter-spacing:0.02em">
          ✓ Aprobar y ejecutar
        </a>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0 0 12px">
        <a href="${editUrl}" style="display:inline-block;background:rgba(155,109,255,0.10);background-color:#2A1B5C;color:#C8B6FF;font-size:14px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;border:1.5px solid #9B6DFF">
          ✎ Editar o mandar correcciones
        </a>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:0">
        <a href="${rejectUrl}" style="display:inline-block;color:#F87171;font-size:13px;font-weight:500;text-decoration:none;padding:8px 16px;letter-spacing:0.02em">
          Rechazar tarea
        </a>
      </td>
    </tr>
  </table>`;
}

export function planApprovalEmailHtml(args: {
  businessName:  string;
  targetAgent:   string;
  targetMeerkat?: MeerkatIdentity;
  callerAgent?:  string | null;
  plan:          TaskPlan;
  approveUrl:    string;
  editUrl:       string;
  rejectUrl:     string;
  taskTitle:     string;
}): string {
  const { businessName, targetAgent, targetMeerkat, callerAgent, plan, approveUrl, editUrl, rejectUrl, taskTitle } = args;

  const stepsMd = plan.steps
    .map(s => `${s.n}. **${s.description}**${s.tool_hint ? `  \n_(usará: ${s.tool_hint})_` : ''}`)
    .join('\n\n');

  const assetsBlock = plan.assets.length
    ? `${sectionLabel('Entregables')}
       <ul style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 12px;padding-left:22px">
         ${plan.assets.map(a => `<li style="margin:0 0 4px">${escape(a)}</li>`).join('')}
       </ul>`
    : '';

  const risksBlock = plan.risks.length
    ? infoCard(`
        ${sectionLabel('Riesgos identificados')}
        <ul style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0;padding-left:22px">
          ${plan.risks.map(r => `<li style="margin:0 0 4px">${escape(r)}</li>`).join('')}
        </ul>
      `, true)
    : '';

  const body = `
    ${badge('Aprobación de plan')}
    ${heading(`${targetAgent} necesita tu aprobación`, callerAgent ? `Delegada por ${escape(callerAgent)} · ${escape(businessName)}` : escape(businessName))}

    ${infoCard(`
      ${sectionLabel('Tarea')}
      <p style="color:#F1EEFF;font-size:14px;line-height:1.5;margin:0">${escape(taskTitle)}</p>
    `, true)}

    ${infoCard(`
      ${sectionLabel('Plan que va a ejecutar')}
      <p style="color:#C8BEE8;font-size:14px;font-style:italic;line-height:1.6;margin:0 0 14px">${escape(plan.summary)}</p>
      <div>${mdToEmailHtml(stepsMd)}</div>
      ${assetsBlock}
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid #3D2E6A">
        ${sectionLabel('Se considerará logrado cuando')}
        <p style="color:#F1EEFF;font-size:14px;line-height:1.5;margin:0">${escape(plan.success_metric)}</p>
      </div>
    `)}

    ${risksBlock}

    ${actionButtons(approveUrl, editUrl, rejectUrl)}

    <p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:16px 0 0;text-align:center">
      Al aprobar, ${escape(targetAgent)} arranca de inmediato.
    </p>
  `;

  return shell(body, {
    meerkat:   targetMeerkat,
    preheader: `${targetAgent} pide tu ✓ para "${taskTitle.slice(0, 60)}"`,
  });
}

function escape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
