export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { HumanGatesView } from './HumanGatesView';

export default async function HumanGatesPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Decisiones humanas</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Ledger unificado de cada aprobación, rechazo o edición que los dueños hicieron. Cross-entidad.
        </p>
      </div>
      <HumanGatesView />
    </div>
  );
}
