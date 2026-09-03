-- Kill switch org-wide para pilotos y demos.
--
-- Contexto: cuando una org está en fase piloto/demo (ej. Fondo Demo del Norte),
-- necesitamos poder pausar TODO el ambiente instantáneamente sin enviarle al
-- cliente el correo "tu cuenta ha sido suspendida" que dispara `account_status
-- = 'suspended'`. La suspensión formal es para incumplimiento; esto es
-- estrictamente operativo (algo se rompió, evitamos daño mientras arreglamos).
--
-- Comportamiento: si demo_paused = true, checkAccount() devuelve
-- canOperate=false y canUseOffice=false con razón neutra "Piloto en pausa
-- temporal por el equipo de Centinelia". Cero correos automáticos.
--
-- Toggle esperado: admin endpoint /api/admin/organizations/[email]/demo-pause
-- o SQL directo: UPDATE organizations SET demo_paused = TRUE WHERE portal_email = '...'
--
-- Compatible con account_status: si una org está suspended Y demo_paused,
-- suspended gana (semántica de incumplimiento pesa más que la operativa).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS demo_paused BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN organizations.demo_paused IS
  'Kill switch org-wide para pilotos/demos. Cuando true, bloquea voz + outbound + office sin enviar correo al cliente. Ver src/lib/compliance/account-guard.ts';
