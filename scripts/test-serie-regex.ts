const SERIE_RE = /\b([A-Z0-9]{8,18})\b/g;
const isLikelySerie = (s: string): boolean => /[A-Z]/.test(s) && /\d/.test(s);

const descripciones = [
  '23 SEER MINI-SPLIT GII 18MBH IDU HP 220-240/50/60/1 · X2446TO182IH0113',
  'Equipo con 2 series: 25502332JA y 2613HA01706A',
  'Serie única 2618HA00044A',
  'Mini-split SEER22 1.5TR Serial X2446TO182IH0115 Bodega Cenizo',
];

for (const d of descripciones) {
  const matches = [...d.matchAll(SERIE_RE)].map(m => m[1]);
  const series = [...new Set(matches)].filter(s => isLikelySerie(s));
  console.log(`DESC: ${d.slice(0, 70)}`);
  console.log(`  → series detectadas: ${JSON.stringify(series)}`);
}
