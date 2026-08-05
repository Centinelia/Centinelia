export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { HumanGatesView } from './HumanGatesView';

export default async function HumanGatesPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Human gates — decisiones humanas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Ledger unificado de cada aprobación / rechazo / edición que los dueños hicieron. Cross-entidad.
        </p>
      </div>
      <HumanGatesView />
    </div>
  );
}
