import { describe, it, expect } from 'vitest';
import { classifyDay, classifyDayTurnoCubierto, firstCheckInOfDay, lastCheckOutOfDay, dateOnly } from '../retardo-classifier';

const rulesAC = {
  horaEntrada:           '08:00',
  umbralRetardoDobleMin: 30,
  umbralFaltaMin:        90,
};

const montosFull = {
  retardoBase:  50,
  retardoDoble: 100,
  falta:        500,
};

const montosNull = {
  retardoBase:  null,
  retardoDoble: null,
  falta:        null,
};

const sinContexto = { isFestivo: false, isDescanso: false, isVacacion: false };

function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 9, 13, h, m, 0));
}

describe('classifyDay (reglas AC Proyectos)', () => {
  it('07:58 → puntual (ok)', () => {
    const r = classifyDay('2026-10-13', at('07:58'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('ok');
    expect(r.monto).toBe(0);
  });

  it('08:00 → puntual (ok, exacto)', () => {
    const r = classifyDay('2026-10-13', at('08:00'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('ok');
  });

  it('08:01 → retardo_base', () => {
    const r = classifyDay('2026-10-13', at('08:01'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('retardo_base');
    expect(r.minutosRetraso).toBe(1);
    expect(r.monto).toBe(50);
  });

  it('08:29 → retardo_base (justo antes del umbral doble)', () => {
    const r = classifyDay('2026-10-13', at('08:29'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('retardo_base');
    expect(r.monto).toBe(50);
  });

  it('08:30 → retardo_doble (umbral exacto)', () => {
    const r = classifyDay('2026-10-13', at('08:30'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('retardo_doble');
    expect(r.monto).toBe(100);
  });

  it('09:29 → retardo_doble (justo antes de falta)', () => {
    const r = classifyDay('2026-10-13', at('09:29'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('retardo_doble');
  });

  it('09:30 → falta (umbral exacto)', () => {
    const r = classifyDay('2026-10-13', at('09:30'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(500);
  });

  it('11:00 → falta', () => {
    const r = classifyDay('2026-10-13', at('11:00'), rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('falta');
    expect(r.minutosRetraso).toBe(180);
  });

  it('sin checada → falta implícita', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, sinContexto);
    expect(r.classification).toBe('falta');
  });

  it('festivo gana sobre falta', () => {
    const r = classifyDay('2026-09-16', null, rulesAC, montosFull, { isFestivo: true, isDescanso: false, isVacacion: false });
    expect(r.classification).toBe('festivo');
    expect(r.monto).toBeNull();
  });

  it('vacaciones gana sobre falta', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, { isFestivo: false, isDescanso: false, isVacacion: true });
    expect(r.classification).toBe('vacaciones');
  });

  it('descanso gana sobre falta', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, { isFestivo: false, isDescanso: true, isVacacion: false });
    expect(r.classification).toBe('descanso');
  });

  it('precedencia: festivo > vacaciones > descanso', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, { isFestivo: true, isDescanso: true, isVacacion: true });
    expect(r.classification).toBe('festivo');
  });

  it('montos NULL → clasificación igual, monto NULL (pendiente)', () => {
    const r = classifyDay('2026-10-13', at('08:15'), rulesAC, montosNull, sinContexto);
    expect(r.classification).toBe('retardo_base');
    expect(r.monto).toBeNull();
  });
});

describe('sueldo per-empleado tiene prioridad sobre monto_falta global', () => {
  it('con sueldoDiario → la falta usa ese monto, no el global', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, sinContexto, 650);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(650);
  });

  it('con sueldoDiario → también aplica a falta por tardanza extrema (>= 09:30)', () => {
    const r = classifyDay('2026-10-13', at('10:00'), rulesAC, montosFull, sinContexto, 450);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(450);
  });

  it('sin sueldoDiario → cae al fallback global montos.falta', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, sinContexto, null);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(500);
  });

  it('sin sueldoDiario ni fallback → monto NULL (pendiente)', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosNull, sinContexto, null);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBeNull();
  });

  it('sueldoDiario no afecta retardo_base ni retardo_doble', () => {
    const r1 = classifyDay('2026-10-13', at('08:15'), rulesAC, montosFull, sinContexto, 650);
    expect(r1.classification).toBe('retardo_base');
    expect(r1.monto).toBe(50);
    const r2 = classifyDay('2026-10-13', at('08:45'), rulesAC, montosFull, sinContexto, 650);
    expect(r2.classification).toBe('retardo_doble');
    expect(r2.monto).toBe(100);
  });

  it('sueldoDiario 0 válido (empleado especial sin descuento) usa 0 como monto de falta', () => {
    const r = classifyDay('2026-10-13', null, rulesAC, montosFull, sinContexto, 0);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(0);
  });
});

describe('montos de retardo per-empleado tienen prioridad sobre globales (operativos AC)', () => {
  // Reglas reales AC Proyectos:
  //   Admin global:    base=$200, doble=$400, falta=$500 fallback.
  //   Operativo override: base=$50, doble=$100, sueldo diario=$450.
  const montosAdmin = { retardoBase: 200, retardoDoble: 400, falta: 500 };
  const empleadoOperativo = { sueldoDiario: 450, retardoBase: 50, retardoDoble: 100 };

  it('retardo_base usa override $50 del operativo, no $200 del admin', () => {
    const r = classifyDay('2026-10-15', at('08:15'), rulesAC, montosAdmin, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('retardo_base');
    expect(r.monto).toBe(50);
  });

  it('retardo_doble usa override $100 del operativo, no $400 del admin', () => {
    const r = classifyDay('2026-10-15', at('08:45'), rulesAC, montosAdmin, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('retardo_doble');
    expect(r.monto).toBe(100);
  });

  it('falta usa sueldo diario del operativo ($450), no monto_falta global ($500)', () => {
    const r = classifyDay('2026-10-15', null, rulesAC, montosAdmin, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(450);
  });

  it('override parcial (solo retardoBase): doble cae al global', () => {
    const soloBase = { retardoBase: 50 };
    const r1 = classifyDay('2026-10-15', at('08:15'), rulesAC, montosAdmin, sinContexto, soloBase);
    expect(r1.monto).toBe(50);
    const r2 = classifyDay('2026-10-15', at('08:45'), rulesAC, montosAdmin, sinContexto, soloBase);
    expect(r2.monto).toBe(400); // fallback global
  });

  it('empleado admin sin overrides usa valores globales $200/$400', () => {
    const admin = { sueldoDiario: 650 };
    const r1 = classifyDay('2026-10-15', at('08:15'), rulesAC, montosAdmin, sinContexto, admin);
    expect(r1.monto).toBe(200);
    const r2 = classifyDay('2026-10-15', at('08:45'), rulesAC, montosAdmin, sinContexto, admin);
    expect(r2.monto).toBe(400);
    const r3 = classifyDay('2026-10-15', null, rulesAC, montosAdmin, sinContexto, admin);
    expect(r3.monto).toBe(650); // sueldo diario propio
  });

  it('backwards compat: pasar number como 6to arg sigue funcionando como sueldoDiario', () => {
    const r = classifyDay('2026-10-15', null, rulesAC, montosAdmin, sinContexto, 720);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(720);
  });
});

describe('classifyDayTurnoCubierto (modelo operativos AC)', () => {
  // Reglas: turno de 12h, umbrales 30/90 min faltantes, montos $50/$100/sueldo.
  const rulesTurno12 = { horasRequeridas: 12, umbralRetardoDobleMin: 30, umbralFaltaMin: 90 };
  const montosGlobal = { retardoBase: 200, retardoDoble: 400, falta: 500 };  // admin global (fallback si empleado no tiene overrides)
  const empleadoOperativo = { sueldoDiario: 250, retardoBase: 50, retardoDoble: 100 };
  const sinContexto = { isFestivo: false, isDescanso: false, isVacacion: false };

  function at(fecha: string, hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const [y, mo, d] = fecha.split('-').map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h, m, 0));
  }

  it('entra 8:00 sale 20:00 (12h exactas) → ok', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '08:00'), at('2026-10-15', '20:00'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('ok');
    expect(r.monto).toBe(0);
  });

  it('entra 7:30 sale 20:30 (13h, cubre con sobra) → ok', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '07:30'), at('2026-10-15', '20:30'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('ok');
  });

  it('entra 8:30 sale 20:00 (11h30, faltan 30 min) → retardo_doble $100', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '08:30'), at('2026-10-15', '20:00'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('retardo_doble');
    expect(r.minutosRetraso).toBe(30);
    expect(r.monto).toBe(100);
  });

  it('entra 8:10 sale 20:00 (11h50, faltan 10 min) → retardo_base $50', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '08:10'), at('2026-10-15', '20:00'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('retardo_base');
    expect(r.minutosRetraso).toBe(10);
    expect(r.monto).toBe(50);
  });

  it('ejemplo oficial Lucero: entra 9:30 sale 20:30 (11h, faltan 60 min) → retardo_doble $100', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '09:30'), at('2026-10-15', '20:30'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('retardo_doble');
    expect(r.minutosRetraso).toBe(60);
    expect(r.monto).toBe(100);
  });

  it('entra 10:00 sale 20:00 (10h, faltan 120 min) → falta (sueldo diario)', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '10:00'), at('2026-10-15', '20:00'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('falta');
    expect(r.minutosRetraso).toBe(120);
    expect(r.monto).toBe(250);
  });

  it('sin checadas → falta', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', null, null, rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('falta');
    expect(r.monto).toBe(250);
  });

  it('solo entrada (sin salida) → checada_incompleta con monto NULL (orquestador decide)', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '08:00'), null, rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('checada_incompleta');
    expect(r.monto).toBeNull();
  });

  it('solo salida (sin entrada) → checada_incompleta con monto NULL', () => {
    const r = classifyDayTurnoCubierto('2026-10-15', null, at('2026-10-15', '20:00'), rulesTurno12, montosGlobal, sinContexto, empleadoOperativo);
    expect(r.classification).toBe('checada_incompleta');
  });

  it('festivo gana sobre falta aunque no haya checadas', () => {
    const r = classifyDayTurnoCubierto('2026-09-16', null, null, rulesTurno12, montosGlobal, { isFestivo: true, isDescanso: false, isVacacion: false }, empleadoOperativo);
    expect(r.classification).toBe('festivo');
    expect(r.monto).toBeNull();
  });

  it('turno 10h (Alberto): entra 8:00 sale 18:00 (10h exactas) → ok', () => {
    const rules10h = { horasRequeridas: 10, umbralRetardoDobleMin: 30, umbralFaltaMin: 90 };
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '08:00'), at('2026-10-15', '18:00'), rules10h, montosGlobal, sinContexto, { sueldoDiario: 266.67, retardoBase: 50, retardoDoble: 100 });
    expect(r.classification).toBe('ok');
  });

  it('turno 4h (Amelia hipotético): entra 8:00 sale 12:30 (4h30, cubre) → ok', () => {
    const rules4h = { horasRequeridas: 4, umbralRetardoDobleMin: 30, umbralFaltaMin: 90 };
    const r = classifyDayTurnoCubierto('2026-10-15', at('2026-10-15', '08:00'), at('2026-10-15', '12:30'), rules4h, montosGlobal, sinContexto, { sueldoDiario: 133.33, retardoBase: 50, retardoDoble: 100 });
    expect(r.classification).toBe('ok');
  });
});

describe('lastCheckOutOfDay', () => {
  it('devuelve la última', () => {
    const t = [new Date('2026-10-15T08:00:00Z'), new Date('2026-10-15T20:00:00Z'), new Date('2026-10-15T14:30:00Z')];
    const r = lastCheckOutOfDay(t);
    expect(r?.toISOString()).toBe('2026-10-15T20:00:00.000Z');
  });

  it('lista vacía → null', () => {
    expect(lastCheckOutOfDay([])).toBeNull();
  });
});

describe('firstCheckInOfDay', () => {
  it('devuelve la checada más temprana', () => {
    const t = [at('09:00'), at('08:05'), at('14:30')];
    const r = firstCheckInOfDay(t);
    expect(r?.toISOString()).toBe(at('08:05').toISOString());
  });

  it('lista vacía → null', () => {
    expect(firstCheckInOfDay([])).toBeNull();
  });
});

describe('dateOnly', () => {
  it('formato YYYY-MM-DD UTC', () => {
    expect(dateOnly(new Date(Date.UTC(2026, 9, 13, 8, 15, 0)))).toBe('2026-10-13');
  });
});
