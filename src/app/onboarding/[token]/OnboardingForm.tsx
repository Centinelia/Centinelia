'use client';

import { useState } from 'react';

interface Props {
  submitToken:       string;
  contactName:       string;
  businessName:      string;
  templateName:      string;
  steps:             string[];
  documentRequests:  string[];
  notes:             string | null;
}

export default function OnboardingForm({ submitToken, contactName, businessName, templateName, steps, documentRequests, notes }: Props) {
  const [step, setStep]         = useState<'form' | 'done'>('form');
  const [responses, setResp]    = useState<Record<string, string>>({});
  const [files, setFiles]       = useState<Record<string, File>>({});
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      // Upload files first
      const uploadedDocs: { name: string; url: string }[] = [];
      for (const [docName, file] of Object.entries(files)) {
        const fd  = new FormData();
        fd.append('file', file);
        fd.append('name', docName);
        const res = await fetch(`/api/onboarding/upload/${submitToken}`, { method: 'POST', body: fd });
        if (res.ok) {
          const { url } = await res.json();
          uploadedDocs.push({ name: docName, url });
        }
      }

      await fetch(`/api/onboarding/submit/${submitToken}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          responses,
          submitted_docs: uploadedDocs,
          contact_name:   contactName,
        }),
      });

      setStep('done');
    } catch {
      setError('Error al enviar. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: '#e2e8f0' }}>¡Listo, {contactName}!</h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14 }}>El equipo de {businessName} revisará tu información pronto.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ display: 'inline-block', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: '4px 14px', color: '#22c55e', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
          Onboarding
        </span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#e2e8f0' }}>Hola, {contactName}</h1>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, margin: 0 }}>{businessName} · {templateName}</p>
      </div>

      {/* Steps info */}
      {steps.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>Proceso</p>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(108,59,255,0.15)', border: '1px solid rgba(108,59,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: '#9B6DFF' }}>{i + 1}</div>
              <p style={{ color: '#e2e8f0', fontSize: 13, margin: 0, paddingTop: 2, lineHeight: 1.6 }}>{s}</p>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{notes}</p>
        </div>
      )}

      {/* Responses */}
      {steps.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>Tus respuestas</p>
          {steps.map((s, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', color: '#e2e8f0', fontSize: 13, marginBottom: 6 }}>{s}</label>
              <textarea
                rows={2}
                value={responses[s] ?? ''}
                onChange={ev => setResp(prev => ({ ...prev, [s]: ev.target.value }))}
                placeholder="Tu respuesta..."
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13,
                  resize: 'vertical', fontFamily: 'Arial, sans-serif',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Document uploads */}
      {documentRequests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px' }}>Documentos solicitados</p>
          {documentRequests.map((doc, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', color: '#e2e8f0', fontSize: 13, marginBottom: 6 }}>{doc}</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={ev => {
                  const f = ev.target.files?.[0];
                  if (f) setFiles(prev => ({ ...prev, [doc]: f }));
                }}
                style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}
              />
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        type="submit"
        disabled={saving}
        style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: saving ? 'rgba(108,59,255,0.5)' : 'linear-gradient(135deg,#6C3BFF,#9B6DFF)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Enviando...' : 'Enviar información'}
      </button>
    </form>
  );
}
