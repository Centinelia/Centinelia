# Runbook de provisionamiento — Fondo Demo del Norte

Este runbook es para Nazre. Instrucciones paso a paso para aprovisionar el ambiente demo en el portal de Centinelia.

## Preflight (10 min)

Antes de crear nada, ten a mano:
- [ ] Credenciales de admin de Centinelia
- [ ] Cuenta de Google del Fondo demo (crear una si no existe: `fondodemodelnorte.demo@gmail.com`)
- [ ] Los archivos generados en `C:\Users\Nazre\centinelia\demos\fondo-demo-del-norte\`
- [ ] Un WhatsApp Business/número donde puedas recibir las notificaciones del Fondo demo
- [ ] Tu WhatsApp personal para recibir alertas de deterioro (para el Escenario 6)

## Paso 1 — Preparar los Google Sheets (15 min)

1. Sube los 4 CSV a Google Drive del Fondo demo:
   - `06-cartera-maestra-31ago2026.csv` → convierte a Sheet, renombra a **"Cartera Maestra — Fondo Demo del Norte"**
   - `07-reporte-uc-industrial-agosto2026.csv` → Sheet **"Reporte UC Industrial NE — Ago 2026"**
   - `08-reporte-agrofinanciera-agosto2026.csv` → Sheet **"Reporte Agrofinanciera OCC — Ago 2026"**
   - `09-reporte-cajas-solidarias-agosto2026.csv` → Sheet **"Reporte Cajas Solidarias — Ago 2026"**
2. Crea también un Sheet vacío llamado **"Directorio de Intermediarios — Fondo Demo del Norte"** con estas columnas:
   `intermediario | rfc | figura | ciudad | tesorero | correo_tesorero | telefono_tesorero | linea_autorizada | contacto_fondo_asignado`
   Llénalo con los 7 intermediarios de `01-intermediarios.md`.
3. Comparte los 5 sheets con permisos de edición para la cuenta de servicio de Centinelia (revisar en Integraciones → Google Sheets qué email es).
4. Copia los `spreadsheet_id` de cada uno — los necesitas para `sheets_mappings`.

## Paso 2 — Crear la org y los 4 meerkats (30 min)

En admin panel `/admin/agentes/nuevo` crea 4 empleados con `portal_email` común `fondo-demo-del-norte@centinelia.mx`:

### Meerkat 1 — Nara
- Rol: `nara`
- Business name: **Fondo Demo del Norte**
- Nombre agente: **Nara**
- Vertical: `gobierno` (encaja para el flow de "reporte cívico" ≈ "reporte de intermediario" — ver nota abajo)
- KB del negocio: pegar contenido de `02-kb-nara.md` sección "Del negocio"
- KB del rol: pegar el resto del `02-kb-nara.md`
- Voice: `9Godp7dNohUvXk6qp0gS` (default de Nara)
- Features: `receptionist: true, appointment_booking: false, order_taking: false, smart_transfer: true, existing_client_support: true, civic_reports: true`
- Número entrante: asignar uno de Vapi/Twilio disponible
- Directorio interno: cargar los 4 contactos del Fondo (Adriana Vela, JL Cárdenas, MF Zambrano, Tesorería) — para el flow de escalamiento

### Meerkat 2 — Nico
- Rol: `nico`
- Business name: **Fondo Demo del Norte**
- Nombre agente: **Nico**
- KB del negocio: idéntico al de Nara
- KB del rol: `03-kb-nico.md`
- Voice: `9gm2jXcKEKzgaypKoOlk`
- Features: `outbound_calls: true, existing_client_support: true, smart_transfer: true, outbound_capabilities: ['cobranza', 'recordatorios_pago']`
- Directorio: cargar los 7 tesoreros de los intermediarios (con teléfono TU personal o el de Gerardo si él lo autoriza, para las llamadas outbound de prueba)

### Meerkat 3 — Nova
- Rol: `nova`
- Business name: **Fondo Demo del Norte**
- Nombre agente: **Nova**
- KB del negocio: idéntico
- KB del rol: `04-kb-nova.md`
- Voice: `htFfPSZGJwjBv1CL0aMD` (no relevante — es primordialmente email + chat)
- Features: por default (recibe archivos vía chat de Oficina)
- **Importante:** en este demo Nova NO recibe correos (pipeline no implementado). Va vía chat de Oficina con adjunto. Ver el KB — ya está redactado en esa lógica.

### Meerkat 4 — Niva
- Rol: `niva` (coordinadora, sin voz)
- Business name: **Fondo Demo del Norte**
- Nombre agente: **Niva**
- KB del negocio: idéntico
- KB del rol: `05-kb-niva.md`
- Features: `is_coordinator: true`

## Paso 3 — Configurar Google Sheets (10 min)

En admin panel → Integraciones Google Sheets, agrega mapeos:

| Purpose | Spreadsheet | Comentario |
|---|---|---|
| `custom_cartera_maestra` | Cartera Maestra Fondo Demo del Norte | Nova y Niva la leen y actualizan |
| `custom_directorio_intermediarios` | Directorio de Intermediarios | Nara y Nico la consultan |
| `custom_reporte_uc_industrial` | Reporte UC Industrial NE — Ago 2026 | Para escenario 2 |
| `custom_reporte_agrofinanciera` | Reporte Agrofinanciera OCC — Ago 2026 | Para escenario 2 y 6 |
| `custom_reporte_cajas_solidarias` | Reporte Cajas Solidarias — Ago 2026 | Para escenario 2 |

## Paso 4 — Configurar pool generoso (5 min)

Vía `/admin/agentes/[id]/minutes`:
- Nara: `credit 300` minutos (aprox 5 horas de voz — cubre 30-40 llamadas de prueba)
- Nico: `credit 200` minutos (outbound cortos)
- Nova: `credit 50` minutos (por si hace alguna llamada esporádica)
- Niva: `credit 0` (no tiene voz)
- Pool tareas org-level: 500 tareas (Nova + Niva usan tareas intensivas de generación)

## Paso 5 — Kill switch org-wide + alertas automáticas (5 min)

**Kill switch org-wide (cerrado en brecha #3 2026-09-02):**

Ya existe columna `organizations.demo_paused` (default false) que bloquea voz + outbound + oficina sin enviar correo al cliente. Tres formas de togglear:

Opción A — endpoint admin (recomendado, deja log en `kyc_access_log`):
```
POST /api/admin/organizations/fondo-demo-del-norte@centinelia.mx/demo-pause
Body: { "paused": true, "reason": "Ajustando KB de Nara" }
```

Opción B — SQL directo (para casos de emergencia, sin auth admin):
```sql
UPDATE organizations SET demo_paused = TRUE
WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';
-- Para reanudar: SET demo_paused = FALSE
```

Opción C — pausar meerkat individual (granularidad fina, deja los otros vivos):
```sql
UPDATE voice_agents SET active = FALSE
WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx' AND agent_name = 'Nova';
```

**Alertas automáticas (cerrado en brecha #4 2026-09-02):**

Ya existe cron `/api/cron/pilot-monitor` corriendo cada 30 min. Para activarlo para Fondo Demo:
```sql
UPDATE organizations SET pilot_notify_email = 'nazre20@gmail.com'
WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';
```

El cron vigila cada 30 min:
- Llamadas con self_eval_score < 0.5
- 3+ llamadas sin respuesta en la ventana
- Errores de tools (tool_call_log.ok = false)
- Incidentes nuevos en platform_incidents

Cuando detecta cualquier cosa, manda correo consolidado a `pilot_notify_email` con la lista de anomalías + SQL para pausar la org o retirar el monitoreo.

**Para retirar la org del monitoreo cuando termine el piloto:**
```sql
UPDATE organizations SET pilot_notify_email = NULL, demo_paused = FALSE
WHERE portal_email = 'fondo-demo-del-norte@centinelia.mx';
```

## Paso 6 — Portal token para Gerardo (5 min)

1. En el portal admin, sección **Portal Access**, genera token para `fondo-demo-del-norte@centinelia.mx`.
2. Si no existe endpoint dedicado, la ruta actual es: crea el portal user vía la UI que ya usan las cuentas normales, con esa contraseña temporal.
3. Copia el URL de acceso (típicamente `centinelia.mx/portal/[token]`).
4. **NO se lo mandes hasta que hayas hecho tú un dry run** (ver Paso 8).

## Paso 7 — Grabar Loom para mandar HOY (30-40 min)

Antes de mandar el portal a Gerardo, la promesa que le hiciste en junta era "pásame los demos". La forma más rápida de cumplir es grabar Loom **usando el portal Fondo Demo del Norte que acabas de aprovisionar**. Guión sugerido en el archivo `13-loom-script.md`.

## Paso 8 — Dry run tuyo (30 min)

Antes de mandar a Gerardo:
1. Abre el portal como si fueras él.
2. Ejecuta los 6 escenarios de `11-guia-prospecto.md` uno por uno.
3. Verifica que:
   - Los 4 meerkats respondan con lenguaje financiero correcto (no dicen "reporte cívico" cuando deberían decir "reporte de intermediario")
   - Nova procesa los 3 Excels y devuelve consolidado con adjunto
   - Niva arma reportes coherentes con la cartera maestra
   - Nico llama a tu celular al pedirle cobranza
   - Nara registra un reporte al recibir tu "llamada como tesorero"
4. Si algo no responde bien, ajusta el KB (vive en `voice_agents.knowledge_base`) y reintenta.

## Paso 9 — Mandar a Gerardo (5 min)

WhatsApp:
> Gerardo, te mando lo que hablamos en junta. Adjunto:
> 1. **Video corto (X minutos)** con los flujos de correo, archivos, chat y análisis de un fondeador ejemplo — para que veas cómo se ve el trabajo diario.
> 2. **Número directo del empleado de voz demo**: [NÚMERO]. Puedes marcarle y probar cualquier escenario.
> 3. **Acceso a un ambiente dedicado** que armé con datos coherentes de un fondeador con 7 intermediarios — [URL DEL PORTAL] con contraseña [X]. Tiene 6 escenarios sugeridos en la portada. Puedes jugar antes de la cita del 15.
>
> Cualquier duda me avisas por acá.

## Paso 10 — Monitoreo durante los 13 días

Diario, dedícale 5 min:
- Revisa las llamadas del día en el portal.
- Verifica que no haya errores de tools ni respuestas raras.
- Si Gerardo pregunta algo, contesta rápido — momentum.

Si detectas algo que se te rompe, ajusta y avísale con transparencia: "Vi que probaste X, ya lo ajusté para tu prueba de mañana."

---

## Notas de brecha (para roadmap post-cita)

Estas cosas quedaron "no ejecutables en este demo" y se cierran para producción real:

1. **Pipeline de correo Nova**: implementar executor del billing/employee/loop. Estimación 2-3 días. **Descope para este piloto** — Gerardo usa chat con adjunto para subir Excel a Nova.

Cerradas 2026-09-02 antes de provisioning:
- ✅ **Vertical financiero**: labels condicionales por vertical, migración de tipo, extensión de giros. Ver commits en `src/lib/portal/modules.ts`, `OficinaSidebarV2.tsx`, `reportes-ciudadanos/page.tsx`, `empleados/page.tsx`, `tool-labels.ts`, `types/agent.ts`.
- ✅ **Kill switch org-wide**: columna `organizations.demo_paused` + gate en `checkAccount` + endpoint POST `/api/admin/organizations/[email]/demo-pause`. Migración `20260902110000_demo_paused_organizations.sql`.
- ✅ **Alertas Nazre por consumo/error**: columna `organizations.pilot_notify_email` + cron `/api/cron/pilot-monitor` cada 30 min. Migración `20260902113000_pilot_notify_email.sql`.
