export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { ToolMetricsView } from './ToolMetricsView';

export default async function ToolMetricsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#1A0A3B' }}>Tools</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B6480' }}>
          Éxito, latencia y errores por tool desde tool_call_log. Cross-canal.
        </p>
        <div className="mt-4 inline-flex gap-1 p-1 rounded-lg" style={{ background: '#F5F0FF' }}>
          <a
            href="/admin/observabilidad"
            className="px-3 py-1.5 rounded-md text-[13px] font-medium"
            style={{ color: '#6B6480' }}
          >
            Llamadas por versión
          </a>
          <a
            href="/admin/observabilidad/tools"
            className="px-3 py-1.5 rounded-md text-[13px] font-semibold"
            style={{ background: '#FFFFFF', color: '#1A0A3B', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
          >
            Tools
          </a>
        </div>
      </div>
      <ToolMetricsView />
    </div>
  );
}
