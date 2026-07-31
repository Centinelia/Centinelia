export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAllFlagKeys } from '@/lib/feature-flags/evaluator';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { ObservabilityView } from './ObservabilityView';

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return store.get('Centinelia_admin')?.value === process.env.ADMIN_SECRET;
}

export default async function ObservabilityPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const [flagKeys] = await Promise.all([getAllFlagKeys()]);
  const meerkatIds = Object.keys(MEERKAT_CONFIGS).sort();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Observabilidad segmentada</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Métricas de producción rebanadas por versión de empleado y flags activos.
        </p>
      </div>
      <ObservabilityView meerkatIds={meerkatIds} flagKeys={flagKeys.sort()} />
    </div>
  );
}
