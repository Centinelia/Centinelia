// Safety net para bookmarks/emails externos con la URL vieja.
// Integraciones se movió a /portal/[token]?tab=negocio#integraciones el
// 2026-08-07. Todas las refs internas ya apuntan a la nueva URL; esta
// página existe solo para cubrir referencias que no controlamos.
import { redirect } from 'next/navigation';

interface Props { params: Promise<{ token: string }> }

export default async function LegacyIntegracionesPage({ params }: Props) {
  const { token } = await params;
  redirect(`/portal/${token}?tab=organizacion#integraciones`);
}
