'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { GuardiaSchedule, GuardiaTurno } from '@/lib/helpdesk/folio';
import { TimeInput } from '@/components/ui/date-picker';

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
const DIA_LABEL: Record<string, string> = {
  lun: 'L', mar: 'Ma', mie: 'Mi', jue: 'J', vie: 'V', sab: 'S', dom: 'D',
};

export default function GuardiaEditor({ token, initial }: { token: string; initial: GuardiaSchedule }) {
  const [schedule, setSchedule] = useState<GuardiaSchedule>(initial);
  const [open, setOpen]         = useState(false);
  const [saving, setSaving]     = useState(false);
  const [dirty, setDirty]       = useState(false);

  const mark = () => setDirty(true);

  const addArea = () => {
    setSchedule(s => ({ areas: [...s.areas, { id: uuid(), nombre: '', turnos: [] }] }));
    mark();
  };

  const removeArea = (areaId: string) => {
    setSchedule(s => ({ areas: s.areas.filter(a => a.id !== areaId) }));
    mark();
  };

  const updateAreaNombre = (areaId: string, nombre: string) => {
    setSchedule(s => ({ areas: s.areas.map(a => a.id === areaId ? { ...a, nombre } : a) }));
    mark();
  };

  const addTurno = (areaId: string) => {
    const turno: GuardiaTurno = {
      id: uuid(), tecnico: '', telefono: '',
      dias: ['lun', 'mar', 'mie', 'jue', 'vie'],
      hora_inicio: '08:00', hora_fin: '18:00',
    };
    setSchedule(s => ({
      areas: s.areas.map(a => a.id === areaId ? { ...a, turnos: [...a.turnos, turno] } : a),
    }));
    mark();
  };

  const removeTurno = (areaId: string, turnoId: string) => {
    setSchedule(s => ({
      areas: s.areas.map(a => a.id === areaId ? { ...a, turnos: a.turnos.filter(t => t.id !== turnoId) } : a),
    }));
    mark();
  };

  const updateTurno = (areaId: string, turnoId: string, field: keyof GuardiaTurno, value: string | string[]) => {
    setSchedule(s => ({
      areas: s.areas.map(a => a.id === areaId
        ? { ...a, turnos: a.turnos.map(t => t.id === turnoId ? { ...t, [field]: value } : t) }
        : a
      ),
    }));
    mark();
  };

  const toggleDia = (areaId: string, turnoId: string, dia: string, current: string[]) => {
    const next = current.includes(dia) ? current.filter(d => d !== dia) : [...current, dia];
    updateTurno(areaId, turnoId, 'dias', next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/portal/${token}/settings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardia_schedule: schedule }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const totalTurnos = schedule.areas.reduce((n, a) => n + a.turnos.length, 0);

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--c-border-2)', background: 'var(--c-surface)' }}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
        <Clock size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
        <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
          Horario de guardia
          {totalTurnos > 0 && (
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--c-text-4)' }}>
              {schedule.areas.length} área{schedule.areas.length !== 1 ? 's' : ''} · {totalTurnos} turno{totalTurnos !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={13} style={{ color: 'var(--c-text-4)' }} /> : <ChevronDown size={13} style={{ color: 'var(--c-text-4)' }} />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--c-border)' }}>
          <p className="text-xs pt-3" style={{ color: 'var(--c-text-3)' }}>
            Define quién está de guardia por área y horario. Tu empleado lo consulta para escalar tickets urgentes automáticamente.
          </p>

          {schedule.areas.map(area => (
            <div key={area.id} className="flex flex-col gap-2 rounded-lg p-3"
              style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-2">
                <input value={area.nombre} onChange={e => updateAreaNombre(area.id, e.target.value)}
                  placeholder="Nombre del área (ej: Redes, Servidores)"
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                <button onClick={() => removeArea(area.id)}
                  className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                  style={{ background: 'none', border: 'none', color: 'var(--c-text-4)', cursor: 'pointer' }}>
                  <Trash2 size={13} />
                </button>
              </div>

              {area.turnos.map(turno => (
                <div key={turno.id} className="flex flex-col gap-2 rounded-lg p-2.5"
                  style={{ background: 'var(--c-modal)', border: '1px solid var(--c-border)' }}>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={turno.tecnico} onChange={e => updateTurno(area.id, turno.id, 'tecnico', e.target.value)}
                      placeholder="Técnico *"
                      className="px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                    <input value={turno.telefono} onChange={e => updateTurno(area.id, turno.id, 'telefono', e.target.value)}
                      placeholder="Teléfono"
                      className="px-2.5 py-1.5 rounded-lg text-xs"
                      style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', color: 'var(--c-text)', outline: 'none' }} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <TimeInput value={turno.hora_inicio}
                      onChange={v => updateTurno(area.id, turno.id, 'hora_inicio', v)}
                      className="w-auto min-w-[110px]" />
                    <span className="text-xs" style={{ color: 'var(--c-text-4)' }}>a</span>
                    <TimeInput value={turno.hora_fin}
                      onChange={v => updateTurno(area.id, turno.id, 'hora_fin', v)}
                      className="w-auto min-w-[110px]" />
                    <button onClick={() => removeTurno(area.id, turno.id)}
                      className="ml-auto p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.1)]"
                      style={{ background: 'none', border: 'none', color: 'var(--c-text-4)', cursor: 'pointer' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {DIAS.map(dia => (
                      <button key={dia} onClick={() => toggleDia(area.id, turno.id, dia, turno.dias)}
                        className="w-7 h-7 rounded-full text-[10px] font-semibold transition-colors"
                        style={{
                          background: turno.dias.includes(dia) ? '#6C3BFF' : 'var(--c-surface-2)',
                          color:      turno.dias.includes(dia) ? '#fff' : 'var(--c-text-4)',
                          border:     '1px solid ' + (turno.dias.includes(dia) ? '#6C3BFF' : 'var(--c-border)'),
                          cursor:     'pointer',
                        }}>
                        {DIA_LABEL[dia]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <button onClick={() => addTurno(area.id)}
                className="flex items-center gap-1.5 text-xs self-start transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', color: 'var(--c-text-3)', cursor: 'pointer', padding: 0 }}>
                <Plus size={11} /> Añadir turno
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <button onClick={addArea}
              className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', color: '#9B6DFF', cursor: 'pointer', padding: 0 }}>
              <Plus size={12} /> Añadir área
            </button>
            {dirty && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#6C3BFF', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                <Save size={11} /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
