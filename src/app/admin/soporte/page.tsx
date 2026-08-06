export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { SoporteView } from './SoporteView';

export default async function SoportePage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Soporte</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Cola de incidentes que Nash está trabajando. Bugs reportados por clientes, errores del stack, escalaciones estancadas, hallazgos propios de Nash navegando admin, y tickets manuales que le abrimos aquí.
        </p>
      </div>
      <SoporteView />
    </div>
  );
}
