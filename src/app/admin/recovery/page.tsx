export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { RecoveryView } from './RecoveryView';

export default async function RecoveryPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Recovery — stuck states</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Reglas declarativas que detectan estados atorados en cada state machine y aplican la acción de recovery. Cron corre cada 15 min.
        </p>
      </div>
      <RecoveryView />
    </div>
  );
}
