'use client';

import { useState } from 'react';

export default function UploadForm({ folio }: { folio: string }) {
  const [file, setFile]     = useState<File | null>(null);
  const [state, setState]   = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setState('uploading');
    setMessage('');
    try {
      const fd = new FormData();
      fd.append('folio', folio);
      fd.append('file',  file);
      const res  = await fetch('/api/public/civic-report-attach', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? 'Error inesperado');
      setState('ok');
      setMessage('¡Listo! Tu foto se subió correctamente.');
      setFile(null);
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
        onChange={e => { setFile(e.target.files?.[0] ?? null); setState('idle'); setMessage(''); }}
        style={{ padding: 10, border: '1px solid #eef', borderRadius: 8, fontSize: 14 }}
        required
      />
      <button
        type="submit"
        disabled={!file || state === 'uploading'}
        style={{
          padding: '12px 16px',
          background: !file || state === 'uploading' ? '#c7bfe6' : '#6C3BFF',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          cursor: !file || state === 'uploading' ? 'default' : 'pointer',
        }}
      >
        {state === 'uploading' ? 'Subiendo…' : 'Subir foto'}
      </button>
      {message && (
        <div style={{
          padding: 12,
          borderRadius: 8,
          background: state === 'ok' ? '#dcfce7' : '#fee2e2',
          color:      state === 'ok' ? '#166534' : '#991b1b',
          fontSize: 14,
        }}>
          {message}
        </div>
      )}
    </form>
  );
}
