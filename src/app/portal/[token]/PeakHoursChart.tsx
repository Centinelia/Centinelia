'use client';

const HOUR_LABELS = [
  '12am','1am','2am','3am','4am','5am','6am','7am',
  '8am','9am','10am','11am','12pm','1pm','2pm','3pm',
  '4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
];

interface Props {
  hourCounts: number[];
}

export default function PeakHoursChart({ hourCounts }: Props) {
  const max     = Math.max(...hourCounts, 1);
  const total   = hourCounts.reduce((s, n) => s + n, 0);
  const peakIdx = total > 0 ? hourCounts.indexOf(Math.max(...hourCounts)) : -1;

  if (total === 0) {
    return (
      <p style={{ fontSize: 13, color: '#6B6480', textAlign: 'center', padding: '16px 0', margin: 0 }}>
        Sin datos suficientes
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56 }}>
        {hourCounts.map((count, i) => {
          const pct    = (count / max) * 100;
          const isPeak = i === peakIdx && count > 0;
          return (
            <div
              key={i}
              title={`${HOUR_LABELS[i]}: ${count} llamada${count !== 1 ? 's' : ''}`}
              style={{
                flex:            1,
                display:         'flex',
                flexDirection:   'column',
                justifyContent:  'flex-end',
                height:          '100%',
              }}
            >
              <div style={{
                width:           '100%',
                height:          `${Math.max(pct, count > 0 ? 6 : 2)}%`,
                background:      isPeak ? '#6C3BFF' : count > 0 ? 'rgba(108,59,255,0.3)' : '#E8E3F5',
                borderRadius:    '3px 3px 0 0',
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        {[0, 6, 12, 18, 23].map(h => (
          <span key={h} style={{ fontSize: 10, color: '#9B8FB5' }}>{HOUR_LABELS[h]}</span>
        ))}
      </div>

      {peakIdx >= 0 && (
        <p style={{ fontSize: 12, color: '#6B6480', marginTop: 10, marginBottom: 0 }}>
          Hora pico:{' '}
          <span style={{ color: '#9B6DFF', fontWeight: 600 }}>{HOUR_LABELS[peakIdx]}</span>
          <span style={{ color: '#9B8FB5' }}> · {hourCounts[peakIdx]} llamada{hourCounts[peakIdx] !== 1 ? 's' : ''}</span>
        </p>
      )}
    </div>
  );
}
