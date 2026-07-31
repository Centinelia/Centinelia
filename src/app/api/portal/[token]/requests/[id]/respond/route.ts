import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchHumanRequestNotification } from '@/lib/human-handoff/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Params { params: Promise<{ token: string; id: string }> }

const BUCKET = 'human-request-files';

export async function PATCH(req: NextRequest, { params }: Params) {
  const { token, id } = await params;
  const supabase = createAdminClient();

  // Ownership: token → agent_id → request.agent_id
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_token', token)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: request } = await supabase
    .from('human_requests')
    .select('id, agent_id, source_inbox_id, source_channel, source_call_id, source_context, request_type, title, description, urgency, needed_by, status, target_email')
    .eq('id', id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (request.agent_id !== agent.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (request.status !== 'pending' && request.status !== 'escalated') {
    return NextResponse.json({ ok: true, alreadyProcessed: true, status: request.status });
  }

  const body = await req.json().catch(() => ({})) as {
    response_text?:      string;
    response_files?:     { name: string; base64: string; mime_type: string }[];
    response_action?:    'done' | 'cannot_do' | 'partial';
    cancel?:             boolean;
    redirect_to_email?:  string;
    redirect_note?:      string;
  };

  // Redirect flow
  if (body.redirect_to_email) {
    const targetNew = body.redirect_to_email.trim().toLowerCase();
    if (targetNew === request.target_email.toLowerCase()) {
      return NextResponse.json({ error: 'no_self_redirect' }, { status: 400 });
    }
    // Chain check: máx 3 redirects (misma source_inbox_id)
    if (request.source_inbox_id) {
      const { count } = await supabase
        .from('human_requests')
        .select('*', { count: 'exact', head: true })
        .eq('source_inbox_id', request.source_inbox_id);
      if ((count ?? 0) >= 3) {
        // Force cancel de la actual, no INSERT new
        await supabase.from('human_requests').update({
          status: 'cancelled',
          cancellation_reason: 'redirect_chain_limit',
          cancelled_at: new Date().toISOString(),
        }).eq('id', id);
        return NextResponse.json({ error: 'redirect_chain_limit' }, { status: 400 });
      }
    }
    // Cancel current
    await supabase.from('human_requests').update({
      status: 'cancelled',
      cancellation_reason: `redirected_to:${targetNew}`,
      cancelled_at: new Date().toISOString(),
    }).eq('id', id);

    // Insert new
    const newDescription = body.redirect_note
      ? `${request.description}\n\n--- Redirigido desde ${request.target_email} con nota:\n${body.redirect_note}`
      : `${request.description}\n\n--- Redirigido desde ${request.target_email}`;

    const { data: newRow } = await supabase.from('human_requests').insert({
      agent_id:        request.agent_id,
      source_channel:  request.source_channel,
      source_inbox_id: request.source_inbox_id,
      source_call_id:  request.source_call_id,
      source_context:  request.source_context,
      request_type:    request.request_type,
      title:           request.title,
      description:     newDescription.slice(0, 2000),
      urgency:         request.urgency,
      needed_by:       request.needed_by,
      target_email:    targetNew,
      target_type:     'specific',
      status:          'pending',
    }).select('id').single();

    if (newRow) {
      void dispatchHumanRequestNotification(newRow.id).catch(err =>
        console.error('[respond] redirect notify failed:', err)
      );
    }

    return NextResponse.json({ ok: true, redirected_to: targetNew, new_request_id: newRow?.id });
  }

  // Cancel flow
  if (body.cancel) {
    await supabase.from('human_requests').update({
      status: 'cancelled',
      cancellation_reason: 'unable_to_help',
      cancelled_at: new Date().toISOString(),
    }).eq('id', id);
    // Trigger resume with "cannot help" context
    after(async () => {
      const { resumeAgentAfterHumanResponse } = await import('@/lib/human-handoff/resume');
      await resumeAgentAfterHumanResponse(id).catch(err => console.error('[respond] resume failed:', err));
    });
    return NextResponse.json({ ok: true, cancelled: true });
  }

  // Normal response
  const responseText = typeof body.response_text === 'string' ? body.response_text.slice(0, 4000) : null;
  const responseAction = body.response_action ?? null;

  // Upload files to Storage
  const uploadedFiles: { name: string; url: string; mime_type: string; size: number }[] = [];
  for (const f of body.response_files ?? []) {
    const path = `${id}/${Date.now()}-${f.name.replace(/[^a-z0-9._-]/gi, '_')}`;
    const buffer = Buffer.from(f.base64, 'base64');
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType: f.mime_type,
      upsert: false,
    });
    if (upErr) {
      console.error('[respond] upload failed:', upErr);
      return NextResponse.json({ error: 'upload_failed', detail: upErr.message }, { status: 500 });
    }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30); // 30d
    uploadedFiles.push({ name: f.name, url: signed?.signedUrl ?? path, mime_type: f.mime_type, size: buffer.length });
  }

  const { error: updErr } = await supabase.from('human_requests').update({
    status:          'responded',
    response_text:   responseText,
    response_files:  uploadedFiles,
    response_action: responseAction,
    responded_at:    new Date().toISOString(),
  }).eq('id', id);

  if (updErr) {
    console.error('[respond] update failed:', updErr);
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  // Trigger resume (non-blocking, via after)
  after(async () => {
    const { resumeAgentAfterHumanResponse } = await import('@/lib/human-handoff/resume');
    await resumeAgentAfterHumanResponse(id).catch(err => console.error('[respond] resume failed:', err));
  });

  return NextResponse.json({ ok: true, uploaded: uploadedFiles.length });
}
