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

export const MEEFI_TRANSFERS: MeefiTransfer[] = [
  {
    transfer_id: 'trf_001',
    user_id: 'usr_003',
    amount: 50000,
    date: '2026-09-10T14:30:00Z',
    status: 'pendiente_rieles',
    explanation: 'La transferencia salió de Meefi hace 2 horas y está viajando por los rieles SPEI. El destino es BBVA, que en horario pico puede tardar hasta 4 horas hábiles en reflejar.',
    eta_or_next_action: 'ETA reflejo antes de las 19:00 hora CDMX de hoy. Si a las 19:30 no aparece, escalamos con el equipo de operaciones.',
    destination_bank: 'BBVA',
  },
  {
    transfer_id: 'trf_002',
    user_id: 'usr_002',
    amount: 12500,
    date: '2026-09-09T10:15:00Z',
    status: 'rechazada',
    explanation: 'El banco destino (Banorte) rechazó la operación por CLABE inválida. El monto ya se abonó de regreso a la cuenta Meefi hace 40 minutos.',
    eta_or_next_action: 'Verificar la CLABE con el proveedor y reintentar. El monto ya está disponible en tu saldo.',
    destination_bank: 'Banorte',
  },
  {
    transfer_id: 'trf_003',
    user_id: 'usr_002',
    amount: 8500,
    date: '2026-09-08T16:45:00Z',
    status: 'ya_conciliada',
    explanation: 'Transferencia liquidada y conciliada el 8 de septiembre a las 17:12. Confirmación SPEI en tu historial.',
    eta_or_next_action: 'Puedes descargar el comprobante desde Movimientos, sección Detalle transferencia.',
    destination_bank: 'Santander',
  },
  {
    transfer_id: 'trf_004',
    user_id: 'usr_006',
    amount: 25000,
    date: '2026-09-10T11:00:00Z',
    status: 'pendiente_rieles',
    explanation: 'Salió a las 11:00, destino HSBC. HSBC tiene ventana de reflejo cada hora en punto.',
    eta_or_next_action: 'ETA próxima hora en punto (12:00). Si a las 13:00 no aparece, escalamos.',
    destination_bank: 'HSBC',
  },
];

type TransferQuery = { amount?: number; date_approx?: string; transfer_id?: string };

export function getMeefiTransfer(q: TransferQuery): MeefiTransfer | undefined {
  if (q.transfer_id) return MEEFI_TRANSFERS.find(t => t.transfer_id === q.transfer_id);
  return MEEFI_TRANSFERS.find(t => {
    const amountMatch = q.amount === undefined || Math.abs(t.amount - q.amount) < 100;
    const dateMatch = q.date_approx === undefined || t.date.startsWith(q.date_approx);
    return amountMatch && dateMatch;
  });
}
