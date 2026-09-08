'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ContpaqiSetupPanel from '../../../configurar/ContpaqiSetupPanel';

export default function SetupContpaqiPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        href={`/portal/${token}/oficina/facturas`}
        className="inline-flex items-center gap-1.5 text-xs mb-4 hover:opacity-70 transition-opacity"
        style={{ color: 'var(--c-text-3)' }}
      >
        <ArrowLeft size={12} />
        Volver a Facturas
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
          Setup Facturación (CONTPAQi)
        </h1>
        <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
          Configura tus datos fiscales y descarga el Writer para Windows.
        </p>
        <p className="text-[11px] mt-2" style={{ color: 'var(--c-text-3)' }}>
          También puedes acceder desde <strong>Empleados → Nala → Configurar → Herramientas → Adaptador de facturación</strong>.
        </p>
      </header>

      <ContpaqiSetupPanel token={token} />
    </div>
  );
}
