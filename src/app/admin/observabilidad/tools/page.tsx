export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { ToolMetricsView } from './ToolMetricsView';

export default async function ToolMetricsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Observabilidad: Tools</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Éxito, latencia y errores por tool desde tool_call_log. Cross-canal.
        </p>
        <div className="mt-3 flex gap-2 text-sm">
          <a href="/admin/observabilidad" className="px-3 py-1.5 rounded" style={{ color: 'var(--c-text-2)' }}>Llamadas por versión</a>
          <a href="/admin/observabilidad/tools" className="px-3 py-1.5 rounded" style={{ background: 'rgba(108,59,255,0.12)', color: '#9B6DFF', fontWeight: 600 }}>Tools</a>
        </div>
      </div>
      <ToolMetricsView />
    </div>
  );
}
