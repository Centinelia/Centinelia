import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { MEERKAT_TOOL_ACCESS, type MeerkatRoleId } from '@/lib/creativity/meerkat-gates';

export const dynamic = 'force-dynamic';

// Roles que tienen acceso a al menos una tool de creatividad
const CREATIVITY_ROLES = new Set<string>(
  (Object.values(MEERKAT_TOOL_ACCESS) as MeerkatRoleId[][]).flat()
);

const ALLOWED_TIPOS = new Set(['propuesta', 'cotizacion', 'one_pager', 'correo']);
const MAX_SIZE      = 5 * 1024 * 1024; // 5 MB
const DOCX_MIME     = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface GuardOk {
  agent:    { id: string; portal_email: string; features: unknown };
  supabase: ReturnType<typeof createAdminClient>;
}
interface GuardFail { error: string; status: 401 | 403 | 400 }

async function guardAgent(req: NextRequest, agentId: string): Promise<GuardOk | GuardFail> {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return { error: 'unauthorized', status: 401 };

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, portal_email, features')
    .eq('id', agentId)
    .maybeSingle();

  if (!agent) return { error: 'forbidden', status: 403 };

  // IDOR guard
  if (agent.portal_email !== session.portalEmail) return { error: 'forbidden', status: 403 };

  // Role guard: solo roles con acceso a al menos una tool de creatividad
  const roleId = (agent.features as Record<string, unknown> | null)?.meerkat_role_id as string | undefined;
  if (!roleId || !CREATIVITY_ROLES.has(roleId)) return { error: 'role_not_allowed', status: 400 };

  return { agent, supabase };
}

// ── GET /api/portal/[token]/document-templates?agent_id=X ────────────────────
export async function GET(req: NextRequest) {
  const agentId = new URL(req.url).searchParams.get('agent_id');
  if (!agentId) return NextResponse.json({ error: 'missing_agent_id' }, { status: 400 });

  const g = await guardAgent(req, agentId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data } = await g.supabase
    .from('document_templates')
    .select('tipo, filename, uploaded_at')
    .eq('agent_id', agentId);

  return NextResponse.json({ templates: data ?? [] });
}

// ── POST /api/portal/[token]/document-templates?agent_id=X&tipo=Y ────────────
export async function POST(req: NextRequest) {
  const url     = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');
  const tipo    = url.searchParams.get('tipo');

  if (!agentId || !tipo || !ALLOWED_TIPOS.has(tipo)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const g = await guardAgent(req, agentId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const form = await req.formData();
  const file  = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  if (file.size > MAX_SIZE)    return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  if (file.type !== DOCX_MIME) return NextResponse.json({ error: 'invalid_type' }, { status: 400 });

  const storagePath = `${agentId}/templates/${tipo}.docx`;
  const buffer      = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await g.supabase.storage
    .from('agent-documents')
    .upload(storagePath, buffer, { contentType: DOCX_MIME, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: dbErr } = await g.supabase
    .from('document_templates')
    .upsert(
      { agent_id: agentId, tipo, storage_path: storagePath, filename: file.name, uploaded_at: new Date().toISOString() },
      { onConflict: 'agent_id,tipo' }
    );
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, storage_path: storagePath });
}

// ── DELETE /api/portal/[token]/document-templates?agent_id=X&tipo=Y ──────────
export async function DELETE(req: NextRequest) {
  const url     = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');
  const tipo    = url.searchParams.get('tipo');

  if (!agentId || !tipo || !ALLOWED_TIPOS.has(tipo)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const g = await guardAgent(req, agentId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const storagePath = `${agentId}/templates/${tipo}.docx`;

  await g.supabase.storage.from('agent-documents').remove([storagePath]);
  await g.supabase.from('document_templates').delete().eq('agent_id', agentId).eq('tipo', tipo);

  return NextResponse.json({ ok: true });
}
