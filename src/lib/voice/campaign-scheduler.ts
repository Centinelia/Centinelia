export type ScheduleType = 'once' | 'daily' | 'weekly';

export function computeNextRunAt(
  timezone: string,
  runAtTime: string,       // 'HH:MM'
  scheduleType: ScheduleType,
  runOnDays: number[],     // 0=Dom … 6=Sáb, for weekly
): Date | null {
  if (scheduleType === 'once') return null;

  const [hours, minutes] = runAtTime.split(':').map(Number);

  // On Vercel (UTC server): toLocaleString gives local values as a "fake" UTC date
  const now    = new Date();
  const tzNow  = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const offset = now.getTime() - tzNow.getTime(); // ms to add to local→UTC

  // Candidate: today in local timezone at target time
  const candidate = new Date(tzNow);
  candidate.setHours(hours, minutes, 0, 0);

  if (scheduleType === 'daily') {
    if (candidate <= tzNow) candidate.setDate(candidate.getDate() + 1);
  } else {
    const days = runOnDays?.length ? runOnDays : [1];
    const dow  = tzNow.getDay();
    let daysAhead = Infinity;
    for (const d of days) {
      let diff = (d - dow + 7) % 7;
      if (diff === 0 && candidate <= tzNow) diff = 7;
      daysAhead = Math.min(daysAhead, diff);
    }
    if (!isFinite(daysAhead)) daysAhead = 7;
    candidate.setDate(candidate.getDate() + daysAhead);
  }

  return new Date(candidate.getTime() + offset);
}

export function describeSchedule(
  scheduleType: ScheduleType,
  runAtTime: string,
  runOnDays: number[],
  runAtDate?: string | null,
): string {
  const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const timeLabel = runAtTime ?? '09:00';

  if (scheduleType === 'once') {
    return `Una vez${runAtDate ? ` el ${runAtDate}` : ''} a las ${timeLabel}`;
  }
  if (scheduleType === 'daily') {
    return `Diario a las ${timeLabel}`;
  }
  const dayLabels = (runOnDays ?? []).sort().map(d => DAY_NAMES[d]).join(', ');
  return `Semanal — ${dayLabels || 'Lunes'} a las ${timeLabel}`;
}
