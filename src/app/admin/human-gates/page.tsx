export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { HumanGatesView } from './HumanGatesView';

export default async function HumanGatesPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Auditoría</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>Decisiones humanas</h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Ledger unificado de cada aprobación, rechazo o edición que los dueños hicieron desde el portal. Cross-entidad.
        </p>
      </div>
      <HumanGatesView />
    </div>
  );
}
