/**
 * GET /api/admin/demos/ipark/propuesta
 *
 * Descarga PDF de propuesta ejecutiva Nala facturista para IPark. Se genera
 * on-demand (no se persiste). Copy source en:
 *   demos/ipark/04-propuesta-ejecutiva.md
 * Componente PDF en:
 *   src/lib/pdf/propuesta-ipark.tsx
 *
 * Auth: cookie Centinelia_admin. Nazre lo descarga desde el browser justo
 * antes de mandarlo por correo post-demo.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { isAdminRequest } from '@/lib/auth/admin';
import { PropuestaIparkPdf } from '@/lib/pdf/propuesta-ipark';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const buffer = await renderToBuffer(createElement(PropuestaIparkPdf));

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="Propuesta_Nala_IPark.pdf"',
      'Cache-Control':       'no-store',
    },
  });
}
