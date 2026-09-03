# Fondo Demo del Norte — Índice de archivos

Directorio: `C:\Users\Nazre\centinelia\demos\fondo-demo-del-norte\`

Contexto: prospecto grande **Gerardo Guajardo** (Monterrey, empresa nombre a confirmar por WhatsApp — probablemente MIIFA/MEEFA/similar, SOFOM / banco de segundo piso privado). Cita agendada **15 de septiembre 2026**. Prospecto pidió "los demos" en junta hoy. Estrategia: (a) mandar video Loom + acceso a demo en 24-48h, (b) demo dedicado en la cita del 15.

## Archivos generados

| # | Archivo | Qué es |
|---|---|---|
| 00 | `00-README.md` | Este índice |
| 01 | `01-intermediarios.md` | Perfil detallado de los 7 intermediarios ficticios de la cartera |
| 02 | `02-kb-nara.md` | Knowledge base para Nara (coordinadora operativa) |
| 03 | `03-kb-nico.md` | KB para Nico (cobranza institucional) |
| 04 | `04-kb-nova.md` | KB para Nova (consolidación de reportes) |
| 05 | `05-kb-niva.md` | KB para Niva (análisis y comité) |
| 06 | `06-cartera-maestra-31ago2026.csv` | Cartera maestra consolidada al 31/ago/26 |
| 07 | `07-reporte-uc-industrial-agosto2026.csv` | Excel de prueba 1 (formato simple) |
| 08 | `08-reporte-agrofinanciera-agosto2026.csv` | Excel de prueba 2 (multi-hoja, con alerta de deterioro) |
| 09 | `09-reporte-cajas-solidarias-agosto2026.csv` | Excel de prueba 3 (formato regulatorio SOFIPO) |
| 10 | `10-templates-correos.md` | 5 templates de correo y guiones de llamada |
| 11 | `11-guia-prospecto.md` | Guía para Gerardo con 6 escenarios sugeridos |
| 12 | `12-provisioning-runbook.md` | Instrucciones paso a paso para Nazre (10 pasos) |
| 13 | `13-loom-script.md` | Guión para grabar el video Loom |
| 14 | `14-sql-final-setup.sql` | SQL ejecutable de setup final (pool, monitoreo, sheets_mappings) |
| 15 | `15-whatsapp-gerardo.md` | Draft de WhatsApp para Gerardo (versión larga + corta + notas de tono) |
| 16 | `16-directorio-intermediarios.csv` | CSV del directorio de intermediarios ya poblado (para subir a Drive y convertir a Sheet, sin llenar a mano) |

## Timeline HOY (2026-09-02) — Gerardo recibe todo el mismo día

- **10:00-12:00** — Provisioning (Pasos 1-6 del runbook `12-provisioning-runbook.md`): sheets, meerkats, KBs, pool, portal token.
- **12:00-12:30** — Comida.
- **12:30-13:30** — Correr `14-sql-final-setup.sql` (te activa monitoreo automático + confirma pool + sheets_mappings). Después dry run tuyo ejecutando los 6 escenarios de `11-guia-prospecto.md`.
- **13:30-14:30** — Grabar Loom con `13-loom-script.md`. Objetivo 7-8 min.
- **14:30-15:00** — Mandar WhatsApp a Gerardo. Draft en `15-whatsapp-gerardo.md`.

## Después (hasta cita 15-sept)

- **Monitoreo pasivo**: cron `pilot-monitor` te manda correo cada 30 min SI detecta anomalías. No requiere tu revisión activa a menos que llegue una alerta.
- **Si Gerardo reporta un bug**: pausa con `UPDATE organizations SET demo_paused = TRUE ...` (ver comandos en `14-sql-final-setup.sql`), arregla, reanuda.
- **Día 15-sept**: llegar con ambiente vivo, saber operar cualquier escenario si Gerardo lo pide.

## Brechas conocidas (para cerrar antes de piloto real)

- Pipeline de correo Nova incompleto → workaround: subida de Excel por chat de Oficina.
- Vertical financiero no existe todavía → workaround: usar `civic_reports` de Nara, con nota transparente en la guía.
- No hay kill switch org-wide → workaround: apagar meerkats individualmente vía `active=false`.
- No hay notificación automática a Nazre por consumo anómalo → workaround: revisión diaria manual.

## Nombres y números de referencia

- **Fondo Demo del Norte** — SOFOM E.N.R. ficticia con sede en Monterrey
- Capital: $500M MXN
- Cartera colocada al 31/ago/26: $525.3M
- IMOR ponderado: 3.70%
- 7 intermediarios (2 al corriente + 1 seguimiento + 1 watch list + 1 crítico + 2 sanos)
- 4 empleados digitales: Nara, Nico, Nova, Niva
- Portal email: `fondo-demo-del-norte@centinelia.mx` (a crear)
