import { NextRequest, NextResponse } from 'next/server';
import { Workbook } from 'exceljs';
import { loadBitacoraData, type IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';

export const dynamic = 'force-dynamic';

const DAYS = ['L', 'M', 'MI', 'J', 'V', 'S'];

/**
 * Sanitize filename to remove non-alphanumeric characters except hyphens and underscores
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').toLowerCase();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const week = req.nextUrl.searchParams.get('week') ?? undefined;
  const data = await loadBitacoraData(token, week);

  // Feature gate: if feature is not enabled, return 404 to avoid leaking data
  if (!data || !data.enabled) {
    return NextResponse.json({ error: 'not available' }, { status: 404 });
  }

  const wb = new Workbook();
  const ws = wb.addWorksheet(`Semana ${data.weekStart.slice(0, 10)}`);

  // Section headers
  ws.mergeCells(1, 1, 1, 9);
  ws.getCell(1, 1).value = 'DATOS DEL CLIENTE';
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };

  ws.mergeCells(1, 10, 1, 9 + DAYS.length);
  ws.getCell(1, 10).value = 'SEGUIMIENTO DEL CLIENTE';
  ws.getCell(1, 10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE066' } };

  // Column headers
  const headers = ['Fecha', 'Verificación', 'Negocio', 'Cliente', 'Dirección', 'Teléfono', 'Motivo', 'Resultado', 'Vendedor', ...DAYS];
  headers.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3B0' } };
    cell.font = { bold: true };
  });

  // Data rows
  data.incidents.forEach((inc: IncidentRow, rowIdx: number) => {
    const r = rowIdx + 3;
    let color: string | null = null;

    // Color assignment based on status
    if (inc.is_new_client) {
      color = 'FF1D4ED8'; // blue
    } else if (inc.verification_result === 'no_visitado') {
      color = 'FFDC2626'; // red
    } else if (inc.verification_result === 'sin_respuesta') {
      color = 'FF6B7280'; // gray
    }

    const values = [
      new Date(inc.created_at).toLocaleDateString('es-MX'),
      new Date(inc.verification_scheduled_at).toLocaleDateString('es-MX'),
      inc.business_name,
      inc.contact_name ?? '',
      inc.address,
      inc.contact_phone,
      inc.motivo,
      inc.verification_result ?? 'pendiente',
      inc.vendedor ?? '',
    ];

    values.forEach((v, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = v;
      if (color) {
        cell.font = { color: { argb: color } };
      }
    });

    // Mark "OK" days in the week follow-up columns
    if (inc.verification_result === 'ok' && inc.verification_called_at) {
      const day = new Date(inc.verification_called_at).getDay();
      const idx = day === 0 ? 6 : day - 1;
      if (idx < DAYS.length) {
        ws.getCell(r, 10 + idx).value = 'OK';
      }
    }
  });

  // Generate buffer
  const buffer = await wb.xlsx.writeBuffer();

  // Sanitize business name for filename
  const sanitizedBusiness = sanitizeFilename(data.agent.business_name);
  const weekStr = data.weekStart.slice(0, 10);
  const filename = `bitacora-${sanitizedBusiness}-${weekStr}.xlsx`;

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
