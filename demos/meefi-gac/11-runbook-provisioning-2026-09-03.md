# Runbook Provisioning Meefi + GAC — 2026-09-03

Assistant provisionó ambos ambientes en Supabase prod. Este archivo documenta qué quedó hecho y qué falta ejecutar manualmente antes de la cita del 15-sept.

## Estado post-provisioning

### Meefi Demo
- **Org**: `meefi-demo@centinelia.mx` (name: `Meefi`, plan: `pro`, vertical: `financiero`)
- **Portal URL**: `https://www.centinelia.mx/portal/5RP13tnLK6XX`
- **Kill switch org-wide**: activo (`demo_paused = false`). Alerta Nazre: `nazre20@gmail.com` (cron `pilot-monitor` cada 30 min).
- **Meerkats**:
  | Meerkat | Rol | Voz | Jornada | Pool | Voice ID |
  |---|---|---|---|---|---|
  | Nara | Recepcionista Tesorería 24/7 | Sí | combinada | 200 min + 3K tareas | `9Godp7dNohUvXk6qp0gS` |
  | Niva | KYB / Compliance UIF / Análisis | No | tareas | 0 min + 5K tareas | — |
  | Nova | Consolidación diaria + reporting | Sí (voz secundaria) | combinada | 50 min + 5K tareas | `htFfPSZGJwjBv1CL0aMD` |

### GAC Demo
- **Org**: `gac-demo@centinelia.mx` (name: `GAC`, plan: `pro`, vertical: `negocio`)
- **Portal URL**: `https://www.centinelia.mx/portal/PJ9EALpprDEP`
- **Kill switch org-wide**: activo (`demo_paused = false`). Alerta Nazre: `nazre20@gmail.com`.
- **Meerkats**:
  | Meerkat | Rol | Voz | Jornada | Pool | Voice ID |
  |---|---|---|---|---|---|
  | Nara | Coordinación Operativa | Sí | combinada | 200 min + 3K tareas | `nTkjq09AuYgsNR8E4sDe` |
  | Nala | Facturista/Timbradora | No | tareas | 0 min + 3K tareas | — |
  | Niva | Reportes ejecutivos + Análisis cartera | No | tareas | 0 min + 5K tareas | — |

## Ya quedó configurado

- `organizations.knowledge_base` con el KB del negocio (Meefi + GAC).
- `voice_agents.role_knowledge_base` con el prompt específico del rol para cada meerkat.
- `features.vertical` = `financiero` (Meefi) / `negocio` (GAC) — labels condicionales UI activos.
- `features.meerkat_role_id`, `avatar`, `role_color` — identifican archetype.
- `features.is_coordinator` — Niva Meefi/GAC + Nova Meefi.
- `features.billing_pilot` = `meefi-demo` / `gac-demo` — marca para tracking.
- `pilot_notify_email = nazre20@gmail.com` — cron pilot-monitor envía alertas a tu Gmail cuando detecte self_eval<0.5, unanswered≥3, tool errors o platform_incidents.
- `demo_paused = false` — org activa. Para pausar rápido si algo se rompe:
  ```sql
  UPDATE organizations SET demo_paused = TRUE
  WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');
  ```
- Directorios internos (`organizations.directory`) con contactos del equipo cliente (Meefi: 9 personas; GAC: 5 personas).

## Falta ejecutar manualmente (Nazre)

### 1. Números Vapi para voz — ✅ RESUELTO 2026-09-03

Decisión Nazre: un solo número Vapi es suficiente. Meerkats sin phone entrante siguen respondiendo por chat/email; Nara delega/consulta con ellos internamente vía `consultar_agente` / `delegar_tarea`.

- **Nara Meefi** (id `94626f07-9f0c-46c0-ad02-15692f396e71`) → `+52 33 2101 4544` (Vapi phoneNumberId `8490124b-0be7-43ce-8ea0-9543cab4ba13`). Aplicado 2026-09-03.
- Nara GAC + Nova Meefi: sin número entrante. Se demuestran por pantalla (chat/email/reportes).

**Pendiente verificar en Vapi dashboard**: el phoneNumberId `8490124b-...` debe apuntar al assistant/workflow que Centinelia usa para resolver dinámicamente por `phone_number → voice_agents`. Si tus otros pilotos ya funcionan con este binding, no requiere config adicional.

### 2. Subir Google Sheets con la data ficticia

Los 8 CSVs de `demos/meefi-gac/` (4 Meefi + 4 GAC) están listos para subir. Flujo:

1. Crear cuenta de servicio Drive del demo (o reutilizar la de piloto Fondo Demo si existe).
2. Subir cada CSV → convertir a Google Sheet → renombrar según convención.
3. Compartir cada Sheet con la cuenta de servicio de Centinelia (revisar en Integraciones → Google Sheets qué email es).
4. Copiar los `spreadsheet_id` (parte larga de la URL de cada Sheet).
5. `INSERT INTO sheets_mappings (agent_id, purpose, spreadsheet_id, tab_name, headers_row)` — mapeo sugerido:

**Meefi Sheets (agent_id = Nara Meefi `94626f07-9f0c-46c0-ad02-15692f396e71`):**
| Purpose | CSV origen |
|---|---|
| `custom_statement_jpmc` | `meefi-06-statement-jpmc-02sept2026.csv` |
| `custom_ledger_interno` | `meefi-07-ledger-interno-02sept2026.csv` |
| `custom_cartera_master` | `meefi-08-cartera-master-02sept2026.csv` |
| `custom_directorio_meefi` | crear manual con datos de `meefi-01-clientes.md` |

**GAC Sheets (agent_id = Nara GAC `ef7d8da4-8d9d-48cd-b47b-32d472ec7818`):**
| Purpose | CSV origen |
|---|---|
| `custom_variables_nomina` | `gac-06-variables-nomina-quincena.csv` |
| `custom_xmls_recibidos` | `gac-07-xmls-recibidos-transportes-guerra.csv` |
| `custom_balance_er` | `gac-08-balance-transportes-guerra-ago2026.csv` |
| `custom_directorio_gac` | crear manual con datos de `gac-01-clientes.md` |

### 3. Dry run tuyo (Sep 9-12)

Antes de mandar acceso a Gerardo/Miguel:
- Abrir `https://www.centinelia.mx/portal/5RP13tnLK6XX` y `https://www.centinelia.mx/portal/PJ9EALpprDEP` como si fueras ellos.
- Ejecutar los 6 escenarios de `meefi-05-escenarios.md` y `gac-05-escenarios.md`.
- Verificar: Nara Meefi habla lenguaje SWIFT/MT103/fx correcto; Nova entrega consolidado; Nala GAC detecta variables de nómina sospechosas; Niva GAC traduce Estado Resultados a lenguaje dueño.
- Ajustar `role_knowledge_base` in-place si algo suena raro.

### 4. Definir logística cita 15-sept

Confirmado por Miguel: **1 hora presencial**. Prioriza escenarios wow:
- 5 min intro + rol Gerardo (¿co-founder / socio operativo / algo más?)
- 20 min Meefi (2-3 escenarios wow — sugerido: reporte matutino Nova + KYB Niva)
- 20 min GAC (2-3 escenarios wow — sugerido: timbrado nómina Nala + reporte traducido Niva)
- 15 min preguntas y comercial

Define: quién opera pantalla (tú), plan B si no hay proyector, backup si internet se cae (Loom pregrabado del portal).

## Cambio importante — Miguel confirmó Contalink (no CONTPAQi)

**Impacto**: el adapter CONTPAQi del piloto Tortillería NO aplica a GAC. Los KBs de GAC ya se ajustaron para no asumir CONTPAQi (Nala habla de "el sistema contable del despacho" y menciona Contalink solo en nota interna).

**Pendiente antes de la cita**: research quick de Contalink API. Si Contalink expone API → adapter Contalink es factible (~3-5 días). Si no → offering para GAC se limita a automatización pre-Contalink (chase docs, clasificación XMLs, reportes traducidos al cliente) y captura semi-automática.

## Cleanup post-cita

Si se descarta el piloto:
```sql
UPDATE organizations
  SET pilot_notify_email = NULL, demo_paused = TRUE
  WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');
UPDATE voice_agents SET active = FALSE
  WHERE portal_email IN ('meefi-demo@centinelia.mx','gac-demo@centinelia.mx');
```

Si firman:
- Reset pool_reset_date + cambiar plan si aplica.
- Cambiar `client_email` de cada meerkat a la persona real (Gerardo o Miguel).
- Rebautizar `client_name` con el nombre real.
- Migrar de portal_email demo a portal_email definitivo.
