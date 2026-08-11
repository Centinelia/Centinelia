// Labels amigables para admin consumo — evita jerga técnica.
// Usable en pages/components de admin consumo (per-cliente + global).

export const KIND_LABELS: Record<string, string> = {
  // Minutos
  call:               'Llamada',
  setup_new_agent:    'Alta de nuevo empleado',
  renewal:            'Renovación mensual',
  extra_purchase:     'Compra extra de minutos',
  extra_compra:       'Compra extra de minutos',
  auto_refill:        'Recarga automática',
  cancellation:       'Cancelación',
  admin_adjustment:   'Ajuste manual (admin)',
  jornada_change:     'Cambio de jornada',
  reconciliacion:     'Ajuste de corrección',
  plan_downgrade:     'Baja de plan',
  plan_upgrade:       'Alta de plan',
  refund:             'Reembolso',
  dispute_chargeback: 'Contracargo (dispute)',
  invoice_voided:     'Factura anulada',
  auto_paused:        'Empleado pausado (auto)',
  rollover_cap:       'Descarte por límite (cap 2×)',
  ajuste:             'Ajuste manual',
  // Ops
  extra_ops_purchase: 'Compra extra de tareas',
  auto_refill_ops:    'Recarga automática de tareas',
  annual_grant:       'Saldo mensual del contrato anual',
  unused_forfeited:   'Saldo no consumido (annual)',
  consumption:        'Uso de herramientas',
  backfill_grant:     'Saldo histórico reconstruido',
  backfill:           'Saldo histórico reconstruido',
};

export function labelKind(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export const BILLING_LABELS: Record<string, string> = {
  stripe:         'Mensual (Stripe)',
  annual_prepaid: 'Anual pagado',
  expired:        'Contrato vencido',
};

export function labelBilling(model: string): string {
  return BILLING_LABELS[model] ?? model;
}
