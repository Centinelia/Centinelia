export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { HandoffsView } from './HandoffsView';

export default async function HandoffsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Handoffs entre empleados (DAG)</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Grafo real de handoffs (consultar_agente, delegar_tarea) entre meerkats. Toggle edges para restringir flujos.
        </p>
      </div>
      <HandoffsView />
    </div>
  );
}
