# QA E2E — Integración Solución Factible

## Prerequisitos
- Cuenta AC Proyectos activa en dev/staging
- CSD de prueba SAT en `fixtures/sat-test-csd/`
- Credenciales sandbox SF: testing@solucionfactible.com / timbrado.SF.16672

## Escenario 1 — Onboarding SF
1. Login portal `/portal/[token]/oficina/integraciones/solucion-factible`
2. Fill form con RFC LAN7008173R5, régimen 601, CP 64000, sandbox creds
3. Click Conectar → verifica badge "Sin CSD"
4. Sube .cer + .key + password del CSD de prueba
5. Verifica: badge "Activo", RFC coincide, vigencia mostrada

## Escenario 2 — Timbrado por voz (auto)
1. Llamar al número Vapi del agente
2. "Quiero factura por 5000 pesos para XAXX010101000 público en general"
3. Agente confirma datos y dice "Ya la emití, folio XXXXXXXX"
4. Verificar en Supabase: `select uuid, status from factura_requests order by created_at desc limit 1;` → status='stamped'
5. Portal /oficina/facturas → row con chip "Emitida" → descargar XML y PDF

## Escenario 3 — Guardrail bloquea → humano toma control
1. Portal config → monto_max_mxn = 100
2. Voz: "factura por 5000" → agente dice "el equipo la revisa hoy mismo"
3. Portal /oficina/facturas → row "Pendiente" con guardrail_reason visible
4. Click "Emitir con SF ahora" → status='stamped'

## Escenario 4 — Cancelación
1. Config → allow_agent_cancellation ON
2. Voz: "cancela la factura XXXXXXXX motivo 02"
3. Agente confirma solicitud
4. Portal /oficina/facturas → chip "Cancelación pedida" → Confirmar
5. Esperar cron poll (30min) o disparar manual: `curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/poll-sat-cancellations`
6. Verificar chip "Cancelada" tachado

## Escenario 5 — Rollback
1. Portal → Desconectar Solución Factible → confirm
2. Voz: "quiero factura por 5000" → agente vuelve a decir "el equipo la emite hoy mismo"
3. Verificar `select invoicing_provider from organizations where portal_email='ac@...';` → null

## Escenario 6 — Kill switch platform
1. Vercel env: INVOICING_DISABLED=true → redeploy
2. Voz cualquier org → todos los timbrados caen a humano sin importar config
3. Quitar env → normal
