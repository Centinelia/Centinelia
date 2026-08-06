'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Check, Upload, FileText, X, Image as ImageIcon, UserPlus, SkipForward } from 'lucide-react';
import { toast } from 'sonner';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileDropzone({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const addFiles = (incoming: File[]) => {
    const merged = [...files];
    for (const f of incoming) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} pesa más de 10 MB, no se puede adjuntar.`);
        continue;
      }
      if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
    }
    setFiles(merged);
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => {
          e.preventDefault();
          setDragActive(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className="rounded-xl border-2 border-dashed cursor-pointer transition-colors px-4 py-6 flex flex-col items-center gap-2 text-center"
        style={{
          borderColor: dragActive ? '#6C3BFF' : 'var(--c-border)',
          background:  dragActive ? 'rgba(108,59,255,0.06)' : 'var(--c-bg)',
        }}
      >
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(108,59,255,0.10)' }}>
          <Upload size={16} style={{ color: '#6C3BFF' }} />
        </div>
        <p className="text-sm font-medium" style={{ color: 'var(--c-text)' }}>
          Haz clic o arrastra archivos aquí
        </p>
        <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
          Fotos, PDFs, docs · máx 10 MB por archivo
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={e => addFiles(Array.from(e.target.files ?? []))}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {files.map((f, i) => {
            const isImg = f.type.startsWith('image/');
            const Icon = isImg ? ImageIcon : FileText;
            return (
              <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg px-3 py-2 border" style={{ background: 'var(--c-surface)', borderColor: 'var(--c-border)' }}>
                <Icon size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--c-text-2)' }}>{f.name}</span>
                <span className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>{humanSize(f.size)}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFiles(files.filter((_, idx) => idx !== i)); }}
                  className="p-1 rounded-md hover:bg-black/10 transition-colors"
                  aria-label={`Quitar ${f.name}`}
                >
                  <X size={12} style={{ color: 'var(--c-text-4)' }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
      response_action: props.requestType === 'action'
        ? action
        : props.requestType === 'approval' && approvalDecision
          ? (approvalDecision === 'approved' ? 'done' : 'cannot_do')
          : undefined,
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
              <div className="mb-3">
                <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Archivos (fotos, PDFs, etc.)</p>
                <FileDropzone files={files} setFiles={setFiles} />
              </div>
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
              <label className="block mb-3">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Resultado / notas</span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 w-full text-sm px-3 py-2 rounded-lg border" style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 80 }} />
              </label>
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Adjuntos (opcional)</p>
                <FileDropzone files={files} setFiles={setFiles} />
              </div>
            </>
          )}

          {props.requestType === 'approval' && (
            <>
              <label className="block mb-4">
                <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>Tu respuesta para el empleado</span>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="mt-1 w-full text-sm px-3 py-2 rounded-lg border"
                  style={{ background: 'var(--c-bg)', borderColor: 'var(--c-border)', color: 'var(--c-text)', minHeight: 100 }}
                  placeholder="Ejemplo: 'Rango $8,000 a $15,000 según alcance' o 'Sí, autorizo el descuento' o instrucciones detalladas..."
                />
              </label>

              <div className="mb-4">
                <p className="text-xs mb-2" style={{ color: 'var(--c-text-3)' }}>Adjuntos (opcional)</p>
                <FileDropzone files={files} setFiles={setFiles} />
              </div>

              <details className="rounded-lg border" style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface-2)' }}>
                <summary className="text-xs cursor-pointer px-3 py-2" style={{ color: 'var(--c-text-3)' }}>
                  Marcar decisión formal (opcional) {approvalDecision ? `— ${approvalDecision === 'approved' ? 'Autorizado' : 'No autorizado'}` : ''}
                </summary>
                <div className="px-3 pb-3 pt-1 flex flex-col gap-2">
                  <p className="text-[11px]" style={{ color: 'var(--c-text-4)' }}>
                    Solo si el empleado te pidió un sí/no explícito.
                  </p>
                  {(['approved','rejected'] as const).map(d => (
                    <label key={d} className="flex items-center gap-2 text-sm" style={{ color: 'var(--c-text-2)' }}>
                      <input type="radio" name="approval" value={d} checked={approvalDecision === d} onChange={() => setApprovalDecision(d)} />
                      {d === 'approved' ? 'Autorizado' : 'No autorizado'}
                    </label>
                  ))}
                  {approvalDecision && (
                    <button
                      type="button"
                      onClick={() => setApprovalDecision(null)}
                      className="text-[11px] self-start underline"
                      style={{ color: 'var(--c-text-4)' }}
                    >
                      Quitar decisión
                    </button>
                  )}
                </div>
              </details>
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-5">
            <button
              onClick={submitResponse}
              disabled={saving}
              className="flex-1 min-w-[180px] flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6C3BFF,#9B6DFF)', color: '#fff', border: 'none' }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Enviar respuesta
            </button>
            <button
              onClick={() => setShowRedirect(true)}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'rgba(108,59,255,0.10)', border: '1px solid rgba(108,59,255,0.30)', color: '#6C3BFF' }}
            >
              <UserPlus size={12} /> Redirigir a alguien
            </button>
            <button
              onClick={submitCancel}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626' }}
            >
              <SkipForward size={12} /> No puedo ayudar
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
            <button
              onClick={submitRedirect}
              disabled={saving || !redirectEmail.trim()}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#6C3BFF,#9B6DFF)', color: '#fff', border: 'none' }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Redirigir
            </button>
            <button
              onClick={() => setShowRedirect(false)}
              disabled={saving}
              className="text-xs font-semibold px-4 py-2.5 rounded-xl border transition-colors hover:opacity-80 disabled:opacity-60"
              style={{ borderColor: 'var(--c-border)', color: 'var(--c-text-3)' }}
            >
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
