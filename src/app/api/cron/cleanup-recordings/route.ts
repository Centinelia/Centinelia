export const dynamic = 'force-dynamic';

import { defineCron, errorMessage } from '@/lib/cron/define-cron';
import { CALL_RECORDINGS_BUCKET } from '@/lib/vapi/recordings';

// Retención de grabaciones a 90 días. Purga tres cosas:
//   1. Objetos en el bucket call-recordings con edad > RETENTION_DAYS.
//   2. voice_calls.recording_storage_path (limpia referencia una vez borrado).
//   3. voice_calls.recording_url (URL vieja de Vapi, ya expirada de todas
//      formas — mantenido por consistencia, evita mostrar link muerto).
//
// Antes: cron borraba solo recording_url a los 7 días, pero los endpoints
// /api/{admin,portal}/recording no leían esa columna sino Vapi directo.
// Ahora storage propio → 90 días de historial de audio en el portal.
const RETENTION_DAYS = 90;

export const GET = defineCron({
  name: 'cleanup-recordings',
  handler: async ({ supabase, now, log }) => {
    const cutoffMs  = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    let expected  = 0;
    let processed = 0;
    const errors: string[] = [];

    // ─── 1. Purga objetos del bucket ───────────────────────────────────────
    // El bucket agrupa por agent_id. Recorremos folders y filtramos por
    // updated_at. Supabase Storage limita list() a 1000 items por page.
    const { data: agentFolders, error: rootErr } = await supabase.storage
      .from(CALL_RECORDINGS_BUCKET)
      .list('', { limit: 1000 });
    if (rootErr) {
      throw new Error(`storage.list root failed: ${errorMessage(rootErr)}`);
    }

    const pathsToDelete: string[] = [];
    for (const folder of agentFolders ?? []) {
      if (!folder.name) continue;
      const { data: files, error: listErr } = await supabase.storage
        .from(CALL_RECORDINGS_BUCKET)
        .list(folder.name, { limit: 1000 });
      if (listErr) {
        errors.push(`list ${folder.name}: ${errorMessage(listErr)}`);
        log.error(`list agent folder failed`, { folder: folder.name, error: errorMessage(listErr) });
        continue;
      }
      for (const f of files ?? []) {
        if (!f.name) continue;
        // updated_at es lo que Supabase Storage devuelve como timestamp del
        // objeto. Si por alguna razón viene null, no purgamos (safe default).
        const updatedAt = f.updated_at ?? f.created_at ?? null;
        if (!updatedAt) continue;
        if (new Date(updatedAt).getTime() < cutoffMs) {
          pathsToDelete.push(`${folder.name}/${f.name}`);
        }
      }
    }

    expected += pathsToDelete.length;
    if (pathsToDelete.length > 0) {
      // remove() acepta batches. Supabase permite hasta 1000 por call; usamos
      // chunks de 100 para no timeoutear si el bucket es enorme.
      for (let i = 0; i < pathsToDelete.length; i += 100) {
        const chunk = pathsToDelete.slice(i, i + 100);
        const { error: rmErr } = await supabase.storage
          .from(CALL_RECORDINGS_BUCKET)
          .remove(chunk);
        if (rmErr) {
          errors.push(`remove batch ${i}: ${errorMessage(rmErr)}`);
          log.error('storage.remove failed', { batch: i, error: errorMessage(rmErr) });
          continue;
        }
        processed += chunk.length;
      }
    }

    // ─── 2. Limpia recording_storage_path y recording_url viejos ──────────
    // No se cuenta como "processed items" del bucket, solo hygiene sobre la
    // tabla. Cualquier fila con created_at < cutoff se limpia en un shot.
    const { error: updErr } = await supabase
      .from('voice_calls')
      .update({ recording_storage_path: null, recording_url: null })
      .lt('created_at', cutoffIso)
      .or('recording_storage_path.not.is.null,recording_url.not.is.null');
    if (updErr) {
      errors.push(`voice_calls update: ${errorMessage(updErr)}`);
      log.error('voice_calls update failed', { error: errorMessage(updErr) });
    }

    return {
      expected,
      processed,
      errors,
      metadata: {
        retention_days: RETENTION_DAYS,
        cutoff_iso:     cutoffIso,
        deleted_paths:  pathsToDelete.length,
      },
    };
  },
});
