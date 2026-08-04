import { redirect } from 'next/navigation';

interface Props { params: Promise<{ token: string }> }

// Legacy — la sección se consolidó en /oficina/tareas con 2 tabs.
export default async function LegacyTareasProgramadasPage({ params }: Props) {
  const { token } = await params;
  redirect(`/portal/${token}/oficina/tareas?tab=programadas`);
}
