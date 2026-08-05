import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

// La edicion vive ahora inline en /admin/agentes/[id].
// Esta ruta se conserva solo para redirigir enlaces viejos.
export default async function EditarAgenteRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/admin/agentes/${id}`);
}
