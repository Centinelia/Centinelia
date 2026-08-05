import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import Link from 'next/link';
import { Terminal } from 'lucide-react';
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
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Aprobaciones</h1>
          <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
            Gate para acciones destructivas. {pending.length} pendiente{pending.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <Link
          href="/admin/comando"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
          style={{ background: '#6C3BFF', color: '#FFFFFF' }}
        >
          <Terminal size={13} />
          Comando
        </Link>
      </div>

      <ApprovalsClient initialPending={pending} initialDecided={decided} />
    </div>
  );
}
