import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { analyzeTemplate } from '@/lib/bitacora/template-analyzer';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Costo del análisis AI en tareas del pool. Ajustable si el margen cambia. */
export const BITACORA_TEMPLATE_UPLOAD_TASKS = 3;

/** Max file size 5MB — plantillas xlsx no suelen pasar de 1MB. */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const supabase = createAdminClient();

  // Primer agente activo para poder cobrar (consumeAiOp requiere agent_id).
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_email', resolved.portalEmail)
    .eq('active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: 'no active agent for org' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'file too large (max 5MB)' }, { status: 413 });

  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith('.xlsx') && !nameLower.endsWith('.xls')) {
    return NextResponse.json({ error: 'formato no soportado (usa .xlsx)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Analizar con Claude ANTES de cobrar/subir. Si falla, no cobramos.
  let analysis;
  try {
    analysis = await analyzeTemplate(buffer);
  } catch (err) {
    console.error('[bitacora template-upload] analyze failed:', err);
    return NextResponse.json({ error: `No pude analizar la plantilla: ${(err as Error).message}` }, { status: 422 });
  }

  const columnsCount = Object.keys(analysis.mapping.columns).length;
  if (columnsCount === 0) {
    return NextResponse.json({
      error: 'No pude identificar ninguna columna de datos en tu plantilla. Revisa que tenga headers claros (Fecha, Negocio, etc).',
    }, { status: 422 });
  }

  // Cobrar tareas ahora que el análisis fue exitoso.
  const consume = await consumeAiOp(agent.id, BITACORA_TEMPLATE_UPLOAD_TASKS, {
    label:  'bitacora_template_upload',
    source: 'portal_bitacora',
  });
  if (!consume.ok) {
    return NextResponse.json({
      error: `No hay suficientes tareas en tu pool (usado ${consume.used}/${consume.limit}). Necesitas ${BITACORA_TEMPLATE_UPLOAD_TASKS} tareas para subir la plantilla.`,
    }, { status: 402 });
  }

  // Subir a storage. Path: {portal_email}/template-{timestamp}.xlsx
  const timestamp = Date.now();
  const storagePath = `${resolved.portalEmail}/template-${timestamp}.xlsx`;
  const { error: uploadErr } = await supabase.storage
    .from('bitacora-templates')
    .upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (uploadErr) {
    console.error('[bitacora template-upload] storage upload failed:', uploadErr);
    return NextResponse.json({ error: 'no se pudo guardar la plantilla' }, { status: 500 });
  }

  // Guardar el mapping en organizations.bitacora_template
  const templatePayload = {
    url:            storagePath,
    filename:       file.name,
    mapping:        analysis.mapping,
    uploaded_at:    new Date().toISOString(),
    uploaded_by:    resolved.portalEmail,
    ai_usage:       analysis.usage,
    charged_tasks:  BITACORA_TEMPLATE_UPLOAD_TASKS,
  };
  const { error: updateErr } = await supabase
    .from('organizations')
    .update({ bitacora_template: templatePayload })
    .eq('portal_email', resolved.portalEmail);
  if (updateErr) {
    console.error('[bitacora template-upload] db update failed:', updateErr);
    return NextResponse.json({ error: 'no se pudo guardar el mapping' }, { status: 500 });
  }

  return NextResponse.json({
    ok:            true,
    mapping:       analysis.mapping,
    columns_count: columnsCount,
    charged_tasks: BITACORA_TEMPLATE_UPLOAD_TASKS,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'invalid token' }, { status: 404 });

  const supabase = createAdminClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('bitacora_template')
    .eq('portal_email', resolved.portalEmail)
    .maybeSingle();

  const url = (org?.bitacora_template as { url?: string } | null)?.url;
  if (url) {
    await supabase.storage.from('bitacora-templates').remove([url]);
  }

  const { error } = await supabase
    .from('organizations')
    .update({ bitacora_template: null })
    .eq('portal_email', resolved.portalEmail);
  if (error) return NextResponse.json({ error: 'no se pudo eliminar' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
