import { redirect } from 'next/navigation';

interface Props {
  params:       Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}

export default async function SalientesRedirect({ params, searchParams }: Props) {
  const { token } = await params;
  const { view }  = await searchParams;

  const filtro = view === 'campanas' ? 'campanas' : 'salientes';
  redirect(`/portal/${token}/oficina/llamadas?filtro=${filtro}`);
}
