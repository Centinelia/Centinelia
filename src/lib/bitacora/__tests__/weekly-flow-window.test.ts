/**
 * Regression tests para `shouldSendBitacoraNow` (ventana de reintento).
 *
 * Antes del fix (commit del 2026-09-15): el filter era `hour === cfg.hour`
 * (una sola ventana de 1h). Vercel skipeó el slot del sábado 12-sept 20:00
 * UTC y la Tortillería Estrella no recibió su bitácora esa semana.
 *
 * Después del fix: `hour >= cfg.hour && hour <= cfg.hour + 4` — 5 slots
 * consecutivos. Con miss-rate observado ~25% en crons hourly de Vercel, la
 * probabilidad de perder los 5 slots es ~0.1% (y el catchup dominical la
 * baja aún más).
 *
 * Estos tests aseguran que:
 *  1. La ventana matchea las 5 horas correctas (regression del bug real).
 *  2. Sigue rechazando día distinto y hora fuera de rango.
 *  3. Config edge cases (disabled, sin recipients) siguen rechazados.
 */
import { describe, it, expect } from 'vitest';
import { shouldSendBitacoraNow, type BitacoraConfig } from '@/lib/bitacora/weekly-flow';

const nelia: BitacoraConfig = {
  enabled:                       true,
  day_of_week:                   6, // sábado
  hour:                          14,
  recipients:                    ['supervision@tortillasestrella.com.mx', 'ramonleang@icloud.com'],
  include_monthly_last_saturday: true,
};

describe('shouldSendBitacoraNow — ventana de reintento 5h', () => {
  describe('regression: sábado 12-sept case (Nelia @ Tortillería Estrella)', () => {
    // Config real de Nelia: sábado 14 MX. Las 5 horas 14..18 MX deben todas
    // resultar en match (cualquiera es un slot válido para enviar).
    for (const hour of [14, 15, 16, 17, 18]) {
      it(`matchea sábado ${hour}h MX (dentro de la ventana 14..18)`, () => {
        expect(shouldSendBitacoraNow(nelia, 6, hour)).toBe(true);
      });
    }

    it('NO matchea sábado 13h MX (antes de la ventana)', () => {
      expect(shouldSendBitacoraNow(nelia, 6, 13)).toBe(false);
    });

    it('NO matchea sábado 19h MX (después de la ventana)', () => {
      expect(shouldSendBitacoraNow(nelia, 6, 19)).toBe(false);
    });

    it('NO matchea viernes 14h MX (día distinto)', () => {
      expect(shouldSendBitacoraNow(nelia, 5, 14)).toBe(false);
    });

    it('NO matchea domingo 14h MX (día siguiente — lo maneja el catchup, no este cron)', () => {
      expect(shouldSendBitacoraNow(nelia, 0, 14)).toBe(false);
    });
  });

  describe('config edge cases', () => {
    it('rechaza cfg=null', () => {
      expect(shouldSendBitacoraNow(null, 6, 14)).toBe(false);
    });

    it('rechaza cfg.enabled=false aunque día y hora coincidan', () => {
      expect(shouldSendBitacoraNow({ ...nelia, enabled: false }, 6, 14)).toBe(false);
    });

    it('rechaza recipients=[]', () => {
      expect(shouldSendBitacoraNow({ ...nelia, recipients: [] }, 6, 14)).toBe(false);
    });
  });

  describe('otros días / horas configurados', () => {
    const lunes8am: BitacoraConfig = { ...nelia, day_of_week: 1, hour: 8 };

    it('lunes 8h matchea', () => {
      expect(shouldSendBitacoraNow(lunes8am, 1, 8)).toBe(true);
    });

    it('lunes 12h matchea (hour + 4)', () => {
      expect(shouldSendBitacoraNow(lunes8am, 1, 12)).toBe(true);
    });

    it('lunes 13h NO matchea (fuera de ventana)', () => {
      expect(shouldSendBitacoraNow(lunes8am, 1, 13)).toBe(false);
    });
  });

  describe('ventana late-night wrap (cfg.hour=22 → 22..26)', () => {
    // La ventana +4h nunca cruza medianoche porque hour máx 23 → 23..27.
    // Este test documenta el comportamiento actual: NO envuelve al día
    // siguiente. Si un cliente config hour=22 y Vercel skipea slots 22 y 23,
    // el catchup dominical lo agarra.
    const nocturno: BitacoraConfig = { ...nelia, hour: 22 };

    it('sábado 22h matchea', () => {
      expect(shouldSendBitacoraNow(nocturno, 6, 22)).toBe(true);
    });

    it('sábado 23h matchea', () => {
      expect(shouldSendBitacoraNow(nocturno, 6, 23)).toBe(true);
    });

    it('domingo 0h NO matchea (no wrap; el catchup lo cubre)', () => {
      expect(shouldSendBitacoraNow(nocturno, 0, 0)).toBe(false);
    });
  });
});
