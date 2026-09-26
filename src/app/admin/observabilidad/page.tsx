export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { getAllFlagKeys } from '@/lib/feature-flags/evaluator';
import { MEERKAT_CONFIGS } from '@/lib/vapi/meerkat-configs';
import { ObservabilityView } from './ObservabilityView';


export default async function ObservabilityPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const [flagKeys] = await Promise.all([getAllFlagKeys()]);
  const meerkatIds = Object.keys(MEERKAT_CONFIGS).sort();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: '#1A0A3B' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: '#1A0A3B' }}>Observabilidad segmentada</h1>
        <p className="text-sm mt-1" style={{ color: '#4A3B6B' }}>
          Métricas de producción rebanadas por versión de empleado y flags activos.
        </p>
        <div className="mt-3 flex gap-2 text-sm">
          <a href="/admin/observabilidad" className="px-3 py-1.5 rounded" style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', fontWeight: 600 }}>Llamadas por versión</a>
          <a href="/admin/observabilidad/tools" className="px-3 py-1.5 rounded" style={{ color: '#4A3B6B' }}>Tools</a>
        </div>
      </div>
      <ObservabilityView meerkatIds={meerkatIds} flagKeys={flagKeys.sort()} />
    </div>
  );
}
