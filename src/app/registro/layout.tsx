import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activa tu primer empleado digital',
  description: 'Incorpora tu primer empleado digital de IA en menos de 24 horas. Un solo pago de activación de $14,990 MXN + planes mensuales desde $2,997/mes. Sin IMSS, sin vacaciones, sin ausencias. Disponible 24/7.',
  alternates: {
    canonical: 'https://www.centinelia.mx/registro',
  },
  openGraph: {
    title: 'Activa tu primer empleado digital | Centinelia',
    description: 'Empleados de IA especializados que atienden llamadas, correos, documentos y tareas 24/7. Activación desde $14,990 MXN + $2,997/mes. Sin contratos largos.',
    url: 'https://www.centinelia.mx/registro',
  },
};

export default function RegistroLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
