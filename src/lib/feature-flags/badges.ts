export function computeAt100Badge(flag: { flag_key: string; at_100_since: string | null }): {
  label: string;
  tone: 'purple' | 'green';
  isMeerkat: boolean;
} | null {
  if (!flag.at_100_since) return null;
  const days = Math.floor((Date.now() - new Date(flag.at_100_since).getTime()) / 86400000);
  const isMeerkat = flag.flag_key.startsWith('meerkat.');
  if (days < 7) {
    return { label: `en 100% desde hace ${days}d`, tone: 'purple', isMeerkat };
  }
  if (isMeerkat) {
    return { label: `listo (auto-promote pendiente)`, tone: 'green', isMeerkat: true };
  }
  return { label: `listo para limpieza`, tone: 'green', isMeerkat: false };
}
