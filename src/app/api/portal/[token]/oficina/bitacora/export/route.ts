import { NextRequest, NextResponse } from 'next/server';
import { loadBitacoraData } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import { buildBitacoraExcel, sanitizeBusinessName } from '@/lib/bitacora/build-excel';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const week  = req.nextUrl.searchParams.get('week')  ?? undefined;
  const month = req.nextUrl.searchParams.get('month') ?? undefined;
  const mode  = month ? 'monthly' : 'weekly';
  const data  = await loadBitacoraData(token, month ?? week, mode);

  if (!data || !data.enabled) {
    return NextResponse.json({ error: 'not available' }, { status: 404 });
  }

  const buffer = await buildBitacoraExcel({
    incidents:     data.incidents,
    businessName:  data.agent.business_name,
    rangeStartISO: data.weekStart,
    mode:          data.mode,
  });

  const sanitizedBusiness = sanitizeBusinessName(data.agent.business_name);
  const suffix = mode === 'monthly' ? data.weekStart.slice(0, 7) : data.weekStart.slice(0, 10);
  const filename = `bitacora-${sanitizedBusiness}-${suffix}.xlsx`;

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
