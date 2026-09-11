export type MeefiTransferStatus = 'pendiente_rieles' | 'rechazada' | 'ya_conciliada';

export type MeefiTransfer = {
  transfer_id: string;
  user_id: string;
  amount: number;
  date: string;
  status: MeefiTransferStatus;
  explanation: string;
  eta_or_next_action: string;
  destination_bank?: string;
};

// Las transferencias del fixture se calculan relativas a "hoy" cada vez que
// se importa el módulo (cold start del server). Esto asegura que la demo
// funcione cada día sin regenerar fechas hardcodeadas.
function daysAgoISO(days: number, hour = 12, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

const now = new Date();
const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

export const MEEFI_TRANSFERS: MeefiTransfer[] = [
  {
    transfer_id: 'trf_001',
    user_id: 'usr_003',
    amount: 50000,
    date: twoHoursAgo,
    status: 'pendiente_rieles',
    explanation: 'La transferencia salió de Meefi hace 2 horas y está viajando por los rieles SPEI. El destino es BBVA, que en horario pico puede tardar hasta 4 horas hábiles en reflejar.',
    eta_or_next_action: 'ETA reflejo antes de las 19:00 hora CDMX de hoy. Si a las 19:30 no aparece, escalamos con el equipo de operaciones.',
    destination_bank: 'BBVA',
  },
  {
    transfer_id: 'trf_002',
    user_id: 'usr_002',
    amount: 12500,
    date: daysAgoISO(1, 10, 15),
    status: 'rechazada',
    explanation: 'El banco destino (Banorte) rechazó la operación por CLABE inválida. El monto ya se abonó de regreso a la cuenta Meefi hace 40 minutos.',
    eta_or_next_action: 'Verificar la CLABE con el proveedor y reintentar. El monto ya está disponible en tu saldo.',
    destination_bank: 'Banorte',
  },
  {
    transfer_id: 'trf_003',
    user_id: 'usr_002',
    amount: 8500,
    date: daysAgoISO(2, 16, 45),
    status: 'ya_conciliada',
    explanation: 'Transferencia liquidada y conciliada hace 2 días. Confirmación SPEI en tu historial.',
    eta_or_next_action: 'Puedes descargar el comprobante desde Movimientos, sección Detalle transferencia.',
    destination_bank: 'Santander',
  },
  {
    transfer_id: 'trf_004',
    user_id: 'usr_006',
    amount: 25000,
    date: oneHourAgo,
    status: 'pendiente_rieles',
    explanation: 'Salió hace 1 hora, destino HSBC. HSBC tiene ventana de reflejo cada hora en punto.',
    eta_or_next_action: 'ETA próxima hora en punto. Si a las 2 horas no aparece, escalamos.',
    destination_bank: 'HSBC',
  },
];

type TransferQuery = { amount?: number; date_approx?: string; transfer_id?: string };

export function getMeefiTransfer(q: TransferQuery): MeefiTransfer | undefined {
  if (q.transfer_id) return MEEFI_TRANSFERS.find(t => t.transfer_id === q.transfer_id);
  // Match por amount primero (permisivo con fecha). Si hay múltiples con el mismo
  // monto, la fecha desempata; si no matchea ninguno con fecha, se retorna el
  // primer match por amount. Nelia infiere "hoy" cuando el usuario dice "hace X
  // horas" y a veces el date_approx no coincide con el date exacto del fixture.
  const matchesByAmount = MEEFI_TRANSFERS.filter(t =>
    q.amount === undefined || Math.abs(t.amount - q.amount) < 100,
  );
  if (matchesByAmount.length === 0) return undefined;
  if (q.date_approx) {
    const withDate = matchesByAmount.find(t => t.date.startsWith(q.date_approx!));
    if (withDate) return withDate;
  }
  return matchesByAmount[0];
}
