import { redirect } from 'next/navigation';

export default function ContratosPageRedirect() {
  redirect('/admin/facturacion?tab=clientes');
}
