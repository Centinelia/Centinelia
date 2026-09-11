# Dry run gaps -- corrida 1 -- 2026-09-11

## Contexto

- Fecha: 2026-09-11 (jueves — anticipado vs plan original viernes 12).
- Driver: Claude via curl multi-turn contra endpoint prod, Nazre valida en DB.
- Ambiente: producción `https://www.centinelia.mx/api/demo/meefi/chat`.
- Runbook: `21-dry-run-runbook-nelia.md`.

## Bloques corridos

| Bloque | (a) | (b) | (c) | (d) | Verdict |
|---|---|---|---|---|---|
| 1 Password reset | ✓ | ✓ | ⚠️ | ✓ | **PASS c/matiz** |
| 2 Transferencia HERO | ✓ | ✓ | ✓ | ✓ | **PASS 4/4** |
| 3 KB Help Center | ✓ | ✓ | ✓ | ✓ | **PASS 4/4** (post-fixes) |
| 4 2FA recovery | ✓ | ✓ | ✓ | ✓ | **PASS 4/4** |
| Niva compliance | pendiente | pendiente | pendiente | pendiente | **Nazre UI** |

## Gaps identificados y arreglados en la sesión

| # | Bloque | Gap | Severidad | Fix aplicado | Commit |
|---|---|---|---|---|---|
| G1 | Todos multi-turn | Widget mandaba solo `message: text` cada turn, Nelia perdía contexto entre turnos. | **CRÍTICA** | Widget acumula historial y manda como `messages` array | `d4ee9745` |
| G2 | 2 Transferencia | Fixtures con fechas hardcode 2026-09-10; en cualquier otro día no matcheaban por date_approx. | **CRÍTICA** | Fechas relativas a `Date.now()` + matching por amount permisivo. | `83390d99` |
| G3 | 3 KB Help Center | Endpoint no leía `role_knowledge_base` de la DB; ignoraba T10 completo. | **ALTA** | Select del field + append al system prompt. | `6a8b0458 / 87f06209` |
| G4 | 3 KB Help Center | Prompt permisivo dejaba a Nelia responder de memoria en preguntas informativas. | **MEDIA** | Endurecido: "CUALQUIER pregunta informativa... invoca meefi_search_help_center PRIMERO. NO respondas de memoria." | `6a8b0458` |
| G5 | 3 KB Help Center | RPC hacía ILIKE con string exacta; queries multi-token no matcheaban ("SPEI otro banco" no encontraba el artículo). | **ALTA** | RPC tokenizada con scoring por match count en title(x2) + body(x1). | migration `meefi_help_center_search_tokenized` |
| G6 | 1 Password reset | Fixture usr_001 estático (`password_reset_locked=true` siempre); tras confirmar verificación, el link sigue bloqueado. | **BAJA** | No fixed. En la demo, Nazre corta narrativa en turn 1 después del diagnóstico. |  |
| G7 | 2, 4 SMTP | Provider real de correos es Resend, no Gmail OAuth. Sent folder de Nelia vacía. | **MEDIA** | No fixed. Nazre verifica en portal que Gmail OAuth de Nelia está bien conectada, o acepta que Sent no aparezca en la demo. Escalamiento sigue llegando correctamente al alias `+ashley/+emilio`. |  |

## Resultados por bloque

### Bloque 1 -- Password reset

- Turn 1: Nelia llama lookup_user_account, detecta `password_reset_locked=true`, motivo real (`identity_verified=false`, `kyc_status=pending`), guía verificación desde el chat.
- Turn 2 (usuario confirma): Nelia intenta send_password_reset_link, el fixture estático regresa bloqueado, Nelia guía a revisar spam. **No escala** (correcto).
- **Matiz (c)**: fixture es estático — Nelia nunca puede completar el envío exitoso en este scenario. Gap G6 documentado.

### Bloque 2 HERO -- Transferencia no reflejada

- Turn 1: `check_transfer_status` → devuelve `pendiente_rieles` con ETA y explicación BBVA. **No escala** (correcto).
- Turn 2: usuario declara urgencia → Nelia escala `topic=transferencia_urgente priority=alta`, ticket `esc_ky8u8ljl`.
- Correo `[Meefi Soporte · ALTA] transferencia_urgente · usr_003` llega a `nazre20+emilio@gmail.com`, ok=true. Verificable en `outbound_emails`.

### Bloque 3 -- KB Help Center

- Nelia llama `search_help_center` con query "SPEI otro banco".
- RPC tokenizada devuelve 3 hits: "Tiempos de transferencia SPEI" + "Horarios operativos SPEI" + "Comisiones por transferencia".
- Respuesta cita literal ("Las transferencias SPEI a otros bancos usualmente reflejan en menos de 4 horas hábiles...") + 2 links funcionales.

### Bloque 4 -- 2FA recovery

- Turn 1: Nelia llama `initiate_2fa_recovery`, ticket `rec_6sf0k47f`, presenta 4 items en un solo mensaje con lista clara.
- Turn 2 (usuario dice "subí 3 fotos + últimos 4 = 4872"): Nelia detecta ambigüedad y pide confirmación en vez de escalar sobre incertidumbre.
- Turn 3 (usuario confirma): Nelia escala `topic=recovery_2fa priority=media`, ticket `esc_yddxvxiv`.
- Correo `[Meefi Soporte · MEDIA] recovery_2fa · usr_002` llega a `nazre20+ashley@gmail.com`, ok=true.

### Bloque Niva compliance -- **pendiente Nazre**

Este bloque no se puede driver via curl porque va directo al chat de Niva en el portal. Nazre lo corre desde:
`https://www.centinelia.mx/portal/5RP13tnLK6XX/oficina/empleados/niva` (chat con ella).

Prompt: `"Niva, procesa el KYB de este nuevo lead. Comercializadora Bajio SA de CV, importadora de refacciones de EEUU. Necesito recomendacion rapida."`

## Notas de corrida

- Tiempo real total corriendo bloques 1-4: ~15 min activos + 30 min esperando redeploys Vercel.
- Auto-deploy Vercel no triggered en el push post-Bloque 3. Root cause: el `ignoreCommand` en `vercel.json` requiere que el diff toque archivos fuera de excluded. Necesita `[force-build]` en commit para bypassear el filtro cuando aplique.
- Provider de correos = Resend en ambos escalamientos. Nazre validó que Gmail OAuth quedó conectada al empleado, pero el sender helper no lo eligió. Ver G7.

## Pool al cierre

Ver query: `SELECT COALESCE(SUM(amount), 0) FROM ops_ledger WHERE portal_email='meefi-demo@centinelia.mx'`.
Endpoint no consume pool (demo gratuita per T8). Solo cuentan los correos escalados (2 en este dry run).

## Ronda "arregla todo" post dry run 1 (sesión completa)

Fixes adicionales shipped después de la corrida inicial:

| # | Gap | Fix | Commit |
|---|---|---|---|
| G7-R1 | Sender/footer decían "Nelia Centinelia" | `from` explícito "Nelia · Meefi Soporte" + header + footer + h1 rebrandeado | `425cd565` |
| G7-R2 | Timestamp UTC ISO | `formatTimestampMx` con Intl.DateTimeFormat + `America/Mexico_City` | `425cd565` |
| G7-R3 | Sin CTA para abrir el caso | Botón "Abrir conversacion en Meefi" apunta al portal | `425cd565` |
| G7-R4 | Provider=Resend cuando OAuth conectado | Root cause: token bindeado a Nara (primary), no a Nelia. Fix: OAuth callback bindea al `agent_id` codificado en state. Row existente reasignada via UPDATE | `ecd19693` |
| G8 | Widget perdía historial al refresh | `sessionStorage` keyed por scenario.id, hidratación post-mount | `fdf6a024` |
| G9 | Nash alertaba errores de tools falsos | Executors mock retornan `ok=true` con `outcome` distinto para respuestas semánticas negativas. `ok=false` reservado a errores técnicos | `fdf6a024` |
| G-Niva | Niva pedía expediente antes de decidir | Guion 13b actualizado con expediente inline (opción B) | `6251ed7f` |

Post-fix: nueva escalación de prueba (subject `esc_` a las 20:19 UTC) sale con `provider=gmail`. La bandeja Sent de `centinelia.dev@gmail.com` debería tener copia.

## Recomendaciones para dry run 2 (sábado 13)

1. ~~Confirmar Gmail OAuth~~ ✓ fixed en G7-R4.
2. Correr Bloque Niva completo desde portal con el expediente inline del guion 13b.
3. Si tiempo, agregar 5-10 artículos más al Help Center (actualmente 15).
4. Regla de corte martes ya no aplica: bloques 1+2+3+4 corren end-to-end verde.

## Reactivar Nash post-run

```sql
UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com' WHERE portal_email = 'meefi-demo@centinelia.mx';
```
