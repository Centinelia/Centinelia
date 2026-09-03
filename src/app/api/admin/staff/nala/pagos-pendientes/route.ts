import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'admin only' }, { status: 401 });
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('centinelia_billing')
    .select(`
      id, cliente_id, related_uuid, monto, sent_to_email, created_at, meta,
      cliente:centinelia_clientes(razon_social, rfc, correo_facturacion)
    `)
    .eq('tipo', 'pago_pendiente_verificacion')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as unknown as Array<{
    id: string; cliente_id: string | null; related_uuid: string;
    monto: number; sent_to_email: string | null; created_at: string;
    meta: Record<string, unknown>;
    cliente: Array<{ razon_social: string; rfc: string; correo_facturacion: string }> | { razon_social: string; rfc: string; correo_facturacion: string } | null;
  }>).map(r => ({
    ...r,
    cliente: Array.isArray(r.cliente) ? r.cliente[0] ?? null : r.cliente,
  }));

  return NextResponse.json({ pendientes: rows });
}
