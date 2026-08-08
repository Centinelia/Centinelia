export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { InventoryView } from './InventoryView';

export default async function InventarioPlataformasPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)' }}>Inventario de plataformas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
          Qué tienes cargado hoy, cuánto vas a gastar el próximo mes, y qué falta comprar.
          El taquero antes de que abran los clientes.
        </p>
      </div>
      <InventoryView />
    </div>
  );
}
