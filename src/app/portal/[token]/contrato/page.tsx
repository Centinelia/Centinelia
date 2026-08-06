export const dynamic = 'force-dynamic';

import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import { ContractDocument } from '@/lib/contract/template';
import PrintButton from './PrintButton';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ContratoPrintPage({ params }: Props) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('*')
    .eq('portal_token', token)
    .single();

  if (!agent) notFound();

  return (
    <div className="min-h-screen" style={{ background: '#fff', color: '#1a1a1a' }}>
      {/* Print toolbar, hidden when printing */}
      <div className="print:hidden flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
        <span className="text-sm font-medium text-gray-600">Términos de servicio · {agent.business_name}</span>
        <PrintButton />
      </div>

      {/* Contract content */}
      <div className="max-w-3xl mx-auto px-8 py-10 print:py-6 print:px-6">
        <ContractDocument agent={agent} />
      </div>
    </div>
  );
}
