/**
 * One-shot notification: manda email a cada org con al menos un agente que
 * quedó en auto_mode='auto' explicando el cambio de comportamiento.
 *
 * Idempotente por organizations.auto_mode_notified_at.
 *
 * Ejecutar: npx tsx scripts/notify-auto-mode-migration.ts
 *   --dry-run  → solo cuenta, no envía
 */

import './_bootstrap';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../src/lib/email/send.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Org {
  portal_email:          string;
  name:                  string | null;
  auto_mode_notified_at: string | null;
}

interface Agent {
  id:            string;
  agent_name:    string;
  business_name: string;
  portal_email:  string;
  portal_token:  string;
}

async function run(): Promise<void> {
  // Orgs que aún no han sido notificadas
  const { data: orgs, error: orgsErr } = await supabase
    .from('organizations')
    .select('portal_email, name, auto_mode_notified_at')
    .is('auto_mode_notified_at', null);

  if (orgsErr) { console.error('Orgs query failed:', orgsErr); process.exit(1); }
  if (!orgs || orgs.length === 0) {
    console.log('No orgs pending notification.');
    process.exit(0);
  }

  // Filtrar solo las que tienen al menos 1 agente en auto_mode='auto'
  const { data: autoAgents, error: agErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, portal_token')
    .eq('auto_mode', 'auto')
    .in('portal_email', orgs.map(o => o.portal_email));

  if (agErr) { console.error('Agents query failed:', agErr); process.exit(1); }

  const agentsByEmail = new Map<string, Agent[]>();
  for (const a of (autoAgents ?? []) as Agent[]) {
    const list = agentsByEmail.get(a.portal_email) ?? [];
    list.push(a);
    agentsByEmail.set(a.portal_email, list);
  }

  const orgsToNotify = (orgs as Org[]).filter(o => agentsByEmail.has(o.portal_email));

  console.log(`Notification plan (${DRY_RUN ? 'DRY RUN' : 'APPLY'}):`);
  console.log(`  Orgs to notify: ${orgsToNotify.length} of ${orgs.length} eligible`);

  if (DRY_RUN) {
    for (const o of orgsToNotify.slice(0, 5)) {
      console.log(`  - ${o.portal_email} (${agentsByEmail.get(o.portal_email)?.length ?? 0} agentes)`);
    }
    process.exit(0);
  }

  let sent = 0;
  for (const org of orgsToNotify) {
    const agents = agentsByEmail.get(org.portal_email) ?? [];
    const firstAgent = agents[0];
    if (!firstAgent) continue;

    const portalUrl = `${BASE_URL}/portal/${firstAgent.portal_token}/oficina/bandeja`;

    try {
      await sendEmail({
        to:      org.portal_email,
        subject: `Cambio importante: red de seguridad en respuestas automáticas`,
        html:    migrationEmailHtml({
          orgName:    org.name ?? firstAgent.business_name,
          agentNames: agents.map(a => a.agent_name),
          portalUrl,
        }),
      });

      await supabase
        .from('organizations')
        .update({ auto_mode_notified_at: new Date().toISOString() })
        .eq('portal_email', org.portal_email);

      sent++;
    } catch (err) {
      console.error(`Send failed for ${org.portal_email}:`, err);
    }
  }

  console.log(`\nSent ${sent} of ${orgsToNotify.length}.`);
  process.exit(0);
}

function migrationEmailHtml(args: { orgName: string; agentNames: string[]; portalUrl: string }): string {
  const agentList = args.agentNames.map(n => `<li>${n}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAFBFF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid rgba(108,59,255,0.12);border-radius:12px;padding:28px">
      <h1 style="color:#1A0A3B;font-size:20px;font-weight:700;margin:0 0 12px">Hemos mejorado cómo responden tus empleados</h1>
      <p style="color:#1A0A3B;font-size:14px;line-height:1.6;margin:0 0 16px">
        Hola ${escapeHtml(args.orgName)},
      </p>
      <p style="color:#1A0A3B;font-size:14px;line-height:1.6;margin:0 0 16px">
        Tus empleados ya no envían todas las respuestas automáticamente. Ahora una capa adicional revisa cada correo antes de mandar: los rutinarios se envían solos, los que involucran compromisos, quejas o datos delicados esperan tu OK.
      </p>
      <p style="color:#1A0A3B;font-size:14px;line-height:1.6;margin:0 0 8px"><strong>Empleados afectados:</strong></p>
      <ul style="color:#1A0A3B;font-size:14px;line-height:1.6;margin:0 0 20px;padding-left:20px">${agentList}</ul>
      <p style="color:#1A0A3B;font-size:14px;line-height:1.6;margin:0 0 16px">
        Si prefieres volver al comportamiento anterior (enviar todo sin revisar), puedes cambiar el modo en el portal a "Automático". Si prefieres revisar todo antes de enviar, elige "Manual".
      </p>
      <div style="text-align:center;margin-top:24px">
        <a href="${args.portalUrl}" style="display:inline-block;background:linear-gradient(135deg,#6C3BFF,#9B6DFF);color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:10px">Configurar en el portal</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

void run();
