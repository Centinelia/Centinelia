'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, ChevronRight, ArrowLeft } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SpeechStyle = 'usted' | 'tu';

interface ImproveState {
  raw:      string;
  improved: string;
  showing:  boolean;
  uses:     number;
  loading:  boolean;
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width:      i + 1 === current ? 20 : 8,
            height:     8,
            background: i + 1 <= current ? '#6C3BFF' : 'var(--c-border)',
          }}
        />
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6 sm:p-8 w-full"
      style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-2)' }}
    >
      {children}
    </div>
  );
}

function PrimaryBtn({ onClick, disabled, loading, children }: { onClick?: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
      style={{
        background: '#6C3BFF',
        color:      '#fff',
        border:     'none',
        cursor:     disabled || loading ? 'not-allowed' : 'pointer',
        opacity:    disabled || loading ? 0.6 : 1,
      }}
    >
      {loading ? 'Un momento...' : children}
    </button>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm transition-opacity hover:opacity-70"
      style={{ background: 'none', border: '1px solid var(--c-border)', color: 'var(--c-text-2)', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

// ── Improve widget (shared by steps 2 and 3) ──────────────────────────────────

function ImproveWidget({
  token,
  field,
  state,
  onChange,
  onImprove,
  onApprove,
  placeholder,
}: {
  token:      string;
  field:      'mission' | 'service_definition';
  state:      ImproveState;
  onChange:   (val: string) => void;
  onImprove:  (improved: string) => void;
  onApprove:  () => void;
  placeholder: string;
}) {
  const improve = async () => {
    if (!state.raw.trim() || state.uses === 0) return;
    const res = await fetch('/api/onboarding/improve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, text: state.raw, field }),
    });
    if (res.ok) {
      const d = await res.json() as { improved: string };
      onImprove(d.improved);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!state.showing ? (
        <>
          <textarea
            value={state.raw}
            onChange={e => onChange(e.target.value)}
            rows={4}
            placeholder={placeholder}
            className="w-full px-4 py-3 rounded-xl text-sm resize-none"
            style={{
              background:  'var(--c-surface-2)',
              border:      '1px solid var(--c-border)',
              color:       'var(--c-text)',
              outline:     'none',
              lineHeight:  1.7,
            }}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={improve}
              disabled={!state.raw.trim() || state.uses === 0 || state.loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
              style={{
                background: 'rgba(108,59,255,0.12)',
                border:     '1px solid rgba(108,59,255,0.3)',
                color:      '#9B6DFF',
                cursor:     !state.raw.trim() || state.uses === 0 ? 'not-allowed' : 'pointer',
                opacity:    !state.raw.trim() || state.uses === 0 ? 0.5 : 1,
              }}
            >
              <Sparkles size={12} />
              {state.loading ? 'Mejorando...' : 'Mejorar automáticamente'}
              <span className="flex gap-0.5 ml-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: i < state.uses ? '#9B6DFF' : 'var(--c-border)' }}
                  />
                ))}
              </span>
            </button>
            <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
              {state.uses} mejora{state.uses !== 1 ? 's' : ''} disponible{state.uses !== 1 ? 's' : ''}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
                Lo que escribiste
              </p>
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)', lineHeight: 1.7 }}
              >
                {state.raw}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#9B6DFF' }}>
                Version mejorada (puedes editarla)
              </p>
              <textarea
                value={state.improved}
                onChange={e => onImprove(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                style={{
                  background: 'rgba(108,59,255,0.05)',
                  border:     '1px solid rgba(108,59,255,0.3)',
                  color:      'var(--c-text)',
                  outline:    'none',
                  lineHeight: 1.7,
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {state.uses > 0 && (
              <button
                onClick={improve}
                disabled={state.loading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                style={{
                  background: 'rgba(108,59,255,0.08)',
                  border:     '1px solid rgba(108,59,255,0.2)',
                  color:      '#9B6DFF',
                  cursor:     state.loading ? 'not-allowed' : 'pointer',
                }}
              >
                <Sparkles size={12} />
                {state.loading ? 'Mejorando...' : 'Mejorar de nuevo'}
                <span className="flex gap-0.5 ml-1">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="rounded-full"
                      style={{ width: 6, height: 6, background: i < state.uses ? '#9B6DFF' : 'var(--c-border)' }}
                    />
                  ))}
                </span>
              </button>
            )}
            <button
              onClick={onApprove}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Check size={12} /> Aprobar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function Step1Welcome({ businessName, onNext }: { businessName: string; onNext: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center text-center gap-6">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.25)' }}
        >
          <Sparkles size={28} style={{ color: '#9B6DFF' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--c-text)' }}>
            Bienvenido, {businessName}.
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--c-text-2)', maxWidth: 420, margin: '0 auto' }}>
            Antes de configurar nada, cuéntanos quiénes son.
          </p>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--c-text-3)', maxWidth: 380, margin: '12px auto 0' }}>
            Esto define cómo trabaja todo tu equipo de Centinelia. Toma 3 minutos.
          </p>
        </div>
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #6C3BFF, #9B6DFF)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          Comenzar <ChevronRight size={16} />
        </button>
      </div>
    </Card>
  );
}

function Step2Mission({
  token,
  state,
  approved,
  onChange,
  onImprove,
  onMarkApproved,
  onNext,
  onBack,
}: {
  token:          string;
  state:          ImproveState;
  approved:       boolean;
  onChange:       (val: string) => void;
  onImprove:      (val: string) => void;
  onMarkApproved: () => void;
  onNext:         () => void;
  onBack:         () => void;
}) {
  const canContinue = approved || state.raw.trim().length > 10;

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <StepDots current={2} total={4} />
          <button onClick={onBack} className="flex items-center gap-1 text-xs" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)' }}>
            <ArrowLeft size={12} /> Volver
          </button>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
            Paso 1 de 3
          </h2>
          <p className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>
            ¿Cuál es la misión de tu organización?
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
            Con tus propias palabras. No tiene que ser perfecta.
          </p>
        </div>

        <ImproveWidget
          token={token}
          field="mission"
          state={state}
          onChange={onChange}
          onImprove={onImprove}
          onApprove={onMarkApproved}
          placeholder="Ej: Que cada ciudadano sienta que el municipio lo escucha y recibe una respuesta clara."
        />

        <div className="flex justify-end gap-3">
          {canContinue && (
            <PrimaryBtn onClick={onNext}>
              Continuar <ChevronRight size={14} />
            </PrimaryBtn>
          )}
        </div>
      </div>
    </Card>
  );
}

function Step3Service({
  token,
  state,
  approved,
  onChange,
  onImprove,
  onMarkApproved,
  onNext,
  onBack,
}: {
  token:          string;
  state:          ImproveState;
  approved:       boolean;
  onChange:       (val: string) => void;
  onImprove:      (val: string) => void;
  onMarkApproved: () => void;
  onNext:         () => void;
  onBack:         () => void;
}) {
  const canContinue = approved || state.raw.trim().length > 10;

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <StepDots current={3} total={4} />
          <button onClick={onBack} className="flex items-center gap-1 text-xs" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)' }}>
            <ArrowLeft size={12} /> Volver
          </button>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
            Paso 2 de 3
          </h2>
          <p className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>
            ¿Que significa servir bien a las personas para ustedes?
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
            Piensa en el ciudadano o cliente ideal saliendo de la llamada. ¿Cómo se siente?
          </p>
        </div>

        <ImproveWidget
          token={token}
          field="service_definition"
          state={state}
          onChange={onChange}
          onImprove={onImprove}
          onApprove={onMarkApproved}
          placeholder="Ej: Que la persona cuelgue sabiendo exactamente qué sigue y quién lo atiende."
        />

        <div className="flex justify-end gap-3">
          {canContinue && (
            <PrimaryBtn onClick={onNext}>
              Continuar <ChevronRight size={14} />
            </PrimaryBtn>
          )}
        </div>
      </div>
    </Card>
  );
}

function Step4Tone({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value:    SpeechStyle;
  onChange: (v: SpeechStyle) => void;
  onNext:   () => void;
  onBack:   () => void;
}) {
  const options: { value: SpeechStyle; label: string; subtitle: string; desc: string }[] = [
    {
      value:    'usted',
      label:    'Formal',
      subtitle: '"Usted"',
      desc:     'Respeto total. Para instituciones, gobierno, servicios profesionales.',
    },
    {
      value:    'tu',
      label:    'Cercano',
      subtitle: '"Tu"',
      desc:     'Calidez natural. Para negocios orientados a personas, retail, servicios.',
    },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <StepDots current={4} total={4} />
          <button onClick={onBack} className="flex items-center gap-1 text-xs" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)' }}>
            <ArrowLeft size={12} /> Volver
          </button>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
            Paso 3 de 3
          </h2>
          <p className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>
            ¿Cómo habla su organización con las personas?
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--c-text-4)' }}>
            El trato define la relación. Puedes cambiarlo solo con autorización del responsable de la cuenta.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {options.map(opt => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className="flex-1 flex flex-col gap-2 p-5 rounded-xl text-left transition-all"
                style={{
                  background: active ? 'rgba(108,59,255,0.10)' : 'var(--c-surface-2)',
                  border:     `2px solid ${active ? '#6C3BFF' : 'var(--c-border)'}`,
                  cursor:     'pointer',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: active ? '#9B6DFF' : 'var(--c-text)' }}>
                    {opt.label}
                  </span>
                  {active && <Check size={14} style={{ color: '#9B6DFF' }} />}
                </div>
                <p className="text-base font-semibold" style={{ color: active ? '#9B6DFF' : 'var(--c-text-2)' }}>
                  {opt.subtitle}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <PrimaryBtn onClick={onNext}>
            Ver el norte de mi equipo <ChevronRight size={14} />
          </PrimaryBtn>
        </div>
      </div>
    </Card>
  );
}

function Step5Summary({
  token,
  mission,
  serviceDefinition,
  speechStyle,
  businessName,
  onDone,
}: {
  token:             string;
  mission:           string;
  serviceDefinition: string;
  speechStyle:       SpeechStyle;
  businessName:      string;
  onDone:            () => void;
}) {
  const [behaviors, setBehaviors]   = useState<string[]>([]);
  const [saving,    setSaving]      = useState(false);
  const [loading,   setLoading]     = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/onboarding/improve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, text: mission, field: 'behaviors', context: serviceDefinition }),
    })
      .then(r => r.json() as Promise<{ behaviors: string[] }>)
      .then(d => setBehaviors(d.behaviors ?? []))
      .finally(() => setLoading(false));
  }, [token, mission, serviceDefinition]);

  const complete = async () => {
    setSaving(true);
    await fetch('/api/onboarding/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        token,
        organization_mission: mission,
        service_definition:   serviceDefinition,
        speech_style:         speechStyle,
      }),
    });
    setSaving(false);
    onDone();
  };

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            <Check size={22} style={{ color: '#22c55e' }} />
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--c-text)' }}>
            Asi trabaja tu equipo.
          </h2>
          <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>
            Este es el norte que guia cada interaccion de {businessName}.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-4" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
              Mision
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)', fontStyle: 'italic' }}>
              "{mission}"
            </p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
              Buen servicio significa
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text)', fontStyle: 'italic' }}>
              "{serviceDefinition}"
            </p>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
              Tono
            </p>
            <p className="text-sm" style={{ color: 'var(--c-text)' }}>
              {speechStyle === 'usted' ? 'Formal · Usted' : 'Cercano · Tu'}
            </p>
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ background: 'rgba(108,59,255,0.06)', border: '1px solid rgba(108,59,255,0.2)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: '#9B6DFF' }}>
            Con esto, tu equipo va a:
          </p>
          {loading ? (
            <p className="text-xs" style={{ color: 'var(--c-text-4)' }}>Derivando comportamientos...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {behaviors.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Check size={13} style={{ color: '#22c55e', marginTop: 2, flexShrink: 0 }} />
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-2)' }}>{b}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-center" style={{ color: 'var(--c-text-4)' }}>
          El dueno de la cuenta puede ajustar esto desde Configuracion.
        </p>

        <div className="flex justify-center">
          <PrimaryBtn onClick={complete} loading={saving}>
            Preparar a mi empleado <ChevronRight size={14} />
          </PrimaryBtn>
        </div>
      </div>
    </Card>
  );
}

// ── Step 6: Review description + generate KBs ─────────────────────────────────

type GenPhase = 'review' | 'gen-business' | 'gen-role' | 'done';

function Step6PrepareAgent({
  token,
  initialDesc,
  agentRole,
  agentName,
}: {
  token:       string;
  initialDesc: string;
  agentRole:   string;
  agentName:   string | null;
}) {
  const router                        = useRouter();
  const [desc, setDesc]               = useState(initialDesc);
  const [phase, setPhase]             = useState<GenPhase>('review');
  const [businessKb, setBusinessKb]   = useState('');
  const [roleKb, setRoleKb]           = useState('');
  const [error, setError]             = useState<string | null>(null);
  const kbEndRef                      = useRef<HTMLDivElement>(null);
  const roleEndRef                    = useRef<HTMLDivElement>(null);

  useEffect(() => { kbEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [businessKb]);
  useEffect(() => { roleEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [roleKb]);

  async function streamKb(type: 'business' | 'role'): Promise<string> {
    const setter = type === 'business' ? setBusinessKb : setRoleKb;
    const res = await fetch(`/api/portal/${token}/generate-kb`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type, role: type === 'role' ? agentRole : undefined }),
    });
    if (!res.ok) {
      const { error: err } = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(err ?? 'Error generando');
    }
    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let generated = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') break;
        try {
          const { text, error: e } = JSON.parse(payload);
          if (e) throw new Error(e);
          if (text) { generated += text; setter(prev => prev + text); }
        } catch { /* ignore malformed chunks */ }
      }
    }
    return generated;
  }

  async function saveField(key: string, value: string) {
    // TODO: pass agentId once available — setup flow saves org-level fields only
    // (business_description, knowledge_base, role_knowledge_base) so no agentId
    // is needed here. If per-agent fields are added to setup, thread agentId from props.
    await fetch(`/api/portal/${token}/settings`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [key]: value }),
    });
  }

  const generate = async () => {
    setError(null);
    try {
      // Save edited description first
      if (desc.trim() !== initialDesc.trim()) {
        await saveField('business_description', desc.trim());
      }

      // Generate & save business KB
      setPhase('gen-business');
      const bKb = await streamKb('business');
      await saveField('knowledge_base', bKb);

      // Generate & save role KB if the agent has a role
      if (agentRole?.trim()) {
        setPhase('gen-role');
        const rKb = await streamKb('role');
        await saveField('role_knowledge_base', rKb);
      }

      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar. Puedes intentarlo desde el portal.');
      setPhase('review');
    }
  };

  const hasRole = !!agentRole?.trim();
  const opsCost = hasRole ? 6 : 3;

  return (
    <Card>
      <div className="flex flex-col gap-6">

        {/* Header */}
        {phase === 'review' && (
          <>
            <div>
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
                Revisemos los datos de tu organización
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-3)' }}>
                Con esta descripción vamos a generar la base de conocimiento de la organización
                {hasRole ? ` y las instrucciones de ${agentName ?? 'tu empleado'}` : ''}.
                Edítala si quieres ajustar algo antes de generar.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--c-text-4)' }}>
                Descripción de la organización
              </p>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl text-sm resize-none"
                style={{
                  background:  'var(--c-surface-2)',
                  border:      '1px solid var(--c-border)',
                  color:       'var(--c-text)',
                  outline:     'none',
                  lineHeight:  1.7,
                }}
              />
            </div>

            {hasRole && (
              <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
                <Sparkles size={14} style={{ color: '#9B6DFF', flexShrink: 0 }} />
                <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                  También se generarán las instrucciones de rol de <strong style={{ color: 'var(--c-text-2)' }}>{agentName ?? 'tu empleado'}</strong>
                  {agentRole ? ` (${agentRole})` : ''}.
                </p>
              </div>
            )}

            {error && (
              <p className="text-xs rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {error}
              </p>
            )}

            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>
                Consume {opsCost} operaciones
              </span>
              <PrimaryBtn onClick={generate} disabled={!desc.trim()}>
                Generar bases de conocimiento <ChevronRight size={14} />
              </PrimaryBtn>
            </div>

            <button
              onClick={() => router.push(`/portal/${token}`)}
              className="text-xs text-center transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text-4)' }}
            >
              Omitir por ahora, ir al portal
            </button>
          </>
        )}

        {/* Generation progress */}
        {(phase === 'gen-business' || phase === 'gen-role') && (
          <div className="flex flex-col gap-5">
            <div className="text-center">
              <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--c-text)' }}>
                Generando…
              </h2>
              <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
                No cierres esta ventana
              </p>
            </div>

            {/* Business KB block */}
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}>
                {businessKb ? (
                  <Check size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                ) : (
                  <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" style={{ color: '#9B6DFF', flexShrink: 0 }} />
                )}
                <p className="text-xs font-semibold" style={{ color: businessKb ? '#22c55e' : 'var(--c-text-2)' }}>
                  Base de conocimiento de la organización
                </p>
              </div>
              {businessKb && (
                <div className="px-4 py-3 max-h-40 overflow-y-auto" style={{ background: 'transparent' }}>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-4)' }}>
                    {businessKb.slice(0, 400)}{businessKb.length > 400 ? '…' : ''}
                  </p>
                  <div ref={kbEndRef} />
                </div>
              )}
            </div>

            {/* Role KB block */}
            {hasRole && (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}>
                  {roleKb ? (
                    <Check size={13} style={{ color: '#22c55e', flexShrink: 0 }} />
                  ) : phase === 'gen-role' ? (
                    <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" style={{ color: '#9B6DFF', flexShrink: 0 }} />
                  ) : (
                    <div className="w-3 h-3 rounded-full" style={{ background: 'var(--c-border)', flexShrink: 0 }} />
                  )}
                  <p className="text-xs font-semibold" style={{ color: roleKb ? '#22c55e' : phase === 'gen-role' ? 'var(--c-text-2)' : 'var(--c-text-4)' }}>
                    Instrucciones de {agentName ?? 'tu empleado'}
                  </p>
                </div>
                {roleKb && (
                  <div className="px-4 py-3 max-h-40 overflow-y-auto">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--c-text-4)' }}>
                      {roleKb.slice(0, 400)}{roleKb.length > 400 ? '…' : ''}
                    </p>
                    <div ref={roleEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Done */}
        {phase === 'done' && (
          <div className="flex flex-col items-center text-center gap-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              <Check size={26} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--c-text)' }}>
                ¡Tu empleado está listo!
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--c-text-3)', maxWidth: 360, margin: '0 auto' }}>
                Generamos {hasRole ? 'las bases de conocimiento' : 'la base de conocimiento'}. Puedes revisarlas y ajustarlas en cualquier momento desde el portal.
              </p>
            </div>
            <PrimaryBtn onClick={() => router.push(`/portal/${token}`)}>
              Ir al portal <ChevronRight size={14} />
            </PrimaryBtn>
          </div>
        )}

      </div>
    </Card>
  );
}

// ── Root wizard ───────────────────────────────────────────────────────────────

function makeImproveState(): ImproveState {
  return { raw: '', improved: '', showing: false, uses: 3, loading: false };
}

export default function SetupFlow({ token, businessName, businessDesc, agentRole, agentName }: {
  token:        string;
  businessName: string;
  businessDesc: string;
  agentRole:    string;
  agentName:    string | null;
}) {
  const [step, setStep] = useState(1);

  const [missionState,  setMissionState]  = useState<ImproveState>(makeImproveState());
  const [missionOk,     setMissionOk]     = useState(false);

  const [serviceState,  setServiceState]  = useState<ImproveState>(makeImproveState());
  const [serviceOk,     setServiceOk]     = useState(false);

  const [speechStyle,   setSpeechStyle]   = useState<SpeechStyle>('usted');

  // Final approved values (raw if not improved, improved if approved)
  const missionFinal  = missionOk  ? missionState.improved  || missionState.raw  : missionState.raw;
  const serviceFinal  = serviceOk  ? serviceState.improved  || serviceState.raw  : serviceState.raw;

  // Shared improve handler builder
  function makeHandlers(setState: React.Dispatch<React.SetStateAction<ImproveState>>, setOk: (v: boolean) => void) {
    return {
      onChange:       (val: string) => setState(s => ({ ...s, raw: val, showing: false })),
      onImprove:      (val: string) => setState(s => ({ ...s, improved: val, showing: true, uses: Math.max(0, s.uses - (s.showing ? 0 : 1)), loading: false })),
      onMarkApproved: () => setOk(true),
      setLoading:     (v: boolean) => setState(s => ({ ...s, loading: v })),
    };
  }

  const mH = makeHandlers(setMissionState, setMissionOk);
  const sH = makeHandlers(setServiceState, setServiceOk);

  // Intercept improve calls to manage loading state
  async function improveWrapper(
    field:    'mission' | 'service_definition',
    state:    ImproveState,
    setState: React.Dispatch<React.SetStateAction<ImproveState>>,
    val:      string,
  ) {
    setState(s => ({ ...s, loading: true }));
    const res = await fetch('/api/onboarding/improve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, text: val, field }),
    });
    if (res.ok) {
      const d = await res.json() as { improved: string };
      setState(s => ({ ...s, improved: d.improved, showing: true, uses: Math.max(0, s.uses - 1), loading: false }));
    } else {
      setState(s => ({ ...s, loading: false }));
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--c-bg)' }}
    >
      {/* Logo / brand */}
      <div className="mb-8 text-center">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--c-text-4)' }}>
          Centinelia
        </p>
      </div>

      <div className="w-full max-w-xl">
        {step === 1 && (
          <Step1Welcome businessName={businessName} onNext={() => setStep(2)} />
        )}

        {step === 2 && (
          <Step2Mission
            token={token}
            state={missionState}
            approved={missionOk}
            onChange={mH.onChange}
            onImprove={val => {
              improveWrapper('mission', missionState, setMissionState, missionState.showing ? missionState.improved : missionState.raw);
              void val;
            }}
            onMarkApproved={() => { setMissionOk(true); setStep(3); }}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Step3Service
            token={token}
            state={serviceState}
            approved={serviceOk}
            onChange={sH.onChange}
            onImprove={val => {
              improveWrapper('service_definition', serviceState, setServiceState, serviceState.showing ? serviceState.improved : serviceState.raw);
              void val;
            }}
            onMarkApproved={() => { setServiceOk(true); setStep(4); }}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <Step4Tone
            value={speechStyle}
            onChange={setSpeechStyle}
            onNext={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && (
          <Step5Summary
            token={token}
            mission={missionFinal}
            serviceDefinition={serviceFinal}
            speechStyle={speechStyle}
            businessName={businessName}
            onDone={() => setStep(6)}
          />
        )}

        {step === 6 && (
          <Step6PrepareAgent
            token={token}
            initialDesc={businessDesc}
            agentRole={agentRole}
            agentName={agentName}
          />
        )}
      </div>
    </div>
  );
}
