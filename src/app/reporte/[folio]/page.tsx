import { createAdminClient } from '@/lib/supabase/admin';
import { STATUS_LABELS, STATUS_COLORS, CATEGORY_LABELS } from '@/lib/civic/folio';
import type { CivicStatus } from '@/lib/civic/folio';

interface Props { params: Promise<{ folio: string }> }

export default async function PublicFolioPage({ params }: Props) {
  const { folio } = await params;
  const supabase  = createAdminClient();

  const { data: report } = await supabase
    .from('civic_reports')
    .select('folio, status, category, description, location_text, area_responsable, created_at, resolved_at')
    .eq('folio', folio.toUpperCase())
    .single();

  const statusColors = report ? (STATUS_COLORS[report.status as CivicStatus] ?? STATUS_COLORS.abierto) : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0820',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <img src="/logo-tagline.png" alt="Centinelia" style={{ height: 40, opacity: 0.9 }} />
      </div>

      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'rgba(255,255,255,0.045)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
            Consulta de reporte
          </p>
          <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: '#9B6DFF', letterSpacing: '0.04em' }}>
            {folio.toUpperCase()}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 28px' }}>
          {!report ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                Folio no encontrado
              </p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                Verifica que el folio esté escrito correctamente.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Estatus</span>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '4px 12px',
                  borderRadius: 999, background: statusColors?.bg, color: statusColors?.color,
                }}>
                  {STATUS_LABELS[report.status as CivicStatus] ?? report.status}
                </span>
              </div>

              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

              {/* Category */}
              <Row label="Tipo">
                {CATEGORY_LABELS[report.category] ?? report.category}
              </Row>

              {/* Area */}
              {report.area_responsable && (
                <Row label="Área responsable">{report.area_responsable}</Row>
              )}

              {/* Description */}
              {report.description && (
                <Row label="Descripción">{report.description}</Row>
              )}

              {/* Location */}
              {report.location_text && (
                <Row label="Ubicación">{report.location_text}</Row>
              )}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />

              {/* Dates */}
              <Row label="Fecha de registro">
                {new Date(report.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Row>

              {report.resolved_at && (
                <Row label="Fecha de resolución">
                  {new Date(report.resolved_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
                </Row>
              )}

              {/* Status explanation */}
              {report.status === 'abierto' && (
                <div style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                }}>
                  Su reporte fue recibido y está pendiente de atención. Le notificaremos cuando avance.
                </div>
              )}
              {report.status === 'en_proceso' && (
                <div style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                }}>
                  Su reporte está siendo atendido. En breve recibirá una actualización.
                </div>
              )}
              {(report.status === 'resuelto' || report.status === 'cerrado') && (
                <div style={{
                  padding: '12px 16px', borderRadius: 12,
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)',
                  fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6,
                }}>
                  Su reporte ha sido atendido. Gracias por contribuir a mejorar su municipio.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
        Powered by Centinelia · centinelia.mx
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'right', lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}
