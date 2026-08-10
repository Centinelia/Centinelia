'use client';

import { useEffect, useState } from 'react';
import { Mail, Search, ChevronDown, ChevronUp, User2, RefreshCw } from 'lucide-react';

interface OutboundEmail {
  id:          string;
  enviado_por: string;
  to:          string;
  cc:          string | null;
  subject:     string;
  body:        string;
  provider:    string;
  ok:          boolean;
  sent_at:     string;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

export default function EnviadosSection({ token }: { token: string }) {
  const [items, setItems]     = useState<OutboundEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');
  const [dest, setDest]       = useState('');
  const [openId, setOpenId]   = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (dest)  params.set('to', dest);
    const res = await fetch(`/api/portal/${token}/outbound-emails?${params.toString()}`);
    if (res.ok) {
      const data = await res.json() as { items: OutboundEmail[] };
      setItems(data.items);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#ffffff', border: '1px solid #E8E3F5', boxShadow: '0 1px 2px rgba(26,10,59,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid #F0EDF9' }}>
        <div className="flex items-center gap-2 min-w-0">
          <Mail size={16} style={{ color: '#6C3BFF' }} strokeWidth={2.25} />
          <p className="text-[13px] font-semibold" style={{ color: '#1A0A3B' }}>
            Correos enviados por el equipo
          </p>
          <span className="text-[11px] tabular-nums" style={{ color: '#9B8FB5' }}>
            {loading ? '...' : `${items.length} en 60 días`}
          </span>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg"
          style={{ background: '#F5F3FB', color: '#6C3BFF' }}
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando' : 'Recargar'}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 px-5 py-3" style={{ background: '#FAFAFB', borderBottom: '1px solid #F0EDF9' }}>
        <div className="relative flex-1">
          <Search size={12} style={{ color: '#9B8FB5', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void load(); }}
            placeholder="Buscar en asunto o cuerpo"
            className="w-full pl-7 pr-3 py-1.5 text-[12px] rounded-lg outline-none"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
          />
        </div>
        <input
          value={dest}
          onChange={e => setDest(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void load(); }}
          placeholder="Filtrar por destinatario"
          className="w-56 px-3 py-1.5 text-[12px] rounded-lg outline-none"
          style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
        />
        <button
          onClick={() => void load()}
          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg"
          style={{ background: '#6C3BFF', color: '#ffffff' }}
        >
          Buscar
        </button>
      </div>

      {/* Lista */}
      {loading && items.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px]" style={{ color: '#9B8FB5' }}>
          Cargando correos enviados…
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-10 text-center text-[12px]" style={{ color: '#9B8FB5' }}>
          Sin correos enviados en los últimos 60 días.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#F0EDF9' }}>
          {items.map(e => {
            const open = openId === e.id;
            return (
              <li key={e.id} className="px-5 py-3 hover:bg-[#FAFAFB] cursor-pointer" onClick={() => setOpenId(open ? null : e.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User2 size={11} style={{ color: '#9B8FB5' }} />
                      <span className="text-[11px] font-semibold" style={{ color: '#6C3BFF' }}>{e.enviado_por}</span>
                      <span className="text-[11px]" style={{ color: '#9B8FB5' }}>→</span>
                      <span className="text-[11px] tabular-nums truncate" style={{ color: '#1A0A3B' }}>{e.to}</span>
                      {e.cc && <span className="text-[10px]" style={{ color: '#9B8FB5' }}>· CC: {e.cc}</span>}
                    </div>
                    <p className="text-[13px] font-medium truncate" style={{ color: '#1A0A3B' }}>{e.subject}</p>
                    {!open && (
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: '#6B6480' }}>
                        {e.body.slice(0, 140)}{e.body.length > 140 ? '…' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] tabular-nums" style={{ color: '#9B8FB5' }}>{fmtWhen(e.sent_at)}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wide"
                      style={{ background: e.ok ? '#DCFCE7' : '#FEE2E2', color: e.ok ? '#166534' : '#991B1B' }}
                    >
                      {e.ok ? e.provider : 'Falló'}
                    </span>
                    {open ? <ChevronUp size={12} style={{ color: '#9B8FB5' }} /> : <ChevronDown size={12} style={{ color: '#9B8FB5' }} />}
                  </div>
                </div>
                {open && (
                  <div
                    className="mt-3 p-3 rounded-lg text-[12px] whitespace-pre-wrap"
                    style={{ background: '#FAFAFB', border: '1px solid #F0EDF9', color: '#1A0A3B', maxHeight: 400, overflowY: 'auto' }}
                    onClick={ev => ev.stopPropagation()}
                  >
                    {e.body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
