import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Borra archivos en bucket ops-attachments más viejos que 7 días.
 *
 * Scope: todos los paths excepto los "single-state" (ej. {portal}/backlog-latest.pdf)
 * que son overwrite siempre al mismo path — esos no se acumulan ni envejecen.
 * Para el resto (facturas, hojas, CFDIs únicos) el path incluye yyyymmdd, así
 * que es trivial filtrar por ese segmento.
 *
 * Diseñado para correr diario (schedule en vercel.json).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const BUCKET = 'ops-attachments';
  const RETENTION_DAYS = 7;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const cutoffYmd = cutoff.toISOString().slice(0, 10).replace(/-/g, '');

  // Listar primer nivel (son los portal_emails).
  const { data: topLevel, error: listErr } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (listErr) {
    return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
  }

  const toDelete: string[] = [];
  for (const portalFolder of topLevel ?? []) {
    if (portalFolder.id || !portalFolder.name) continue;  // id presente = archivo suelto, skip
    // Para cada portal_email folder, listar subfolders (yyyymmdd/).
    const { data: dateFolders } = await supabase.storage.from(BUCKET).list(portalFolder.name, { limit: 1000 });
    for (const df of dateFolders ?? []) {
      if (!/^\d{8}$/.test(df.name)) continue;  // skip "latest" paths y single-state
      if (df.name < cutoffYmd) {
        // Listar archivos dentro y marcar para borrar
        const { data: files } = await supabase.storage.from(BUCKET).list(`${portalFolder.name}/${df.name}`, { limit: 1000 });
        for (const f of files ?? []) {
          toDelete.push(`${portalFolder.name}/${df.name}/${f.name}`);
        }
      }
    }
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, cutoff_ymd: cutoffYmd });
  }

  // Borrar en batches de 100 (API limit).
  let totalDeleted = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const { error: delErr } = await supabase.storage.from(BUCKET).remove(batch);
    if (!delErr) totalDeleted += batch.length;
    else console.error('[cleanup-ops-attachments] batch delete failed:', delErr.message);
  }

  console.log(`[cleanup-ops-attachments] deleted ${totalDeleted} files older than ${cutoffYmd}`);
  return NextResponse.json({ ok: true, deleted: totalDeleted, cutoff_ymd: cutoffYmd });
}
