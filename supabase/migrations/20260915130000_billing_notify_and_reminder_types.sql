-- Expandir CHECK de centinelia_billing.tipo para admitir 3 eventos operativos
-- que el codigo ya usa pero la constraint original bloqueaba:
--   'reminder_sent'      — neka-payment-reminders (tier 7/12/15)
--   'suspension_alert'   — neka-payment-reminders (tier 15 final)
--   'notify_sent'        — neka-billing-cycle en modo NEKA_NOTIFY_ONLY
--                          (recordatorio a Nazre para timbrar manual mientras
--                          Facturama API prod no esta contratado)
--
-- Los primeros dos son deuda tecnica: el codigo del cron reminders (dormido)
-- inserta esos tipos y habria fallado en cuanto se activara. Los tres se
-- agregan juntos para no volver a tocar la constraint.

ALTER TABLE centinelia_billing DROP CONSTRAINT IF EXISTS centinelia_billing_tipo_check;

ALTER TABLE centinelia_billing
  ADD CONSTRAINT centinelia_billing_tipo_check
  CHECK (tipo IN (
    'cfdi_emitido',
    'rep_emitido',
    'pago_recibido',
    'cancelacion',
    'error_emision',
    'reminder_sent',
    'suspension_alert',
    'notify_sent'
  ));

COMMENT ON CONSTRAINT centinelia_billing_tipo_check ON centinelia_billing IS
  'Tipos permitidos de evento. notify_sent = recordatorio interno a Nazre en modo NEKA_NOTIFY_ONLY (Facturama API prod aun no contratado).';
