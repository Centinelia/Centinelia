import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createCrmDatabase, createProductDatabase, getAccessiblePages } from '@/lib/notion/client';

interface Params { params: Promise<{ token: string }> }

async function getAgent(token: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('voice_agents')
    .select('id, portal_email, business_name, notion_access_token, notion_workspace_name, notion_db_id, features')
    .eq('portal_token', token)
    .single();
  return data;
}

// GET — status + available pages (when connected but db not set)
export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agent = await getAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const connected = !!agent.notion_access_token;
  if (!connected) return NextResponse.json({ connected: false });

  let pages: { id: string; title: string }[] = [];
  if (!agent.notion_db_id) {
    pages = await getAccessiblePages(agent.notion_access_token as string).catch(() => []);
  }

  const productsDbId = ((agent.features as Record<string, unknown>)?.notion_products_db_id as string | null) ?? null;

  return NextResponse.json({
    connected:       true,
    workspace_name:  agent.notion_workspace_name,
    db_id:           agent.notion_db_id,
    products_db_id:  productsDbId,
    pages,
  });
}

// POST — create CRM database on selected page
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agent = await getAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!agent.notion_access_token) return NextResponse.json({ error: 'Not connected' }, { status: 400 });

  const { page_id } = await req.json() as { page_id: string };
  if (!page_id) return NextResponse.json({ error: 'Missing page_id' }, { status: 400 });

  const dbId = await createCrmDatabase(
    agent.notion_access_token as string,
    page_id,
    agent.business_name,
  );

  const supabase = createAdminClient();
  await supabase.from('voice_agents')
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

  const agent = await getAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!agent.notion_access_token) return NextResponse.json({ error: 'Notion no conectado' }, { status: 400 });
  if (!agent.notion_db_id) return NextResponse.json({ error: 'Primero crea el CRM de Notion' }, { status: 400 });

  const supabase = createAdminClient();
  const notion   = (await import('@/lib/notion/client')).notionClient(agent.notion_access_token as string);

  // Get parent page of the existing CRM database
  const dbInfo = await (notion.databases.retrieve as any)({ database_id: agent.notion_db_id });
  const parentPageId = (dbInfo as any)?.parent?.page_id as string | undefined;
  if (!parentPageId) return NextResponse.json({ error: 'No se pudo obtener la página padre del CRM' }, { status: 500 });

  const productsDbId = await createProductDatabase(agent.notion_access_token as string, parentPageId);

  const existing = (agent.features as Record<string, unknown>) ?? {};
  await supabase.from('voice_agents')
    .update({ features: { ...existing, notion_products_db_id: productsDbId } })
    .eq('portal_email', agent.portal_email);

  return NextResponse.json({ ok: true, products_db_id: productsDbId });
}

// DELETE — disconnect Notion
export async function DELETE(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agent = await getAgent(token);
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const supabase = createAdminClient();
  await supabase.from('voice_agents').update({
    notion_access_token:   null,
    notion_workspace_id:   null,
    notion_workspace_name: null,
    notion_db_id:          null,
  }).eq('portal_email', agent.portal_email);

  return NextResponse.json({ ok: true });
}
