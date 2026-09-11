/**
 * GET /api/admin/demos/meefi/checklist
 *
 * Descarga PDF del checklist ejecutivo para la cita Meefi 15-sept-2026.
 * Se genera on-demand (no se persiste). Copy source en:
 *   demos/meefi-gac/27-checklist-demo-15-sept.md
 * Componente PDF en:
 *   src/lib/pdf/checklist-meefi.tsx
 *
 * Auth: cookie Centinelia_admin. Nazre lo descarga desde el browser
 * antes de imprimirlo o abrirlo en el celular durante la cita.
 */

import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import { isAdminRequest } from '@/lib/auth/admin';
import { ChecklistMeefiPdf } from '@/lib/pdf/checklist-meefi';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const buffer = await renderToBuffer(createElement(ChecklistMeefiPdf));

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="Demo_Meefi_15-sept.pdf"',
      'Cache-Control':       'no-store',
    },
  });
}
