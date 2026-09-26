export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { InventoryView } from './InventoryView';

export default async function InventarioPlataformasPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: '#9B6DFF' }}>Operaciones · Stack</p>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight" style={{ color: '#1A0A3B' }}>Inventario de plataformas</h1>
        <p className="text-[13px] mt-1.5 max-w-2xl" style={{ color: '#6B6480' }}>
          Qué tienes cargado hoy, cuánto vas a gastar el próximo mes, y qué falta comprar. El taquero antes de que abran los clientes.
        </p>
      </div>
      <InventoryView />
    </div>
  );
}
