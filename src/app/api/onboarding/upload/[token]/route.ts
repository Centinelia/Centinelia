import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: instance } = await supabase
    .from('onboarding_instances')
    .select('id, agent_id')
    .eq('submit_token', token)
    .single();

  if (!instance) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fd   = await req.formData();
  const file = fd.get('file') as File | null;
  const name = fd.get('name') as string | null;

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext      = file.name.split('.').pop() ?? 'bin';
  const path     = `onboarding/${instance.id}/${Date.now()}-${(name ?? file.name).replace(/\s+/g, '_')}.${ext}`;
  const buffer   = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage
    .from('agent-files')
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('agent-files').getPublicUrl(path);

  return NextResponse.json({ ok: true, url: publicUrl });
}
