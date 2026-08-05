import { createAdminClient } from '@/lib/supabase/admin';
import { getAgentAccess }   from '@/lib/portal/agent-access';
import Link                  from 'next/link';
import { AlertTriangle, FileText, Mic } from 'lucide-react';

interface Item {
  label: string;
  count: number;
  href:  string;
  icon:  React.ElementType;
  color: string;
}

export default async function AttentionPanel({ token }: { token: string }) {
  const supabase = createAdminClient();
  const access   = await getAgentAccess(token);
  if (!access) return null;
  const { ids } = access;

  const [ticketR, contractR, meetingR] = await Promise.all([
    supabase.from('helpdesk_tickets').select('id', { count: 'exact', head: true })
      .in('agent_id', ids).eq('prioridad', 'critica').not('status', 'in', '(resuelto,cerrado)'),
    supabase.from('contract_drafts').select('id', { count: 'exact', head: true })
      .in('agent_id', ids).eq('status', 'borrador'),
    supabase.from('ops_meetings').select('id', { count: 'exact', head: true })
      .in('agent_id', ids).in('status', ['pending', 'error']),
  ]);

  const all: Item[] = [
    { label: 'Críticos',  count: ticketR.count   ?? 0, href: `/portal/${token}/oficina/helpdesk`,  icon: AlertTriangle, color: '#ef4444' },
    { label: 'Contratos', count: contractR.count ?? 0, href: `/portal/${token}/oficina/documentos`, icon: FileText,      color: '#f59e0b' },
    { label: 'Juntas',    count: meetingR.count  ?? 0, href: `/portal/${token}/oficina/juntas`,    icon: Mic,           color: '#3b82f6' },
  ];

  const pending = all.filter(i => i.count > 0);

  // T4.1 + T4.2: If pending is empty, show compact empty state without "Acceso rápido"
  if (pending.length === 0) {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', position: 'sticky', top: 69 }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--c-text-2)' }}>Todo al día</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', position: 'sticky', top: 69 }}
    >
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>Necesitan tu atención</h2>
        {pending.length > 0 && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>
            {pending.length} módulo{pending.length !== 1 ? 's' : ''} con pendientes
          </p>
        )}
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
        {pending.map(item => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--c-surface-2)]"
              style={{ textDecoration: 'none' }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${item.color}14` }}
              >
                <Icon size={14} style={{ color: item.color }} />
              </div>
              <span className="flex-1 text-sm font-medium" style={{ color: 'var(--c-text)' }}>
                {item.label}
              </span>
              <span
                className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full shrink-0"
                style={{ background: `${item.color}18`, color: item.color }}
              >
                {item.count}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
