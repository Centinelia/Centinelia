// A-D1: Nova despacho de campo. Owner ve assignments + actualiza status.
export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import DespachoClient from './DespachoClient';

interface Props { params: Promise<{ token: string }> }

interface DispatchRow {
  id: string;
  service_description: string;
  location: string | null;
  priority: 'baja' | 'media' | 'alta' | 'critica';
  unidad_nombre: string | null;
  unidad_telefono: string | null;
  status: 'pendiente' | 'asignado' | 'en_ruta' | 'completado' | 'cancelado';
  requested_by_name: string | null;
  requested_by_phone: string | null;
  eta_minutes: number | null;
  notes: string | null;
  created_at: string;
}

export default async function DespachoPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();
  const resolved  = await resolveOrgFromToken(token);

  const { data: assignments } = resolved?.portalEmail
    ? await supabase
        .from('dispatch_assignments')
        .select('id, service_description, location, priority, unidad_nombre, unidad_telefono, status, requested_by_name, requested_by_phone, eta_minutes, notes, created_at')
        .eq('portal_email', resolved.portalEmail)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] };

  return <DespachoClient token={token} initial={(assignments ?? []) as DispatchRow[]} />;
}
