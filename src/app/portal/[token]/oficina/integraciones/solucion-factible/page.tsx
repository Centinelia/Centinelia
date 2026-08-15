import { redirect } from 'next/navigation';

// Redirige al hub — la sección ahora se abre inline como el resto de integraciones.
// Preservado para bookmarks legacy de la URL dedicada.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/portal/${token}/integraciones`);
}
