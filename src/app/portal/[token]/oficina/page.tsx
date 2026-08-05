import { redirect } from 'next/navigation';

interface Props { params: Promise<{ token: string }> }

export default async function OficinaPage({ params }: Props) {
  const { token } = await params;
  redirect(`/portal/${token}/oficina/bandeja`);
}
