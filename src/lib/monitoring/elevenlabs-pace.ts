// Monitor de créditos ElevenLabs — evalúa si el consumo va sobre presupuesto
// para el ciclo de facturación en curso. Se usa desde el cron infra-alerts.
//
// Sin este check los créditos TTS pueden acabarse a mitad de ciclo y los
// meerkats de voz se quedan mudos (silent fail en Vapi).

export const EL_PACE_CRITICAL     = 1.5;
export const EL_PACE_WARN         = 1.25;
export const EL_USED_PCT_CRITICAL = 90;
export const EL_USED_PCT_WARN     = 75;
export const EL_CYCLE_DAYS        = 30;

export type ElevenLabsPaceLevel = 'ok' | 'warn' | 'critical';

export interface ElevenLabsPaceResult {
  pace:          number;   // 1.0 = al ritmo justo; > 1 = arriba
  usedPct:       number;   // 0-100
  daysElapsed:   number;
  daysRemaining: number;
  expectedUsed:  number;   // créditos que deberías llevar si estuvieras al ritmo
  level:         ElevenLabsPaceLevel;
}

export function evaluateElevenLabsPace(
  charCount:   number,
  charLimit:   number,
  resetUnix:   number,
  nowUnix:     number = Math.floor(Date.now() / 1000),
): ElevenLabsPaceResult {
  const cycleStart    = resetUnix - EL_CYCLE_DAYS * 86400;
  const daysElapsed   = Math.max(0.1, (nowUnix - cycleStart) / 86400);
  const daysRemaining = Math.max(0, (resetUnix - nowUnix) / 86400);
  const expectedUsed  = charLimit * (daysElapsed / EL_CYCLE_DAYS);
  const pace          = charCount / Math.max(1, expectedUsed);
  const usedPct       = charLimit > 0 ? (charCount / charLimit) * 100 : 0;

  const level: ElevenLabsPaceLevel =
    (usedPct >= EL_USED_PCT_CRITICAL || pace >= EL_PACE_CRITICAL) ? 'critical'
    : (usedPct >= EL_USED_PCT_WARN   || pace >= EL_PACE_WARN)     ? 'warn'
    : 'ok';

  return { pace, usedPct, daysElapsed, daysRemaining, expectedUsed, level };
}
