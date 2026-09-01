import { redirect } from 'next/navigation';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import InventarioConfigForm from './InventarioConfigForm';

export const dynamic = 'force-dynamic';

export default async function InventarioIntegracionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved  = await resolveOrgFromToken(token);
  if (!resolved) redirect('/portal/login');

  // Si el token vino en formato legacy, redirige al token nuevo.
  if (resolved.legacy) redirect(`/portal/${resolved.orgToken}/integraciones/inventario`);

  return (
    <div className="flex flex-col gap-5 max-w-4xl mx-auto w-full p-4 md:p-6">
      <InventarioConfigForm token={resolved.orgToken} />
    </div>
  );
}
