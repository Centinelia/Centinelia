import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getAgentAccess } from '@/lib/portal/agent-access';
import { getAccessibleDatabases } from '@/lib/notion/client';

interface Params { params: Promise<{ token: string }> }

/**
 * GET /api/portal/[token]/contacts/import/sources
 *
 * Enumera fuentes de datos conectadas de las que se puede importar contactos.
 * Devuelve por proveedor: si está conectado y las opciones (databases,
 * mappings, etc.) para que el usuario elija cuál usar en el modal.
 *
 * Actualmente soporta:
 *   - notion: databases accesibles vía OAuth
 *   - sheets: mappings existentes (por tipo de dato: leads/citas/pedidos)
 */
export async function GET(req: NextRequest, { params }: Params) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const access = await getAgentAccess(token, req);
  if (!access) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  if (session.portalEmail && access.portalEmail !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();

  // Notion es org-level desde 2026-08-09 (vive en organizations)
  const { data: orgNotion } = await supabase
    .from('organizations')
    .select('notion_access_token')
    .eq('portal_email', access.portalEmail)
    .maybeSingle();

  let notionDatabases: Array<{ id: string; title: string; properties: Record<string, { type: string; name: string }> }> = [];
  const notionConnected = !!orgNotion?.notion_access_token;
  if (notionConnected) {
    try {
      notionDatabases = await getAccessibleDatabases(orgNotion!.notion_access_token as string);
    } catch (err) {
      console.error('[import/sources] Notion databases fetch failed', err);
    }
  }

  // Sheets: lista mappings existentes (per portal_email)
  const { data: sheetsMappings } = await supabase
    .from('sheets_mappings')
    .select('id, purpose, custom_purpose_label, spreadsheet_id, tab_name, headers')
    .eq('portal_email', access.portalEmail);
  const sheetsConnected = (sheetsMappings ?? []).length > 0;

  return NextResponse.json({
    notion: {
      connected: notionConnected,
      databases: notionDatabases,
    },
    sheets: {
      connected: sheetsConnected,
      mappings:  sheetsMappings ?? [],
    },
  });
}
