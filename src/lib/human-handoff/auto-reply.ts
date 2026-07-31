// src/lib/human-handoff/auto-reply.ts
import { shell, badge, heading, infoCard, btn, sectionLabel } from '@/lib/email/send';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

const STATUS_LABELS: Record<string, string> = {
  responded: 'respondida por otro miembro del equipo',
  cancelled: 'cancelada',
  timeout:   'cerrada por falta de respuesta',
};

export function buildStaleReplyHtml(opts: {
  agentName:     string;
  requestTitle:  string;
  status:        'responded' | 'cancelled' | 'timeout';
  respondedAt:   Date;
  portalUrl:     string;
}): string {
  const label = STATUS_LABELS[opts.status] ?? 'cerrada';
  const fecha = opts.respondedAt.toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return shell(
    badge('Solicitud ya procesada', '#8C7FB8') +
    heading(opts.agentName, 'Tu respuesta llegó, pero ya no era necesaria') +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 16px">
      Gracias por responder. Esta solicitud ya fue <strong style="color:#F1EEFF">${label}</strong> el ${fecha}.
    </p>` +
    infoCard(`
      ${sectionLabel('Solicitud original')}
      <p style="color:#F1EEFF;font-size:14px;margin:0;line-height:1.6">${opts.requestTitle}</p>
    `) +
    `<p style="color:#C8BEE8;font-size:13px;line-height:1.7;margin:16px 0 0">
      Si necesitas dar seguimiento, entra al portal.
    </p>` +
    btn('Ver en el portal', opts.portalUrl)
  );
}

export { BASE_URL };
