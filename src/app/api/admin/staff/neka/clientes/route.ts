import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { listClientes, createCliente, type CentineliaClienteInput } from '@/lib/billing/centinelia-clientes';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const clientes = await listClientes();
  return NextResponse.json({ clientes });
}

export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const body = await req.json() as CentineliaClienteInput;
  if (!body.rfc || !body.razon_social || !body.cp || !body.correo_facturacion || !body.fecha_proxima_facturacion) {
    return NextResponse.json({ error: 'rfc, razon_social, cp, correo_facturacion y fecha_proxima_facturacion son requeridos' }, { status: 400 });
  }
  if (!Array.isArray(body.conceptos) || body.conceptos.length === 0) {
    return NextResponse.json({ error: 'conceptos requerido (al menos 1 item)' }, { status: 400 });
  }
  try {
    const cliente = await createCliente(body);
    return NextResponse.json({ cliente }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
