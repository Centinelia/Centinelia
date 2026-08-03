export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { findReportByFolio, MAX_ATTACHMENTS_PER_REPORT, MAX_FILE_BYTES } from '@/lib/civic/attachments';
import UploadForm from './UploadForm';

interface Params { params: Promise<{ folio: string }> }

export default async function PublicAttachPage({ params }: Params) {
  const { folio } = await params;
  const supabase  = createAdminClient();
  const report    = await findReportByFolio(folio, supabase);
  if (!report) return notFound();

  const { count } = await supabase
    .from('civic_report_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', report.id);
  const remaining = MAX_ATTACHMENTS_PER_REPORT - (count ?? 0);

  return (
    <main style={{ minHeight: '100vh', background: '#fafbff', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reporte ciudadano</div>
        <h1 style={{ margin: '4px 0 8px', fontSize: 22, color: '#1a0a3b' }}>Folio {report.folio}</h1>
        {report.description && (
          <p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 14, lineHeight: 1.5 }}>{report.description}</p>
        )}
        <p style={{ margin: '0 0 20px', color: '#1a0a3b', fontSize: 14 }}>
          Sube fotos que ayuden a ubicar y atender el reporte. Máximo {MAX_ATTACHMENTS_PER_REPORT} archivos por reporte
          ({(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB c/u). Puedes subir {remaining} más.
        </p>
        {remaining > 0 ? (
          <UploadForm folio={report.folio} />
        ) : (
          <div style={{ padding: 12, background: '#f4f0ff', borderRadius: 8, color: '#6c3bff', fontSize: 14 }}>
            Ya alcanzaste el límite de archivos para este folio. Si necesitas subir más, contacta a la oficina responsable.
          </div>
        )}
        <p style={{ margin: '20px 0 0', fontSize: 12, color: '#9ca3af' }}>
          Solo se aceptan imágenes (JPG, PNG, WEBP, HEIC, GIF). Al subir aceptas que las fotos serán compartidas con el área responsable del reporte.
        </p>
      </div>
    </main>
  );
}
