'use client';

import { useState } from 'react';
import { Globe, Scan, RefreshCw, Check, AlertCircle } from 'lucide-react';

type Status = 'idle' | 'loading' | 'ok' | 'error';

export default function WebsiteSyncButton({ token, currentUrl }: { token: string; currentUrl: string | null }) {
  const [url, setUrl]       = useState(currentUrl ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [msg, setMsg]       = useState('');

  const sync = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setStatus('loading');
    setMsg('');
    try {
      const res  = await fetch(`/api/portal/${token}/resync-website`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('ok');
        setMsg(`Sincronizado · ${data.chars.toLocaleString()} caracteres extraídos`);
        setTimeout(() => setStatus('idle'), 4000);
      } else {
        setStatus('error');
        setMsg(data.error ?? 'Error al sincronizar');
      }
    } catch {
      setStatus('error');
      setMsg('Error de conexión. Intenta de nuevo.');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium uppercase tracking-widest" style={{ color: '#9B8FB5' }}>
          Sitio web
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9B8FB5' }} />
            <input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus('idle'); setMsg(''); }}
              placeholder="https://tunegocio.com"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-[13px] outline-none"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            />
          </div>
          <button
            onClick={sync}
            disabled={!url.trim() || status === 'loading'}
            title={currentUrl ? 'Re-sincronizar' : 'Sincronizar'}
            className="flex items-center gap-1.5 px-3.5 rounded-lg text-[13px] font-semibold transition-opacity shrink-0 whitespace-nowrap"
            style={{
              background: status === 'ok' ? '#22c55e' : '#6C3BFF',
              color:      '#fff',
              boxShadow:  status === 'ok' ? 'none' : '0 1px 2px rgba(108,59,255,0.24)',
              opacity: (!url.trim() || status === 'loading') ? 0.5 : 1,
            }}
          >
            {status === 'loading'
              ? <><RefreshCw size={13} className="animate-spin" /> Escaneando</>
              : status === 'ok'
              ? <><Check size={13} /> Escaneado</>
              : <><Scan size={13} /> Escanear</>
            }
          </button>
        </div>
      </div>

      {msg && (
        <p className="flex items-center gap-1.5 text-[12px] rounded-lg px-3 py-2"
          style={{
            color: status === 'error' ? '#dc2626' : '#16a34a',
            background: status === 'error' ? 'rgba(220,38,38,0.06)' : 'rgba(34,197,94,0.06)',
            border: `1px solid ${status === 'error' ? 'rgba(220,38,38,0.2)' : 'rgba(34,197,94,0.2)'}`,
          }}>
          {status === 'error' ? <AlertCircle size={12} /> : <Check size={12} />}
          {msg}
        </p>
      )}

      <p className="text-[11px] leading-relaxed" style={{ color: '#9B8FB5' }}>
        Tu empleado usará el contenido de tu sitio como referencia adicional cuando no encuentre algo en el manual de la organización.
      </p>
    </div>
  );
}
