import { describe, it, expect } from 'vitest';
import { classifyDay, firstCheckInOfDay, dateOnly } from '../retardo-classifier';

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
