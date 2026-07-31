import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import Link from 'next/link';
import { ArrowLeft, Terminal } from 'lucide-react';
import { listApprovals } from '@/lib/admin/approvals';
import ApprovalsClient from './ApprovalsClient';

export const dynamic = 'force-dynamic';


export default async function AprobacionesPage() {
  if (!await isAdmin()) {
    redirect('/admin/login?from=/admin/aprobaciones');
  }

  const [pending, decided] = await Promise.all([
    listApprovals('pending', 50),
    Promise.all([
      listApprovals('approved', 15),
      listApprovals('rejected', 15),
    ]).then(([a, r]) => [...a, ...r].sort((x, y) => (y.decided_at ?? '').localeCompare(x.decided_at ?? '')).slice(0, 20)),
  ]);

  return (
    <div className="p-4 md:p-8 max-w-4xl" style={{ background: '#120726', minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/admin/inicio" className="inline-flex items-center gap-1.5 text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>
            <ArrowLeft size={12} /> Inicio
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text)', fontFamily: 'var(--font-sora)' }}>Aprobaciones</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>
            Gate para acciones destructivas. {pending.length} pendiente{pending.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff' }}
        >
          <Terminal size={14} />
          Comando
        </Link>
      </div>

      <ApprovalsClient initialPending={pending} initialDecided={decided} />
    </div>
  );
}
