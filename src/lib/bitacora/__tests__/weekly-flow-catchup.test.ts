/**
 * Tests para los helpers del cron `bitacora-weekly-catchup` (safety-net
 * dominical). El catchup existe porque el envío principal tiene ventana de
 * 5h y aunque bajen la probabilidad de miss a ~0.1%, un cliente crítico no
 * puede depender de eso. Corre 1-2 días después del `day_of_week` del cfg
 * y dispara envío si no hay row en `bitacora_weekly_deliveries` para la
 * semana Lun-Dom que acaba de terminar.
 *
 * Cubre:
 *  1. `isEligibleForCatchup`: matchea sólo día siguiente y 2 días después
 *     del cfg.day_of_week. Rechaza el día mismo (lo maneja el cron
 *     principal) y >2 días (semana ya cerró).
 *  2. `calcOriginalSendDate`: retrocede el número correcto de días desde
 *     hoy hasta el día programado, ajusta la hora al `cfg.hour`. Correcto
 *     también cuando el cálculo cruza fin de mes.
 */
import { describe, it, expect } from 'vitest';
import {
  isEligibleForCatchup,
  calcOriginalSendDate,
  type BitacoraConfig,
} from '@/lib/bitacora/weekly-flow';

const nelia: BitacoraConfig = {
  enabled:                       true,
  day_of_week:                   6, // sábado
  hour:                          14,
  recipients:                    ['supervision@tortillasestrella.com.mx', 'ramonleang@icloud.com'],
  include_monthly_last_saturday: true,
};

describe('isEligibleForCatchup — safety-net dominical', () => {
  describe('config de Nelia (sábado 14 MX)', () => {
    it('domingo (dow=0) sí elegible: día siguiente al sábado', () => {
      expect(isEligibleForCatchup(nelia, 0)).toBe(true);
    });

    it('lunes (dow=1) sí elegible: 2 días después del sábado', () => {
      expect(isEligibleForCatchup(nelia, 1)).toBe(true);
    });

    it('sábado (dow=6) NO elegible: mismo día, lo maneja el cron principal', () => {
      expect(isEligibleForCatchup(nelia, 6)).toBe(false);
    });

    it('martes (dow=2) NO elegible: 3 días después, ventana cerrada', () => {
      expect(isEligibleForCatchup(nelia, 2)).toBe(false);
    });

    it('miércoles (dow=3) NO elegible: 4 días, ventana cerrada', () => {
      expect(isEligibleForCatchup(nelia, 3)).toBe(false);
    });

    it('viernes (dow=5) NO elegible: aún no llega el día del envío', () => {
      expect(isEligibleForCatchup(nelia, 5)).toBe(false);
    });
  });

  describe('config de otro día (lunes 8 MX)', () => {
    const lunes8: BitacoraConfig = { ...nelia, day_of_week: 1, hour: 8 };

    it('martes (dow=2) sí elegible: día siguiente al lunes', () => {
      expect(isEligibleForCatchup(lunes8, 2)).toBe(true);
    });

    it('miércoles (dow=3) sí elegible: 2 días después del lunes', () => {
      expect(isEligibleForCatchup(lunes8, 3)).toBe(true);
    });

    it('lunes (dow=1) NO elegible: mismo día', () => {
      expect(isEligibleForCatchup(lunes8, 1)).toBe(false);
    });

    it('jueves (dow=4) NO elegible: 3 días después', () => {
      expect(isEligibleForCatchup(lunes8, 4)).toBe(false);
    });
  });

  describe('config domingo (dow=0) — envuelve la semana', () => {
    const domingo10: BitacoraConfig = { ...nelia, day_of_week: 0, hour: 10 };

    it('lunes (dow=1) sí elegible: día siguiente al domingo', () => {
      expect(isEligibleForCatchup(domingo10, 1)).toBe(true);
    });

    it('martes (dow=2) sí elegible: 2 días después del domingo', () => {
      expect(isEligibleForCatchup(domingo10, 2)).toBe(true);
    });

    it('sábado (dow=6) NO elegible: 6 días desde el domingo pasado', () => {
      expect(isEligibleForCatchup(domingo10, 6)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('rechaza cfg=null', () => {
      expect(isEligibleForCatchup(null, 0)).toBe(false);
    });

    it('rechaza cfg.enabled=false', () => {
      expect(isEligibleForCatchup({ ...nelia, enabled: false }, 0)).toBe(false);
    });

    it('rechaza recipients=[]', () => {
      expect(isEligibleForCatchup({ ...nelia, recipients: [] }, 0)).toBe(false);
    });
  });
});

describe('calcOriginalSendDate — reconstruye fecha original de envío', () => {
  it('domingo 15-sept 10 MX + cfg sábado 14h → sábado 14-sept 14 MX', () => {
    // Domingo 2026-09-14 en dow=0. Config sábado 14h → retroceder 1 día.
    const now = new Date(2026, 8, 14, 10, 0, 0); // 14-sept-2026 10:00 local
    const dow = 0; // domingo
    const original = calcOriginalSendDate(now, dow, nelia);
    expect(original.getFullYear()).toBe(2026);
    expect(original.getMonth()).toBe(8); // septiembre
    expect(original.getDate()).toBe(13); // sábado
    expect(original.getHours()).toBe(14);
    expect(original.getMinutes()).toBe(0);
  });

  it('lunes al día siguiente cruzando fin de mes', () => {
    // Lunes 1-oct-2026 (dow=1). Cfg=sábado 14h → retroceder 2 días → sábado 29-sept.
    const now = new Date(2026, 9, 1, 8, 0, 0); // 1-oct-2026 08:00 (dow=lunes... realmente 1-oct-2026 es jueves; uso otro ejemplo)
    // Recalculo: quiero lunes que retroceda a sábado del mes anterior.
    // 2026-11-02 es lunes. Retrocede 2 días → sábado 31-oct.
    const now2 = new Date(2026, 10, 2, 8, 0, 0); // 2-nov-2026 08:00 (lunes)
    const original = calcOriginalSendDate(now2, 1, nelia);
    expect(original.getMonth()).toBe(9); // octubre
    expect(original.getDate()).toBe(31); // sábado 31-oct
    expect(original.getHours()).toBe(14);
  });

  it('no muta la fecha input', () => {
    const now = new Date(2026, 8, 14, 10, 0, 0);
    const nowCopy = new Date(now.getTime());
    calcOriginalSendDate(now, 0, nelia);
    expect(now.getTime()).toBe(nowCopy.getTime());
  });

  it('mismo día (daysSince=0) retorna hoy a la hora configurada', () => {
    // Sábado 12-sept-2026 20:00 (dow=6). Cfg sábado 14h → daysSince=0 → hoy 14:00.
    const now = new Date(2026, 8, 12, 20, 0, 0);
    const original = calcOriginalSendDate(now, 6, nelia);
    expect(original.getDate()).toBe(12);
    expect(original.getHours()).toBe(14);
  });

  it('respeta cfg.hour distinto del 14', () => {
    const now = new Date(2026, 8, 14, 10, 0, 0); // domingo
    const original = calcOriginalSendDate(now, 0, { day_of_week: 6, hour: 22 });
    expect(original.getDate()).toBe(13); // sábado
    expect(original.getHours()).toBe(22);
  });
});
