export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { GraphView } from './GraphView';
import { RecoveryView } from '../recovery/RecoveryView';

type TabKey = 'estados' | 'recovery';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'estados',  label: 'Estados' },
  { key: 'recovery', label: 'Reglas de recovery' },
];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function GraphDashboardPage({ searchParams }: Props) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = rawTab === 'recovery' ? 'recovery' : 'estados';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Estado del negocio
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Las 5 state machines del sistema y las reglas que las desatoran cuando algo se queda pegado.
        </p>
      </div>

      <nav className="flex items-center gap-1" style={{ borderBottom: '1px solid #E5E7EB' }}>
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/graph?tab=${t.key}`}
              className="px-3 py-2 text-[13px] transition-colors"
              style={{
                color:        active ? '#6C3BFF' : '#6B7280',
                fontWeight:   active ? 600 : 500,
                borderBottom: active ? '2px solid #6C3BFF' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === 'estados'  && <GraphView />}
      {tab === 'recovery' && <RecoveryView />}
    </div>
  );
}
