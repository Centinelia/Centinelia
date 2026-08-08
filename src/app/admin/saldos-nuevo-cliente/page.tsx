export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { SaldosCalculator } from './SaldosCalculator';

export default async function SaldosNuevoClientePage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Saldos para cliente nuevo</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Calcula cuánto agregar en cada plataforma cuando entra un cliente nuevo. Los montos incluyen un buffer del 30% para el primer mes.
        </p>
      </div>
      <SaldosCalculator />
    </div>
  );
}
