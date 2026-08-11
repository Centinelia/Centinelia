// A-D2: Naia RH. Owner ve hr_records + aprueba/rechaza solicitudes.
export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import RhClient from './RhClient';

interface Props { params: Promise<{ token: string }> }

interface HrRow {
  id: string;
  employee_name: string;
  record_type: 'falta' | 'vacaciones' | 'permiso' | 'incidencia';
  start_date: string;
  end_date: string | null;
  reason: string | null;
  status: 'registrada' | 'aprobada' | 'rechazada' | 'cancelada';
  approved_by: string | null;
  notes: string | null;
  created_at: string;
}

export default async function RhPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();
  const resolved  = await resolveOrgFromToken(token);

  const { data: records } = resolved?.portalEmail
    ? await supabase
        .from('hr_records')
        .select('id, employee_name, record_type, start_date, end_date, reason, status, approved_by, notes, created_at')
        .eq('portal_email', resolved.portalEmail)
        .order('start_date', { ascending: false })
        .limit(200)
    : { data: [] };

  return <RhClient token={token} initial={(records ?? []) as HrRow[]} />;
}
