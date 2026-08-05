export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { HandoffsView } from './HandoffsView';

export default async function HandoffsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Flujos entre empleados</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Cuando un empleado consulta o delega a otro (Sofia → Nox → Noah). Configura reglas para restringir flujos específicos.
        </p>
      </div>
      <HandoffsView />
    </div>
  );
}
