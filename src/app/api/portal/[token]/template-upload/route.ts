import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

const ALLOWED_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const formData  = await req.formData();
  const file      = formData.get('file') as File | null;
  const docType   = (formData.get('doc_type') as string | null) ?? 'factura';

  if (!file) return NextResponse.json({ error: 'No se recibio archivo' }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: 'Solo PDF o DOCX' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo no puede superar 10 MB' }, { status: 400 });

  const ext    = file.type === 'application/pdf' ? 'pdf' : 'docx';
  const path   = `plantillas/${agent.id}/${docType}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage
    .from('agent-documents')
    .upload(path, buffer, { upsert: true, contentType: file.type });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Store reference in features
  const existing  = (agent.features as Record<string, unknown>) ?? {};
  const configKey = `${docType}_config`;
  const prevCfg   = (existing[configKey] as Record<string, unknown>) ?? {};
  const merged    = {
    ...existing,
    [configKey]: { ...prevCfg, template_path: path, template_name: file.name, template_ext: ext },
  };

  await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);

  const { data: signed } = await supabase.storage
    .from('agent-documents')
    .createSignedUrl(path, 3600);

  return NextResponse.json({ ok: true, path, name: file.name, ext, url: signed?.signedUrl ?? null });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token }  = await params;
  const { doc_type: docType } = await req.json() as { doc_type: string };
  const supabase   = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('id, features').eq('portal_token', token).single();
  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing  = (agent.features as Record<string, unknown>) ?? {};
  const configKey = `${docType}_config`;
  const prevCfg   = (existing[configKey] as Record<string, unknown>) ?? {};
  const path      = prevCfg.template_path as string | undefined;

  if (path) {
    await supabase.storage.from('agent-documents').remove([path]);
  }

  const { template_path: _p, template_name: _n, template_ext: _e, ...restCfg } = prevCfg;
  const merged = { ...existing, [configKey]: restCfg };
  await supabase.from('voice_agents').update({ features: merged }).eq('id', agent.id);

  return NextResponse.json({ ok: true });
}
