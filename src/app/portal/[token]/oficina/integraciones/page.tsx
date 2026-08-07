// Ruta retrocompat: /oficina/integraciones se movió a /portal/[token]?tab=negocio#integraciones
// el 2026-08-07 (los conectores son configuración one-time del owner, no trabajo
// del empleado). Redirect permanente; los bookmarks viejos siguen funcionando.
import { redirect } from 'next/navigation';

interface Props { params: Promise<{ token: string }> }

export default async function LegacyIntegracionesPage({ params }: Props) {
  const { token } = await params;
  redirect(`/portal/${token}?tab=negocio#integraciones`);
}
