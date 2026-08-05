export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { GraphView } from './GraphView';

export default async function GraphDashboardPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Estado del negocio</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Las 5 state machines del sistema registran cada transición para debugging + auditoría.
        </p>
      </div>
      <GraphView />
    </div>
  );
}
