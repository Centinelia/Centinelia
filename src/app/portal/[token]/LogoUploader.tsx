'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import Image from 'next/image';

export default function LogoUploader({ token, currentUrl, compact }: { token: string; currentUrl: string | null; compact?: boolean }) {
  const inputRef            = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const router = useRouter();

  const handleFile = async (file: File) => {
    setError('');
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setLoading(true);
    const fd = new FormData();
    fd.append('logo', file);
    try {
      const res  = await fetch(`/api/portal/${token}/upload-logo`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error al subir');
        setPreview(currentUrl);
      } else {
        setPreview(data.url);
        router.refresh();
      }
    } finally {
      setLoading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleRemove = async () => {
    setPreview(null);
    await fetch(`/api/portal/${token}/upload-logo`, {
      method: 'DELETE',
    });
    router.refresh();
  };

  if (compact) return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        title={preview ? 'Cambiar logo' : 'Subir logo'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(108,59,255,0.08)', color: '#9B6DFF', border: '1px solid rgba(108,59,255,0.2)', opacity: loading ? 0.6 : 1 }}
      >
        <Upload size={11} /> {loading ? 'Subiendo…' : preview ? 'Cambiar logo' : 'Subir logo'}
      </button>
      {preview && !loading && (
        <button onClick={handleRemove} title="Quitar logo"
          className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
          style={{ color: 'var(--c-text-3)' }}>
          <X size={13} />
        </button>
      )}
      {error && <span className="text-xs" style={{ color: '#dc2626' }}>{error}</span>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative group" style={{ width: 160, height: 104 }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          title={loading ? 'Subiendo…' : preview ? 'Cambiar logo' : 'Subir logo'}
          className="w-full h-full rounded-2xl overflow-hidden flex items-center justify-center relative transition-all"
          style={{
            background: '#FAFAFB',
            border: preview ? '1px solid #E8E3F5' : '2px dashed rgba(108,59,255,0.25)',
            cursor: loading ? 'wait' : 'pointer',
            padding: 0,
            boxShadow: preview ? '0 1px 2px rgba(26,10,59,0.04)' : 'none',
          }}
        >
          {preview
            ? <img src={preview} alt="Logo" className="w-full h-full object-contain p-3" />
            : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(108,59,255,0.1)' }}>
                  <Upload size={16} style={{ color: '#6C3BFF' }} />
                </div>
                <span className="text-[11px] font-medium" style={{ color: '#6C3BFF' }}>Sube tu logo</span>
              </div>
            )
          }
          {preview && (
            <div
              className="absolute inset-0 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(15,5,34,0.55)', backdropFilter: 'blur(2px)' }}
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: '#ffffff', color: '#1A0A3B', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                <Upload size={13} />
                <span className="text-[12px] font-semibold">Cambiar</span>
              </div>
            </div>
          )}
        </button>
        {preview && !loading && (
          <button
            onClick={handleRemove}
            title="Quitar logo"
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: '#ffffff', border: '1px solid #E8E3F5', color: '#6B6480', boxShadow: '0 2px 6px rgba(26,10,59,0.12)' }}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
    </div>
  );
}
