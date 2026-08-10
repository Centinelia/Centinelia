import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { notionClient, createCrmDatabase, createProductDatabase, getAccessiblePages } from '@/lib/notion/client';

interface Params { params: Promise<{ token: string }> }

/**
 * Notion es una integración ORG-LEVEL: vive en `organizations`, compartida
 * por todos los empleados de la cuenta. Antes vivía per-agent en
 * voice_agents (deuda técnica cerrada 2026-08-09).
 */
async function resolveOrg(token: string) {
  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null; business_name: string }>(token, 'id, portal_email, business_name', supabase);
  if (!agent?.portal_email) return { supabase, agent, org: null };
  const { data: org } = await supabase
    .from('organizations')
    .select('notion_access_token, notion_workspace_name, notion_db_id, notion_products_db_id')
    .eq('portal_email', agent.portal_email)
    .maybeSingle();
  return { supabase, agent, org };
}

// GET — status + available pages (when connected but db not set)
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agent, org } = await resolveOrg(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const connected = !!org?.notion_access_token;
  if (!connected) return NextResponse.json({ connected: false });

  let pages: { id: string; title: string }[] = [];
  if (!org?.notion_db_id) {
    pages = await getAccessiblePages(org!.notion_access_token as string).catch(() => []);
  }

  return NextResponse.json({
    connected:       true,
    workspace_name:  org?.notion_workspace_name,
    db_id:           org?.notion_db_id,
    products_db_id:  org?.notion_products_db_id ?? null,
    pages,
  });
}

// POST — create CRM database on selected page
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent, org } = await resolveOrg(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!org?.notion_access_token) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

  const { page_id } = await req.json() as { page_id: string };
  if (!page_id) return NextResponse.json({ error: 'Missing page_id' }, { status: 400 });

  const dbId = await createCrmDatabase(
    org.notion_access_token as string,
    page_id,
    agent.business_name,
  );

  await supabase.from('organizations')
    .update({ notion_db_id: dbId })
    .eq('portal_email', agent.portal_email);

  return NextResponse.json({ db_id: dbId });
}

// PATCH — create product catalog in Notion (uses same parent page as CRM DB)
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent, org } = await resolveOrg(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!org?.notion_access_token) return NextResponse.json({ error: 'Notion no conectado' }, { status: 400 });
  if (!org?.notion_db_id) return NextResponse.json({ error: 'Primero crea el CRM de Notion' }, { status: 400 });

  try {
    const notion = notionClient(org.notion_access_token as string);

    // Get parent page of the existing CRM database
    const dbInfo       = await notion.databases.retrieve({ database_id: org.notion_db_id as string });
    const parentPageId = (dbInfo as any)?.parent?.page_id as string | undefined;
    if (!parentPageId) return NextResponse.json({ error: 'No se pudo obtener la página padre del CRM' }, { status: 500 });

    const productsDbId = await createProductDatabase(org.notion_access_token as string, parentPageId);

    await supabase.from('organizations')
      .update({ notion_products_db_id: productsDbId })
      .eq('portal_email', agent.portal_email);

    return NextResponse.json({ ok: true, products_db_id: productsDbId });
  } catch (err) {
    console.error('[notion/products] PATCH error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE — disconnect Notion
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, agent } = await resolveOrg(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await supabase.from('organizations').update({
    notion_access_token:    null,
    notion_workspace_name:  null,
    notion_db_id:           null,
    notion_products_db_id:  null,
  }).eq('portal_email', agent.portal_email);

  return NextResponse.json({ ok: true });
}
