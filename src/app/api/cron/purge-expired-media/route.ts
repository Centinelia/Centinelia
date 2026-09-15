export const dynamic = 'force-dynamic';
// Frecuencia: "0 4 * * *" — elimina media vencida de Storage y DB.

import { defineCron, errorMessage } from '@/lib/cron/define-cron';

// Regex para extraer path relativo del signed URL de Supabase Storage.
// Formato: https://<project>.supabase.co/storage/v1/object/sign/user-media/<PATH>?token=...
const SIGNED_URL_PATH_RE = /\/storage\/v1\/object\/sign\/user-media\/(.+?)(?:\?|$)/;

function extractStoragePath(fileUrl: string): string | null {
  const match = SIGNED_URL_PATH_RE.exec(fileUrl);
  return match ? match[1] : null;
}

export const GET = defineCron({
  name:        'navi-purge-expired-media',
  maxDuration: 300,
  handler: async ({ supabase, now, log }) => {
    // Archivos cuyo expires_at ya pasó
    const { data: expired, error: fetchErr } = await supabase
      .from('user_media_uploads')
      .select('id, file_url')
      .lt('expires_at', now.toISOString())
      .limit(500);

    if (fetchErr) {
      throw new Error(`Error cargando media vencida: ${fetchErr.message}`);
    }

    const rows = expired ?? [];
    let rowsDeleted = 0;
    let storageDeleted = 0;
    const errors: string[] = [];

    if (rows.length === 0) {
      return {
        expected:  0,
        processed: 0,
        errors:    [],
        metadata:  { rows_deleted: 0, storage_objects_deleted: 0 },
      };
    }

    // Separar los que tienen path parseable de los que no
    const toDelete:       Array<{ id: string; path: string }> = [];
    const noPathIds:      string[] = [];

    for (const row of rows) {
      const path = extractStoragePath(row.file_url as string);
      if (path) {
        toDelete.push({ id: row.id as string, path });
      } else {
        log.warn(`No se pudo extraer path de file_url`, { id: row.id, fileUrl: row.file_url });
        noPathIds.push(row.id as string);
      }
    }

    // Bulk delete storage (en lotes si fuera necesario — 500 es manejable)
    const paths = toDelete.map(r => r.path);
    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from('user-media')
        .remove(paths);

      if (storageErr) {
        // Error de Storage → NO eliminar los rows para evitar orphaned DB entries.
        const msg = `Storage remove error: ${storageErr.message}`;
        log.error('Error borrando objetos de Storage', { error: storageErr.message });
        errors.push(msg);
        // Todavía podemos borrar los noPathIds (sin storage a limpiar)
      } else {
        storageDeleted = paths.length;
        log.info(`${storageDeleted} objetos eliminados de Storage`);

        // Solo eliminar rows cuyo storage se borró exitosamente
        const idsToDelete = toDelete.map(r => r.id);
        const { error: dbErr } = await supabase
          .from('user_media_uploads')
          .delete()
          .in('id', idsToDelete);

        if (dbErr) {
          const msg = `DB delete error: ${dbErr.message}`;
          log.error('Error eliminando rows de DB', { error: dbErr.message });
          errors.push(msg);
        } else {
          rowsDeleted += idsToDelete.length;
        }
      }
    }

    // Eliminar rows sin path de Storage (no hay objeto que limpiar)
    if (noPathIds.length > 0) {
      const { error: dbErr } = await supabase
        .from('user_media_uploads')
        .delete()
        .in('id', noPathIds);

      if (dbErr) {
        log.error('Error eliminando rows sin path', { error: dbErr.message });
        errors.push(`DB delete (no-path): ${dbErr.message}`);
      } else {
        rowsDeleted += noPathIds.length;
        log.info(`${noPathIds.length} rows sin path eliminados`);
      }
    }

    return {
      expected:  rows.length,
      processed: rowsDeleted,
      errors,
      metadata:  { rows_deleted: rowsDeleted, storage_objects_deleted: storageDeleted },
    };
  },
});
