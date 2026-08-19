-- Revertir organizations.invoicing_email (agregada por 20260819200000_invoicing_email_to_org.sql)
--
-- Decisión producto 2026-08-19: eliminar el flujo manual de solicitar_factura
-- (email al responsable de facturación). Centinelia solo emite CFDIs vía el
-- PAC del negocio (SF, CONTPAQi, etc.). Si el negocio no tiene PAC configurado,
-- el empleado avisa al cliente y registra la solicitud pendiente vía crear_lead.
--
-- La columna invoicing_email queda sin consumidores. Drop.
-- Aplicada a prod 2026-08-19 tras eliminar readers en request-factura.ts,
-- solicitar-factura/route.ts y executor.ts.

ALTER TABLE organizations DROP COLUMN IF EXISTS invoicing_email;
