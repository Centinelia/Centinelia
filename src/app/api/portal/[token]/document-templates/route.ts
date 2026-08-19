import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

// document_templates es org-level desde 2026-08-19: templates viven por
// (portal_email, tipo). No hay guard de rol porque el config lo edita el owner
// del portal para toda la org, no un meerkat en particular.

const ALLOWED_TIPOS = new Set(['propuesta', 'cotizacion', 'one_pager', 'correo']);
const MAX_SIZE      = 5 * 1024 * 1024; // 5 MB
const DOCX_MIME     = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface GuardOk {
  portalEmail: string;
  supabase:    ReturnType<typeof createAdminClient>;
}
interface GuardFail { error: string; status: 401 | 403 }

async function guardSession(req: NextRequest): Promise<GuardOk | GuardFail> {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session)              return { error: 'unauthorized', status: 401 };
  if (!session.portalEmail)  return { error: 'forbidden',    status: 403 };
  return { portalEmail: session.portalEmail, supabase: createAdminClient() };
}

// ── GET /api/portal/[token]/document-templates ───────────────────────────────
export async function GET(req: NextRequest) {
  const g = await guardSession(req);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data } = await g.supabase
    .from('document_templates')
    .select('tipo, filename, uploaded_at')
    .eq('portal_email', g.portalEmail);

  return NextResponse.json({ templates: data ?? [] });
}

// ── POST /api/portal/[token]/document-templates?tipo=Y ───────────────────────
export async function POST(req: NextRequest) {
  const tipo = new URL(req.url).searchParams.get('tipo');
  if (!tipo || !ALLOWED_TIPOS.has(tipo)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const g = await guardSession(req);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const form = await req.formData();
  const file  = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'missing_file' }, { status: 400 });
  if (file.size > MAX_SIZE)    return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  if (file.type !== DOCX_MIME) return NextResponse.json({ error: 'invalid_type' }, { status: 400 });

  // Storage key by portal_email (sanitized) para separar por org sin
  // depender de un agent_id específico.
  const orgKey      = g.portalEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `orgs/${orgKey}/templates/${tipo}.docx`;
  const buffer      = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await g.supabase.storage
    .from('agent-documents')
    .upload(storagePath, buffer, { contentType: DOCX_MIME, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { error: dbErr } = await g.supabase
    .from('document_templates')
    .upsert(
      { portal_email: g.portalEmail, tipo, storage_path: storagePath, filename: file.name, uploaded_at: new Date().toISOString() },
      { onConflict: 'portal_email,tipo' }
    );
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, storage_path: storagePath });
}

// ── DELETE /api/portal/[token]/document-templates?tipo=Y ─────────────────────
export async function DELETE(req: NextRequest) {
  const tipo = new URL(req.url).searchParams.get('tipo');
  if (!tipo || !ALLOWED_TIPOS.has(tipo)) {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const g = await guardSession(req);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const orgKey      = g.portalEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `orgs/${orgKey}/templates/${tipo}.docx`;

  const { error: rmErr } = await g.supabase.storage.from('agent-documents').remove([storagePath]);
  if (rmErr && !/not found|no rows/i.test(rmErr.message)) {
    return NextResponse.json({ error: rmErr.message }, { status: 500 });
  }

  const { error: dbErr } = await g.supabase.from('document_templates').delete().eq('portal_email', g.portalEmail).eq('tipo', tipo);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
