'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface SubUser {
  id: string;
  email: string;
  name: string | null;
  modules: string[] | null;
}

interface Props {
  token:        string;
  requestId:    string;
  requestType:  'info' | 'action' | 'approval';
  title:        string;
  description:  string;
  originalEmail: { from: string; subject: string; body: string } | null;
  status:       string;
}

export default function RespondForm(props: Props) {
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [action, setAction] = useState<'done' | 'cannot_do' | 'partial' | null>(null);
  const [approvalDecision, setApprovalDecision] = useState<'approved' | 'rejected' | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRedirect, setShowRedirect] = useState(false);
  const [subUsers, setSubUsers] = useState<SubUser[]>([]);
  const [redirectEmail, setRedirectEmail] = useState('');
  const [redirectNote, setRedirectNote] = useState('');
  const [redirectSearch, setRedirectSearch] = useState('');

  useEffect(() => {
    if (!showRedirect) return;
    fetch(`/api/portal/${props.token}/users`)
      .then(r => r.json())
      .then(d => setSubUsers((d.users ?? []).filter((u: SubUser & { is_owner?: boolean }) => !u.is_owner)))
      .catch(() => {});
  }, [showRedirect, props.token]);

  if (props.status !== 'pending' && props.status !== 'escalated') {
    return (
      <div className="p-6 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>Esta solicitud ya fue procesada (estado: {props.status}).</p>
      </div>
    );
  }

  async function submit(payload: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/portal/${props.token}/requests/${props.requestId}/respond`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; throw new Error(b.error ?? 'Error'); }
      toast.success('Respuesta enviada');
      setTimeout(() => { window.location.href = `/portal/${props.token}/oficina/bandeja`; }, 800);
    } catch (err) {
      toast.error(`No se pudo enviar: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function submitResponse() {
    const filesPayload = await Promise.all(files.map(async f => ({
      name: f.name,
      mime_type: f.type,
      base64: await fileToBase64(f),
    })));
    await submit({
      response_text: notes.trim() || undefined,
      response_files: filesPayload,
      response_action: props.requestType === 'action' ? action : props.requestType === 'approval' ? (approvalDecision === 'approved' ? 'done' : 'cannot_do') : undefined,
    });
  }

  async function submitRedirect() {
    if (!redirectEmail.trim()) { toast.error('Ingresa un correo'); return; }
    await submit({ redirect_to_email: redirectEmail.trim(), redirect_note: redirectNote.trim() || undefined });
  }

  async function submitCancel() {
    if (!confirm('¿Marcar como "no puedo ayudar"? El empleado procederá sin esta info.')) return;
    await submit({ cancel: true });
  }

  const filteredUsers = subUsers.filter(u => {
    const q = redirectSearch.toLowerCase();
    return !q || (u.name ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="p-5 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--c-text)' }}>{props.title}</p>
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--c-text-2)', lineHeight: 1.6 }}>{props.description}</p>
      </div>

      {props.originalEmail && (
        <details className="p-4 rounded-xl border" style={{ background: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--c-text-3)' }}>Contexto: correo original</summary>
          <p className="text-xs mt-2 mb-1" style={{ color: 'var(--c-text-3)' }}>De: {props.originalEmail.from}</p>
          <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Asunto: {props.originalEmail.subject}</p>
          <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--c-text-3)', lineHeight: 1.5 }}>{props.originalEmail.body.slice(0, 3000)}</p>
        </details>
      )}

      {!showRedirect && (
        <div className="p-5 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--c-text-4)' }}>Tu respuesta</p>

          {props.requestType === 'info' && (
            <>
              <label className="block mb-2">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Archivos (fotos, PDFs, etc.)</span>
                <input type="file" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} className="mt-1 block w-full text-sm" />
              </label>
              {files.length > 0 && <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>{files.length} archivo(s) seleccionado(s)</p>}
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Notas (opcional)</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} placeholder="Detalles adicionales para el empleado..." />
              </label>
            </>
          )}

          {props.requestType === 'action' && (
            <>
              <div className="flex flex-col gap-2 mb-3">
                {(['done','partial','cannot_do'] as const).map(a => (
                  <label key={a} className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text-2)' }}>
                    <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
                    {a === 'done' ? 'Ya lo hice' : a === 'partial' ? 'Solo parcialmente' : 'No pude hacerlo'}
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Resultado / notas</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} />
              </label>
            </>
          )}

          {props.requestType === 'approval' && (
            <>
              <div className="flex flex-col gap-2 mb-3">
                {(['approved','rejected'] as const).map(d => (
                  <label key={d} className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text-2)' }}>
                    <input type="radio" name="approval" value={d} checked={approvalDecision === d} onChange={() => setApprovalDecision(d)} />
                    {d === 'approved' ? 'Aprobado' : 'Rechazado'}
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Motivo / notas</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} />
              </label>
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={submitResponse} disabled={saving} className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#6C3BFF', color: '#fff' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enviar respuesta
            </button>
            <button onClick={() => setShowRedirect(true)} disabled={saving} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: 'var(--c-border)', color: 'var(--c-text-2)' }}>
              Redirigir a alguien
            </button>
            <button onClick={submitCancel} disabled={saving} className="text-sm px-4 py-2 rounded-lg" style={{ color: '#dc2626' }}>
              No puedo ayudar
            </button>
          </div>
        </div>
      )}

      {showRedirect && (
        <div className="p-5 rounded-xl border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--c-text)' }}>&iquest;A qui&eacute;n redirigimos?</p>
          <input type="text" placeholder="Buscar empleado..." value={redirectSearch} onChange={e => setRedirectSearch(e.target.value)} className="w-full text-sm px-3 py-2 mb-3 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
          <div className="max-h-48 overflow-y-auto mb-3">
            {filteredUsers.map(u => (
              <label key={u.id} className="flex items-start gap-2 p-2 rounded-lg cursor-pointer hover:bg-black/5">
                <input type="radio" name="redirect_user" checked={redirectEmail === u.email} onChange={() => setRedirectEmail(u.email)} className="mt-1" />
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--c-text)' }}>{u.name ?? '(sin nombre)'}</div>
                  <div className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{u.email}{u.modules?.[0] ? ` · ${u.modules[0]}` : ''}</div>
                </div>
              </label>
            ))}
            {filteredUsers.length === 0 && <p className="text-xs p-2" style={{ color: 'var(--c-text-4)' }}>Sin empleados registrados. Puedes usar un correo externo abajo.</p>}
          </div>
          <div className="mb-3">
            <p className="text-xs mb-1" style={{ color: 'var(--c-text-3)' }}>o correo externo:</p>
            <input type="email" placeholder="correo@externo.com" value={redirectEmail} onChange={e => setRedirectEmail(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }} />
          </div>
          <label className="block mb-3">
            <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Nota (opcional):</span>
            <textarea value={redirectNote} onChange={e => setRedirectNote(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 60 }} />
          </label>
          <div className="flex gap-2">
            <button onClick={submitRedirect} disabled={saving || !redirectEmail.trim()} className="text-sm font-semibold px-4 py-2 rounded-lg" style={{ background: '#6C3BFF', color: '#fff' }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Redirigir
            </button>
            <button onClick={() => setShowRedirect(false)} disabled={saving} className="text-sm px-4 py-2 rounded-lg border" style={{ borderColor: 'var(--c-border)', color: 'var(--c-text-2)' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.split(',')[1] ?? '');
    };
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}
