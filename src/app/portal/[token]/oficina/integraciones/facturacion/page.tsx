import { redirect } from 'next/navigation';

// Legacy redirect. La configuración de Facturación CFDI vive ahora en la
// ficha de Nala (2026-09-07). Mandamos al listado de empleados para que el
// usuario abra su Nala. Preservado para bookmarks de la URL vieja.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/portal/${token}/empleados`);
}
