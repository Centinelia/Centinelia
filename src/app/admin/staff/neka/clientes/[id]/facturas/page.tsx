export const dynamic = 'force-dynamic';

import { redirect, notFound } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { FacturasView } from './FacturasView';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClienteFacturasPage({ params }: Props) {
  if (!(await isAdmin())) redirect('/admin/login?from=/admin/staff/neka/clientes');
  const { id } = await params;

  const supabase = createAdminClient();
  const { data: cliente } = await supabase
    .from('centinelia_clientes')
    .select('id, razon_social, rfc, correo_facturacion')
    .eq('id', id)
    .maybeSingle();

  if (!cliente) notFound();

  return (
    <FacturasView
      clienteId={id}
      razonSocial={cliente.razon_social}
      rfc={cliente.rfc}
      correoFacturacion={cliente.correo_facturacion}
    />
  );
}
