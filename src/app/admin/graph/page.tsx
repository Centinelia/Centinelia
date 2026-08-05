export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { GraphView } from './GraphView';

export default async function GraphDashboardPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Graph — Estado del negocio</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Las 5 state machines del sistema. Cada una registra sus transiciones para debugging + auditoría.
        </p>
      </div>
      <GraphView />
    </div>
  );
}
