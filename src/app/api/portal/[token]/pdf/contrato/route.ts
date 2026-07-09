import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { getAgentForPdf, pdfResponse } from '../_auth';
import { ContratoPdf } from '@/lib/pdf/contrato';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const ctx = await getAgentForPdf(token);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const data = {
    clientName:  sp.get('nombre')   ?? undefined,
    clientRfc:   sp.get('rfc')      ?? undefined,
    clientEmail: sp.get('email')    ?? undefined,
    clientPhone: sp.get('telefono') ?? undefined,
    services:    sp.get('servicios') ?? `Servicios de ${ctx.brand.businessName} conforme a cotización aprobada.`,
    monto:       sp.get('monto')    ?? undefined,
    vigencia:    sp.get('vigencia') ?? undefined,
  };

  const buffer = await renderToBuffer(createElement(ContratoPdf, { brand: ctx.brand, data }) as any);
  return pdfResponse(buffer, `contrato-${ctx.brand.businessName.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
