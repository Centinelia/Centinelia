'use client';

import { useState } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import type { GuardiaSchedule, GuardiaTurno } from '@/lib/helpdesk/folio';
import { TimeInput } from '@/components/ui/date-picker';
import { EmptyState } from '@/components/ui/empty-state';

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;
const DIA_LABEL: Record<string, string> = {
  lun: 'L', mar: 'Ma', mie: 'Mi', jue: 'J', vie: 'V', sab: 'S', dom: 'D',
};

const inputStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #E8E3F5',
  color: '#1A0A3B',
  outline: 'none',
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
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: '#ffffff',
        border: '1px solid #E8E3F5',
        boxShadow: '0 1px 2px rgba(26,10,59,0.04)',
      }}
    >
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start justify-between gap-3 px-5 pt-5 pb-4 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-[17px] font-bold tracking-tight" style={{ color: '#1A0A3B' }}>
              Horario de guardia
            </h2>
            {totalTurnos > 0 && (
              <span className="text-[13px] font-medium tabular-nums" style={{ color: '#9B8FB5' }}>
                {schedule.areas.length} {schedule.areas.length === 1 ? 'área' : 'áreas'} · {totalTurnos} {totalTurnos === 1 ? 'turno' : 'turnos'}
              </span>
            )}
          </div>
          <p className="text-[12px] mt-1" style={{ color: '#6B6480' }}>
            Define quién está de guardia por área y horario. Tu empleado lo consulta para escalar tickets urgentes.
          </p>
        </div>
        <div className="flex items-center shrink-0 mt-1" style={{ color: '#9B8FB5' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>

      {open && (
        <>
          {schedule.areas.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Sin áreas configuradas"
              description="Añade un área para definir los turnos de guardia."
              action={
                <button onClick={addArea}
                  className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90"
                  style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                  <Plus size={12} /> Añadir área
                </button>
              }
            />
          ) : (
            <div className="flex flex-col" style={{ borderTop: '1px solid #F0EDF9' }}>
              {schedule.areas.map((area, idx) => (
                <div key={area.id} className="px-5 py-4 flex flex-col gap-3"
                  style={{ borderBottom: idx === schedule.areas.length - 1 ? 'none' : '1px solid #F0EDF9' }}>
                  <div className="flex items-center gap-2">
                    <input value={area.nombre} onChange={e => updateAreaNombre(area.id, e.target.value)}
                      placeholder="Nombre del área (ej: Redes, Servidores)"
                      className="flex-1 px-3 py-2 rounded-lg text-[13px] font-semibold"
                      style={inputStyle} />
                    <button onClick={() => removeArea(area.id)}
                      className="p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                      style={{ background: 'none', border: 'none', color: '#9B8FB5', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {area.turnos.map(turno => (
                    <div key={turno.id} className="flex flex-col gap-2 rounded-lg p-3"
                      style={{ background: '#FAFAFB', border: '1px solid #E8E3F5' }}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input value={turno.tecnico} onChange={e => updateTurno(area.id, turno.id, 'tecnico', e.target.value)}
                          placeholder="Técnico *"
                          className="px-3 py-2 rounded-lg text-[12px]"
                          style={inputStyle} />
                        <input value={turno.telefono} onChange={e => updateTurno(area.id, turno.id, 'telefono', e.target.value)}
                          placeholder="Teléfono"
                          className="px-3 py-2 rounded-lg text-[12px]"
                          style={inputStyle} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <TimeInput value={turno.hora_inicio}
                          onChange={v => updateTurno(area.id, turno.id, 'hora_inicio', v)}
                          className="w-auto min-w-[110px]" />
                        <span className="text-[12px]" style={{ color: '#9B8FB5' }}>a</span>
                        <TimeInput value={turno.hora_fin}
                          onChange={v => updateTurno(area.id, turno.id, 'hora_fin', v)}
                          className="w-auto min-w-[110px]" />
                        <button onClick={() => removeTurno(area.id, turno.id)}
                          className="ml-auto p-1.5 rounded-lg transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                          style={{ background: 'none', border: 'none', color: '#9B8FB5', cursor: 'pointer' }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {DIAS.map(dia => (
                          <button key={dia} onClick={() => toggleDia(area.id, turno.id, dia, turno.dias)}
                            className="w-7 h-7 rounded-full text-[10px] font-semibold transition-colors"
                            style={{
                              background: turno.dias.includes(dia) ? '#6C3BFF' : '#ffffff',
                              color:      turno.dias.includes(dia) ? '#fff' : '#6B6480',
                              border:     '1px solid ' + (turno.dias.includes(dia) ? '#6C3BFF' : '#E8E3F5'),
                              cursor:     'pointer',
                            }}>
                            {DIA_LABEL[dia]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button onClick={() => addTurno(area.id)}
                    className="flex items-center gap-1.5 text-[12px] font-medium self-start transition-opacity hover:opacity-70"
                    style={{ background: 'none', border: 'none', color: '#6C3BFF', cursor: 'pointer', padding: 0 }}>
                    <Plus size={11} /> Añadir turno
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="px-5 py-3 flex items-center gap-2"
            style={{ borderTop: '1px solid #F0EDF9', background: '#FAFAFB' }}>
            {schedule.areas.length > 0 && (
              <button onClick={addArea}
                className="flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-70"
                style={{ background: 'none', border: 'none', color: '#6C3BFF', cursor: 'pointer', padding: 0 }}>
                <Plus size={12} /> Añadir área
              </button>
            )}
            {dirty && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 ml-auto px-3 h-8 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: '#6C3BFF', color: '#fff', boxShadow: '0 1px 2px rgba(108,59,255,0.24)' }}>
                <Save size={11} /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
