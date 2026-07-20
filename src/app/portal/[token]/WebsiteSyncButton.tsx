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
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--c-text-4)' }} />
          <input
            type="url"
            value={url}
            onChange={e => { setUrl(e.target.value); setStatus('idle'); setMsg(''); }}
            placeholder="https://tunegocio.com"
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--c-input-bg)', border: '1px solid var(--c-input-border)', color: 'var(--c-text)' }}
          />
        </div>
        <button
          onClick={sync}
          disabled={!url.trim() || status === 'loading'}
          title={currentUrl ? 'Re-sincronizar' : 'Sincronizar'}
          className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-semibold transition-opacity shrink-0 whitespace-nowrap"
          style={{
            background: status === 'ok' ? 'rgba(34,197,94,0.12)' : 'rgba(108,59,255,0.1)',
            color:      status === 'ok' ? '#16a34a' : '#6C3BFF',
            border:     `1px solid ${status === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(108,59,255,0.2)'}`,
            opacity: (!url.trim() || status === 'loading') ? 0.5 : 1,
          }}
        >
          {status === 'loading'
            ? <><RefreshCw size={13} className="animate-spin" /> Escaneando…</>
            : status === 'ok'
            ? <><Check size={13} /> Escaneado</>
            : <><Scan size={13} /> Escanear</>
          }
        </button>
      </div>

      {msg && (
        <p className="flex items-center gap-1.5 text-xs"
          style={{ color: status === 'error' ? '#dc2626' : '#16a34a' }}>
          {status === 'error' ? <AlertCircle size={11} /> : <Check size={11} />}
          {msg}
        </p>
      )}

      <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
        Tu empleado usará el contenido de tu sitio como referencia adicional cuando no encuentre algo en el manual de la organización.
      </p>
    </div>
  );
}
