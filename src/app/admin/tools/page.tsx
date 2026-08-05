export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { AlertTriangle, Wrench } from 'lucide-react';
import { isAdmin } from '@/lib/admin/auth';
import { TOOL_REGISTRY, auditRegistry } from '@/lib/tools/registry';

const CHANNEL_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  voice:    { bg: '#F3F0FF', fg: '#7C3AED', border: '#DDD6FE' },
  chat:     { bg: '#EFF6FF', fg: '#2563EB', border: '#BFDBFE' },
  email:    { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  cron:     { bg: '#FEF3C7', fg: '#B45309', border: '#FDE68A' },
  delegate: { bg: '#FCE7F3', fg: '#BE185D', border: '#FBCFE8' },
  consult:  { bg: '#DBEAFE', fg: '#1D4ED8', border: '#BFDBFE' },
};

function ChannelPill({ channel }: { channel: string }) {
  const c = CHANNEL_COLORS[channel] ?? { bg: '#F3F4F6', fg: '#4B5563', border: '#E5E7EB' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
    >
      {channel}
    </span>
  );
}

export default async function ToolsRegistryPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  const audit = auditRegistry();

  const grouped = TOOL_REGISTRY.reduce((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {} as Record<string, typeof TOOL_REGISTRY>);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>
          Tools registry
        </h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          {TOOL_REGISTRY.length} tools. Fuente de verdad para debugging y documentación.
        </p>
      </div>

      {(audit.missing.length > 0 || audit.extra.length > 0) && (
        <div
          className="rounded-xl p-4 text-[13px] flex items-start gap-2"
          style={{ background: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}
        >
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#B45309' }} />
          <div className="min-w-0">
            <strong className="font-semibold" style={{ color: '#78350F' }}>Drift detectado</strong>
            {audit.missing.length > 0 && (
              <div className="mt-1 font-mono text-[12px]">Faltan en registry: {audit.missing.join(', ')}</div>
            )}
            {audit.extra.length > 0 && (
              <div className="mt-1 font-mono text-[12px]">Discrepancia capabilities: {audit.extra.join(' | ')}</div>
            )}
          </div>
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, tools]) => (
        <section key={cat}>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[15px] font-semibold" style={{ color: '#111827' }}>
              {cat}
            </h2>
            <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: '#9CA3AF' }}>
              {tools.length} tool{tools.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div
            className="rounded-xl overflow-hidden bg-white"
            style={{ border: '1px solid #E5E7EB', boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.05)' }}
          >
            <table className="w-full text-[13px]">
              <thead style={{ background: '#F9FAFB' }}>
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Tool</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Descripción</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Canales</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Meerkats</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Feature</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Retries</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Timeout</th>
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium" style={{ color: '#6B7280' }}>Verify</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr
                    key={t.name}
                    className="transition-colors hover:bg-gray-50"
                    style={{ borderTop: i > 0 ? '1px solid #F3F4F6' : undefined }}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[13px] font-medium" style={{ color: '#111827' }}>{t.name}</span>
                        {t.destructive && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}
                            title="Destructive: side effects externos"
                          >
                            destructive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5" style={{ color: '#4B5563' }}>{t.description}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex flex-wrap gap-1">
                        {t.channels.map(ch => (
                          <ChannelPill key={ch} channel={ch} />
                        ))}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12px]" style={{ color: '#6B7280' }}>
                      {t.gatedByRole?.join(', ') ?? <span style={{ color: '#9CA3AF' }}>—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[12px]">
                      {t.gatedByFeature ? (
                        <code
                          className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                          style={{ background: '#F3F4F6', color: '#111827' }}
                        >
                          {t.gatedByFeature}
                        </code>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#111827' }}>{t.policy.maxAttempts}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: '#111827' }}>{(t.policy.timeoutMs / 1000).toFixed(0)}s</td>
                    <td className="px-4 py-2.5 text-[12px]" style={{ color: '#6B7280' }}>{t.policy.verifyStrategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-[12px] flex items-center gap-1.5" style={{ color: '#6B7280' }}>
        <Wrench size={12} style={{ color: '#9CA3AF' }} />
        Las tools marcadas <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>destructive</span> tienen side effects externos y pasan por verifier antes de ejecutarse cuando aplica.
      </p>
    </div>
  );
}
