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
      <div>
        <label className="text-[13px] font-semibold block mb-1" style={{ color: '#1A0A3B' }}>
          Sitio web del negocio
        </label>
        <p className="text-[12px] mb-2.5" style={{ color: '#6B6480' }}>
          Tu empleado escanea el contenido del sitio y lo usa como referencia cuando algo no está en el manual.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9B8FB5' }} />
            <input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus('idle'); setMsg(''); }}
              placeholder="https://tunegocio.com"
              className="w-full pl-10 pr-3 py-2.5 rounded-lg text-[14px] outline-none transition-colors focus:border-[#6C3BFF]"
              style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#1A0A3B' }}
            />
          </div>
          <button
            onClick={sync}
            disabled={!url.trim() || status === 'loading'}
            title={currentUrl ? 'Re-escanear' : 'Escanear'}
            className="flex items-center gap-1.5 px-4 rounded-lg text-[13px] font-semibold transition-opacity shrink-0 whitespace-nowrap"
            style={{
              background: status === 'ok' ? '#22c55e' : '#6C3BFF',
              color:      '#fff',
              boxShadow:  status === 'ok'
                ? '0 4px 12px rgba(34,197,94,0.24)'
                : '0 4px 12px rgba(108,59,255,0.24)',
              opacity: (!url.trim() || status === 'loading') ? 0.5 : 1,
            }}
          >
            {status === 'loading'
              ? <><RefreshCw size={14} className="animate-spin" /> Escaneando</>
              : status === 'ok'
              ? <><Check size={14} strokeWidth={2.5} /> Escaneado</>
              : <><Scan size={14} /> {currentUrl ? 'Re-escanear' : 'Escanear'}</>
            }
          </button>
        </div>
      </div>

      {msg && (
        <p className="flex items-center gap-1.5 text-[12px] rounded-lg px-3 py-2 font-medium"
          style={{
            color: status === 'error' ? '#dc2626' : '#16a34a',
            background: status === 'error' ? 'rgba(220,38,38,0.08)' : 'rgba(34,197,94,0.08)',
            border: `1px solid ${status === 'error' ? 'rgba(220,38,38,0.25)' : 'rgba(34,197,94,0.25)'}`,
          }}>
          {status === 'error' ? <AlertCircle size={12} /> : <Check size={12} strokeWidth={2.5} />}
          {msg}
        </p>
      )}
    </div>
  );
}
