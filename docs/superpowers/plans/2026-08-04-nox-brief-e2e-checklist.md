# Nox Brief E2E Checklist

Setup: cuenta de prueba con Nox activo, integración de correo (Gmail o Outlook), Cal.com opcional, al menos 1 escalación pendiente, 1 tarea pendiente, 1 borrador de contrato.

## Modo cron (proactivo)
- [ ] Activar `brief_del_dia_config` desde /configurar con hora = próxima hora
- [ ] Esperar que corra el cron
- [ ] Verificar: correo recibido en `client_email` con formato correcto
- [ ] Verificar: WA recibido en `transfer_whatsapp` (si activo)
- [ ] Verificar: card en /inicio muestra el brief con 3 buckets
- [ ] Verificar: row en `brief_runs` con `trigger='cron'` y `delivery_status` correcto
- [ ] Verificar: `brief_del_dia_last_run_at` actualizado
- [ ] Volver a correr manual el cron misma hora: skip (dedup por día funciona)

## Modo reactive (on-demand)
- [ ] Ir a /oficina, seleccionar Nox, mandar "Nox, prepárame el brief del día"
- [ ] Verificar: Nox responde con markdown con los 3 buckets
- [ ] Verificar: row en `brief_runs` con `trigger='reactive'`
- [ ] Pedir "Nox, mándamelo también por WhatsApp" - recibir WA
- [ ] Repetir via inbox-processor: mandar correo al agente pidiendo el brief

## Guardarrailes
- [ ] Sin Nox activo en el org - card en /inicio no aparece
- [ ] Config `enabled=false` - cron no envia
- [ ] Sin `client_email` - email skipped, WA + portal siguen funcionando
- [ ] Verifier bloquea intentos de que Nox envie correos por su cuenta

## Copy
- [ ] Todo el copy visible es español, sin em-dashes, sin emojis, sin "IA"
- [ ] Iconos son Lucide (AlertTriangle, Clock, Info)
