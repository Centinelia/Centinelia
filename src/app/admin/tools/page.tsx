export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/auth';
import { TOOL_REGISTRY, auditRegistry } from '@/lib/tools/registry';

export default async function ToolsRegistryPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const audit = auditRegistry();

  const grouped = TOOL_REGISTRY.reduce((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {} as Record<string, typeof TOOL_REGISTRY>);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" style={{ color: 'var(--c-text)' }}>
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--c-text)' }}>Tools registry</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          {TOOL_REGISTRY.length} tools. Fuente de verdad para debugging + docs.
        </p>
      </div>

      {(audit.missing.length > 0 || audit.extra.length > 0) && (
        <div className="p-3 rounded text-sm" style={{ background: 'rgba(255,180,0,0.1)', color: '#ffb400' }}>
          <strong>Drift detectado:</strong>
          {audit.missing.length > 0 && <div>Faltan en registry: {audit.missing.join(', ')}</div>}
          {audit.extra.length > 0 && <div>Discrepancia capabilities: {audit.extra.join(' | ')}</div>}
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, tools]) => (
        <section key={cat}>
          <h2 className="text-sm uppercase tracking-wide mb-2 mt-4" style={{ color: 'var(--c-text-2)' }}>{cat}</h2>
          <div className="rounded border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <table className="w-full text-sm">
              <thead style={{ background: 'rgba(255,255,255,0.03)' }}>
                <tr style={{ color: 'var(--c-text-2)' }}>
                  <th className="text-left px-3 py-2 font-medium">Tool</th>
                  <th className="text-left px-3 py-2 font-medium">Descripción</th>
                  <th className="text-left px-3 py-2 font-medium">Canales</th>
                  <th className="text-left px-3 py-2 font-medium">Meerkats</th>
                  <th className="text-left px-3 py-2 font-medium">Feature</th>
                  <th className="text-right px-3 py-2 font-medium">Retries</th>
                  <th className="text-right px-3 py-2 font-medium">Timeout</th>
                  <th className="text-left px-3 py-2 font-medium">Verify</th>
                </tr>
              </thead>
              <tbody>
                {tools.map(t => (
                  <tr key={t.name} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td className="px-3 py-2 font-mono">
                      {t.name}
                      {t.destructive && <span className="ml-2 text-xs" style={{ color: '#ff7070' }}>◆</span>}
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--c-text-2)' }}>{t.description}</td>
                    <td className="px-3 py-2 text-xs">{t.channels.join(', ')}</td>
                    <td className="px-3 py-2 text-xs">{t.gatedByRole?.join(', ') ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{t.gatedByFeature ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{t.policy.maxAttempts}</td>
                    <td className="px-3 py-2 text-right">{(t.policy.timeoutMs/1000).toFixed(0)}s</td>
                    <td className="px-3 py-2 text-xs">{t.policy.verifyStrategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
        ◆ marca tools destructivas (side effects externos). Todas van por verifier antes de ejecutar cuando aplica.
      </p>
    </div>
  );
}
