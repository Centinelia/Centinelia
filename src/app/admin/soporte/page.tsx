export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { SoporteView } from './SoporteView';

export default async function SoportePage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Nash · Operaciones</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>Soporte</h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Cola de incidentes que Nash está trabajando. Bugs reportados por clientes, errores del stack, escalaciones estancadas, hallazgos propios de Nash navegando admin, y tickets manuales que le abrimos aquí.
        </p>
      </div>
      <SoporteView />
    </div>
  );
}
