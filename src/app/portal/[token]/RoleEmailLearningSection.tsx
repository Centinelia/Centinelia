'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Mail, Check, AlertCircle, ArrowRight, BookOpen } from 'lucide-react';

interface Props {
  token:            string;
  connectedEmail:   string | null;
  agentRole:        string;
}

type State = 'idle' | 'loading' | 'done' | 'error' | 'no-email' | 'no-relevant';

export default function RoleEmailLearningSection({ token, connectedEmail, agentRole }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const [state,   setState]   = useState<State>(connectedEmail ? 'idle' : 'no-email');
  const [result,  setResult]  = useState<{ saved: number; relevant_count: number; total_emails: number } | null>(null);
  const [errMsg,  setErrMsg]  = useState<string | null>(null);

  async function run() {
    setState('loading');
    setResult(null);
    setErrMsg(null);

    // Navega inmediatamente al tab de aprendizajes para que el user vea el
    // spinner ahí y luego cómo se puebla la lista. El POST corre en paralelo.
    router.push(`${pathname}?tab=personalidad&learning=running#rol`, { scroll: true });

    try {
      const res  = await fetch(`/api/portal/${token}/role-email-learning`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data.error ?? 'Error al analizar los correos.');
        setState('error');
        return;
      }
      if (data.saved === 0) {
        setState('no-relevant');
        setResult(data);
      } else {
        setState('done');
        setResult(data);
      }
      // Refresh SSR para que AgentKnowledgeBaseEditor recargue initialLearnings
      // con las nuevas reglas guardadas en voice_agents.role_learnings.
      router.refresh();
    } catch {
      setErrMsg('Error de conexión. Intenta de nuevo.');
      setState('error');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed" style={{ color: '#6B6480' }}>
        Tu empleado lee el correo del negocio (Oficina → Integraciones) y aprende cómo se toman decisiones en su área.
        Si 3 de 10 correos hablan de ventas, el empleado de ventas analiza esos 3 y extrae las reglas implícitas de tu organización.
        Los aprendizajes se guardan en <strong style={{ color: '#1A0A3B' }}>Rol y Personalidad → Responsabilidades → Aprendizajes del rol</strong>, donde puedes editarlos o borrarlos.
      </p>

      {state === 'no-email' && (
        <div className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
          <AlertCircle size={14} style={{ color: '#6B6480', flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-xs font-medium" style={{ color: '#1A0A3B' }}>
              Sin correo del negocio conectado
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
              Conecta Gmail o Outlook en Oficina → Integraciones para activar el aprendizaje de plataformas.
            </p>
          </div>
        </div>
      )}

      {state !== 'no-email' && (
        <>
          {connectedEmail && (
            <div className="flex items-center gap-2">
              <Mail size={12} style={{ color: '#6B6480', flexShrink: 0 }} />
              <span className="text-xs" style={{ color: '#6B6480' }}>
                Conectado: <span style={{ color: '#1A0A3B' }}>{connectedEmail}</span>
              </span>
            </div>
          )}

          {(state === 'idle' || state === 'done' || state === 'no-relevant') && (
            <button
              onClick={run}
              className="self-start flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl transition-opacity"
              style={{
                background: 'rgba(108,59,255,0.12)',
                border:     '1px solid rgba(108,59,255,0.3)',
                color:      '#6C3BFF',
                cursor:     'pointer',
              }}
            >
              <Mail size={14} />
              {state === 'idle' ? 'Aprender de mis correos' : 'Volver a analizar (5 tareas)'}
            </button>
          )}

          {state === 'loading' && (
            <div className="flex items-center gap-2.5">
              <div
                className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0"
                style={{ borderColor: 'rgba(108,59,255,0.2)', borderTopColor: '#6C3BFF' }}
              />
              <span className="text-xs" style={{ color: '#6B6480' }}>
                Leyendo correos y aprendiendo reglas de la organización...
              </span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs" style={{ color: '#ef4444' }}>{errMsg}</p>
              <button
                onClick={run}
                className="self-start flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl"
                style={{ background: 'rgba(108,59,255,0.12)', border: '1px solid rgba(108,59,255,0.3)', color: '#6C3BFF', cursor: 'pointer' }}
              >
                Reintentar
              </button>
            </div>
          )}

          {state === 'done' && result && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 rounded-xl p-4"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <Check size={14} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                    {result.saved} aprendizaje{result.saved !== 1 ? 's' : ''} guardado{result.saved !== 1 ? 's' : ''} automáticamente
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                    De {result.total_emails} correos analizados, {result.relevant_count} eran relevantes para {agentRole || 'el rol'}.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
                style={{ background: 'rgba(108,59,255,0.05)', border: '1px solid rgba(108,59,255,0.15)' }}>
                <BookOpen size={12} style={{ color: '#9B6DFF', flexShrink: 0, marginTop: 1 }} />
                <div className="flex flex-col gap-1">
                  <p className="text-[11px]" style={{ color: '#6B6480' }}>
                    Se guardaron en <strong style={{ color: '#1A0A3B' }}>Responsabilidades → Aprendizajes del rol</strong>. Edítalos ahí si es necesario.
                  </p>
                  <a
                    href="?tab=personalidad#rol"
                    className="self-start flex items-center gap-1 text-[11px] font-medium"
                    style={{ color: '#6C3BFF' }}
                  >
                    Ir a Responsabilidades <ArrowRight size={11} />
                  </a>
                </div>
              </div>
            </div>
          )}

          {state === 'no-relevant' && result && (
            <div className="flex items-start gap-3 rounded-xl p-4"
              style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
              <AlertCircle size={14} style={{ color: '#6B6480', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs font-medium" style={{ color: '#1A0A3B' }}>
                  Sin correos relevantes al rol
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#6B6480' }}>
                  Se analizaron {result.total_emails} correos pero ninguno contenía decisiones relacionadas con {agentRole || 'el rol de este empleado'}.
                  Puede que el correo conectado no sea el que usas para operaciones de {agentRole || 'este rol'}.
                </p>
              </div>
            </div>
          )}

          {(state === 'idle') && (
            <p className="text-[10px]" style={{ color: '#9B8FB5' }}>
              Consume 5 tareas · analiza los últimos 30 días · no almacena correos, solo las reglas extraídas
            </p>
          )}
        </>
      )}
    </div>
  );
}
