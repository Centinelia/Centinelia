import { notionClient } from '@/lib/notion/client';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { getOrgToken } from '@/lib/portal/org-token';

export interface SchemaViolation {
  page_id:    string;
  page_title: string;
  issues:     string[];
}

export interface ValidationResult {
  schema_id:      string;
  db_name:        string;
  notion_db_id:   string;
  total_entries:  number;
  violations:     SchemaViolation[];
  checked_at:     string;
}

export async function validateAgentDbs(agentId: string): Promise<ValidationResult[]> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_email, portal_email, portal_token')
    .eq('id', agentId)
    .single();

  if (!agent?.portal_email) return [];

  const { data: org } = await supabase
    .from('organizations')
    .select('notion_access_token')
    .eq('portal_email', agent.portal_email)
    .single();

  if (!org?.notion_access_token) return [];

  const { data: schemas } = await supabase
    .from('notion_db_schemas')
    .select('*')
    .eq('agent_id', agentId)
    .eq('active', true);

  if (!schemas?.length) return [];

  const results: ValidationResult[] = [];
  const notion = notionClient(org.notion_access_token as string);

  for (const schema of schemas) {
    const requiredProps  = (schema.required_props  as Array<{ name: string; type: string }>) ?? [];
    const allowedValues  = (schema.allowed_values  as Record<string, string[]>)              ?? {};
    const notionDbId     = schema.notion_db_id     as string;

    let allPages: any[] = [];
    let cursor: string | undefined;

    try {
      do {
        const res: any = await (notion as any).databases.query({
          database_id:   notionDbId,
          page_size:     100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        allPages = allPages.concat(res.results);
        cursor   = res.has_more ? res.next_cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.error(`[notion-validator] Error querying DB ${notionDbId}:`, err);
      continue;
    }

    const violations: SchemaViolation[] = [];

    for (const page of allPages) {
      const props  = page.properties ?? {};
      const title  = extractTitle(props);
      const issues: string[] = [];

      // Check required properties
      for (const req of requiredProps) {
        const prop = props[req.name];
        if (!prop || isEmpty(prop)) {
          issues.push(`Campo requerido vacío: "${req.name}"`);
        }
      }

      // Check allowed values for selects
      for (const [propName, allowed] of Object.entries(allowedValues)) {
        const prop = props[propName];
        if (!prop) continue;
        const val = extractSelectValue(prop);
        if (val && !allowed.includes(val)) {
          issues.push(`"${propName}" tiene valor no permitido: "${val}" (permitidos: ${allowed.join(', ')})`);
        }
      }

      if (issues.length) {
        violations.push({ page_id: page.id, page_title: title || 'Sin título', issues });
      }
    }

    const checkedAt = new Date().toISOString();
    results.push({
      schema_id:     schema.id as string,
      db_name:       schema.db_name as string,
      notion_db_id:  notionDbId,
      total_entries: allPages.length,
      violations,
      checked_at:    checkedAt,
    });

    // Persist results to the schema record
    await supabase
      .from('notion_db_schemas')
      .update({
        last_validated_at: checkedAt,
        last_violations:   violations,
      })
      .eq('id', schema.id);
  }

  return results;
}

export async function runValidationForAllAgents(): Promise<{ agentId: string; dbs: number; violations: number }[]> {
  const supabase = createAdminClient();

  const { data: agentIds } = await supabase
    .from('notion_db_schemas')
    .select('agent_id')
    .eq('active', true);

  const unique = [...new Set((agentIds ?? []).map(r => r.agent_id as string))];
  const summary: { agentId: string; dbs: number; violations: number }[] = [];

  for (const agentId of unique) {
    const results = await validateAgentDbs(agentId);
    const totalViolations = results.reduce((s, r) => s + r.violations.length, 0);

    summary.push({ agentId, dbs: results.length, violations: totalViolations });

    if (totalViolations > 0) {
      await sendValidationReport(agentId, results);
    }
  }

  return summary;
}

async function sendValidationReport(agentId: string, results: ValidationResult[]): Promise<void> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, client_email, portal_email, portal_token')
    .eq('id', agentId)
    .single();

  if (!agent?.client_email) return;

  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const orgToken  = agent.portal_email ? await getOrgToken(agent.portal_email as string, supabase) : null;
  const tokenForUrl = orgToken ?? (agent.portal_token as string | null);
  const portalUrl = tokenForUrl ? `${baseUrl}/portal/${tokenForUrl}?tab=integraciones` : baseUrl;

  const html = validationReportHtml({
    businessName: agent.business_name as string,
    results,
    portalUrl,
  });

  const totalViolations = results.reduce((s, r) => s + r.violations.length, 0);

  await sendEmail({
    to:      agent.client_email as string,
    subject: `Notion: ${totalViolations} entrada${totalViolations !== 1 ? 's' : ''} con problemas — ${agent.business_name}`,
    html,
  });
}

function extractTitle(props: Record<string, any>): string {
  for (const prop of Object.values(props)) {
    if (prop?.type === 'title' && prop.title?.[0]?.plain_text) {
      return prop.title[0].plain_text;
    }
  }
  return '';
}

function extractSelectValue(prop: any): string | null {
  if (prop?.type === 'select')       return prop.select?.name ?? null;
  if (prop?.type === 'status')       return prop.status?.name ?? null;
  if (prop?.type === 'multi_select') return prop.multi_select?.[0]?.name ?? null;
  return null;
}

function isEmpty(prop: any): boolean {
  switch (prop?.type) {
    case 'title':        return !prop.title?.[0]?.plain_text?.trim();
    case 'rich_text':    return !prop.rich_text?.[0]?.plain_text?.trim();
    case 'number':       return prop.number === null || prop.number === undefined;
    case 'select':       return !prop.select?.name;
    case 'status':       return !prop.status?.name;
    case 'date':         return !prop.date?.start;
    case 'email':        return !prop.email;
    case 'phone_number': return !prop.phone_number;
    case 'url':          return !prop.url;
    default:             return false;
  }
}

function validationReportHtml(opts: {
  businessName: string;
  results:      ValidationResult[];
  portalUrl:    string;
}): string {
  const { businessName, results, portalUrl } = opts;
  const BG     = '#120726';
  const CARD   = 'rgba(255,255,255,0.055)';
  const BORDER = 'rgba(255,255,255,0.10)';
  const TEXT   = '#e2e8f0';
  const SUB    = 'rgba(255,255,255,0.58)';
  const MUTE   = 'rgba(255,255,255,0.35)';
  const ACCENT = '#9B6DFF';
  const WARN   = '#f59e0b';
  const LOGO   = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx'}/logo-tagline.png`;

  const dbSections = results
    .filter(r => r.violations.length > 0)
    .map(r => `
    <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:16px;margin-bottom:12px">
      <p style="color:${WARN};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 10px">
        ${r.db_name} — ${r.violations.length} entrada${r.violations.length !== 1 ? 's' : ''} con problema${r.violations.length !== 1 ? 's' : ''}
      </p>
      ${r.violations.slice(0, 8).map(v => `
      <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <p style="color:${TEXT};font-size:13px;font-weight:600;margin:0 0 4px">${v.page_title}</p>
        ${v.issues.map(i => `<p style="color:${SUB};font-size:12px;margin:0 0 2px;padding-left:10px">• ${i}</p>`).join('')}
      </div>`).join('')}
      ${r.violations.length > 8 ? `<p style="color:${MUTE};font-size:12px;margin:0">...y ${r.violations.length - 8} más</p>` : ''}
    </div>`).join('');

  const clean = results.filter(r => r.violations.length === 0);
  const cleanSection = clean.length ? `
    <p style="color:${MUTE};font-size:12px;margin:12px 0 0">
      Sin problemas: ${clean.map(r => r.db_name).join(', ')}
    </p>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px 48px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;border-radius:16px 16px 0 0;border-bottom:1px solid rgba(108,59,255,0.15)">
      <tr>
        <td align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;background-color:#FFFFFF;padding:20px 32px">
          <img src="${LOGO}" alt="Centinelia" width="200" style="width:200px;height:auto;display:inline-block">
        </td>
      </tr>
    </table>
    <div style="background:${CARD};border:1px solid ${BORDER};border-top:none;border-radius:0 0 16px 16px;padding:32px">
      <div style="text-align:center;margin-bottom:20px">
        <span style="display:inline-block;background:${WARN}22;border:1px solid ${WARN}40;border-radius:20px;padding:6px 16px;color:${WARN};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Validación de Notion</span>
      </div>
      <h1 style="color:${TEXT};font-size:20px;font-weight:700;margin:0 0 6px;text-align:center">Bases de datos revisadas</h1>
      <p style="color:${SUB};font-size:13px;margin:0 0 24px;text-align:center">${businessName}</p>
      ${dbSections}
      ${cleanSection}
      <div style="text-align:center;margin-top:24px">
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
