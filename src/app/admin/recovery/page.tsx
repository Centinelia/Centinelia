export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { RecoveryView } from './RecoveryView';

export default async function RecoveryPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Recovery</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Reglas declarativas que detectan stuck states y aplican la acción de recovery. Cron automático cada 15 minutos.
        </p>
      </div>
      <RecoveryView />
    </div>
  );
}
