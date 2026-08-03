/**
 * Email HTML para aprobación de plan de tarea. Magic link con token.
 * Usa el shell premium compartido de src/lib/email/send.ts (mismo look que
 * heartbeat, weekly-insights, Nox check-in) + identidad meerkat del target.
 */
import type { TaskPlan } from './task-plan';
import { shell, badge, heading, infoCard, sectionLabel, btn, mdToEmailHtml, type MeerkatIdentity } from '@/lib/email/send';

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

    ${btn('Aprobar y ejecutar', approveUrl, { primary: true, color: '#22c55e' })}
    ${btn('Editar / mandar correcciones', editUrl, { primary: false })}
    ${btn('Rechazar', rejectUrl, { primary: false })}

    <p style="color:#8C7FB8;font-size:12px;line-height:1.6;margin:20px 0 0;text-align:center">
      Si apruebas, ${escape(targetAgent)} empieza en los próximos minutos.<br>
      Si editas, puedes agregar notas o correcciones antes de que ejecute.<br>
      Si rechazas, la tarea queda cancelada.
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
