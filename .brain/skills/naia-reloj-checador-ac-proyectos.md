---
name: naia-reloj-checador-ac-proyectos
description: Proceso quincenal de asistencia y nómina de AC Proyectos basado en reloj checador físico + app ZKTeco-style conectada a servidor Porteo. Lo que Naia sabe, lo que puede hacer hoy, y qué queda para Fase 2.
owner: nazre
cliente: ac-proyectos
meerkat: naia
created: 2026-10-13
---

# Naia — Proceso Reloj Checador (AC Proyectos)

## Qué es esto

Documento del proceso que la persona de RRHH / nómina de AC Proyectos ejecuta **cada quincena** para calcular asistencia y retardos de administrativos. Fuente: "Presentación Reloj Checador.pptx" compartido por AC el 2026-10-13 (12 slides, voz en primera persona de la operadora humana).

Naia es la empleada digital de RRHH que AC contrató como parte de la cotización vigente (ver [[handoff-ac-arranque-mes1-2026-09-30]]). Este documento define **qué parte del proceso puede atender Naia hoy** y qué sigue siendo manual del humano.

## El proceso del cliente, paso a paso

La persona que lleva nómina en AC Proyectos (hoy no mapeada formalmente en [[feedback-ac-contactos-camila-tania]]: Camila = ops/Nami, Tania = finanzas; RRHH es rol paralelo distinto) ejecuta esto cada quincena:

1. **Entrar a la laptop local** y abrir la app del reloj checador instalada ahí. La app está conectada por el **servidor de Porteo** al aparato físico.
2. **Login en la app**. Contraseña = usuario.
3. **Seleccionar el reloj y darle Connect**. Confirmación esperada: "Succeed in connecting". Si marca error, el bloqueo es con el equipo de Porteo (es su servidor).
4. **Verificar `Employees`**: altas y bajas de administrativos (no operadores: ellos no checan por viajes). Pain point: cuando dan de alta a alguien, aparece **sin nombre**, hay que buscar el número y asignárselo manualmente. Les mandan captura cuando dan de alta.
5. **`Download Attendance Logs`** → movimientos aparecen en la zona inferior.
6. **`Report`**: elige rango de fechas y empleados. Operadora selecciona a **todos** (por si hay números nuevos sin nombre). Siempre calcula **un día antes** del final de la quincena, deja la nómina lista un día antes y el día pendiente lo pasa a la quincena siguiente.
7. **Calcular** → el reporte se arroja en pantalla.
8. **`Export Data`** con columnas **No / Name / Time**. La ventana de guardar abre dentro del **servidor de Porteo**. Se guarda ahí, cierra sesión del reloj, entra al servidor de Porteo, copia el Excel.
9. Pega el Excel en una carpeta local de su laptop (porque el que exporta "no deja trabajar"), lo abre y arranca a procesar.
10. Copia la hoja a un Excel nuevo. **Separa cada trabajador** (el export viene todo pegado). **Elimina duplicados**.
11. Junto a cada hora marcada como retardo, pone el **monto del retardo**. Esto es **la parte más tardada** del proceso. Pasa esos montos a su base de nómina para rebajar.
12. Contempla festivos (ej. día 16), descansos autorizados (ej. sábado 26) y vacaciones (días sin movimiento que no son falta).

## Pain points conocidos (relevantes para Naia)

| # | Pain point | Dónde vive | Nota para Naia |
|---|---|---|---|
| 1 | Altas aparecen sin nombre, hay que buscar número y asignarlo | app del reloj checador | Naia no accede a la app; solo contextualiza al humano. |
| 2 | Exempleados siguen apareciendo aun después de borrarlos en la app | app del reloj checador | Operadora supone que la baja va hecha desde el aparato físico. Naia menciona la hipótesis si le preguntan. |
| 3 | Números salteados sin dueño | app del reloj checador | Igual que #2, posible baja incompleta en el aparato. |
| 4 | Excel exportado "no deja trabajar" directo | export del reloj | Workaround humano: copiar hoja a otro Excel nuevo. Fase 2 lo deja irrelevante. |
| 5 | Separar por empleado + deduplicar + calcular monto por retardo | Excel copiado | **Esta es la joya automatizable.** Objetivo Fase 2. |

## Qué puede hacer Naia hoy (Fase 1 — sin tool nueva)

Con solo la ficha informativa cargada en el portal de AC Proyectos (ver más abajo), Naia puede:

- **Explicar el proceso** a quien le pregunte en chat o correo. Útil cuando cubre vacaciones, cuando entra alguien nuevo al rol, o cuando Nazre lo platica con otro cliente.
- **Guiar paso a paso** si alguien le dice "voy a sacar la asistencia, dime qué sigue".
- **Dar visibilidad del pain point** cuando pregunten "¿por qué me siguen apareciendo exempleados?" — contesta la hipótesis (baja desde el aparato físico) sin inventar.
- **Mandar recordatorio quincenal** (si Nazre lo configura con `agent_rules` + cron de Naia): "mañana cierre de quincena, acuérdate que calculas hasta un día antes".
- Si recibe el Excel exportado por correo con petición de resumen: **leerlo como data tabular** (patrón Nova para reportes operativos: el inbox-processor ya extrae el Excel al final del correo en "Contenido de documentos adjuntos") y devolver un resumen en el cuerpo + archivo adjunto si lo piden. **No modifica Excel original ni calcula montos de retardo todavía** — eso es Fase 2.

Reglas duras del canal:
- **Confidencialidad**: temas de personal son sensibles. Si alguien que no es la operadora de nómina pide datos de empleados, Naia escala con `pedir_a_humano`.
- **Nunca inventa**: si no encuentra algo en su ficha o en el adjunto, lo dice derecho.

## Qué queda para Fase 2 (tool nueva)

Tool propuesta: `rrhh_calcular_retardos_desde_excel` (nombre tentativo), en los 3 canales (voz / chat / correo) por [[feedback-tool-3-canales]].

Input esperado:
- Excel exportado del reloj checador (columnas No / Name / Time).
- Reglas de retardo del cliente (ver "Acuerdos pendientes" abajo).

Output esperado:
- Excel procesado con:
  - Una hoja o bloque por empleado (ya separado).
  - Duplicados eliminados.
  - Columna "retardo" marcada por día con minutos de retraso.
  - Columna "monto" calculada según regla.
  - Totales por empleado para integrar a la base de nómina.
- Resumen por correo o chat con el total de retardos y monto total de la quincena.

**No implementar hasta cerrar los acuerdos pendientes abajo.** Sin reglas acordadas la tool es un adivinador.

## Dos grupos de empleados en AC (confirmado 2026-10-15)

AC Proyectos tiene **dos modelos de cálculo distintos**, no uno solo:

### Grupo A — Administrativos (default)

Modelo: **check-in vs hora de entrada fija.**

- Hora entrada 8:00 AM, cero tolerancia.
- 8:01-8:29 → retardo base $200
- 8:30-9:29 → retardo doble $400
- 9:30+ (o sin checada) → falta = sueldo diario del empleado
- Lógica implementada en `classifyDay` + `rrhh_nomina_config` + `rrhh_empleados`. **Correcta y en prod.**

### Grupo B — Operativos (7 excepciones, turno 12 horas)

Reloj_ids: 120 (Alberto Arquieta), 215 (Sherlyn), 144 (Luis Avila), 158 (Rigoberto Garcia), 186 (Jose Cruz), 187 (Hector Avila), 217 (Jancarlo).

Modelo: **tiempo total trabajado vs horas requeridas** (no vs hora de entrada fija). Confirmado por Lucero 2026-10-15 textual:

> "sí, ellos sí tienen tolerancia, mientras cubran las 12 horas, si llegan despues pero se van antes si se le aplicaria el rebaje"

Fórmula:
```
tiempo_trabajado = ultima_checada_del_dia - primera_checada_del_dia
if tiempo_trabajado >= 12h → OK, $0
if tiempo_trabajado <  12h → rebaje escalonado (base/doble/falta según minutos faltantes)
```

Rebajes: base $50 / doble $100 (ya en `rrhh_empleados.monto_retardo_base_mxn` + `monto_retardo_doble_mxn` para esos 7 reloj_ids).

**Umbrales de minutos faltantes NO definidos todavía.** Datos pendientes de Lucero:
1. Minutos faltantes que disparan rebaje base vs doble (ej. 1-30 min base, 30-90 min doble, probable paralelo con admin).
2. Minutos faltantes (o patrón "no checó salida") que ya cuenta como falta completa.
3. Horas requeridas por operativo: ¿todos exactamente 12h, o varía?
4. Comportamiento si solo checó entrada (sin salida).

**Status implementación operativos: PAUSADA 2026-10-15.** La lógica actual del `classifyDay` les aplica reglas de admin (check-in vs hora fija 8:00), que no es correcta para operativos — les cobraría retardo si llegan después de 8:00 aunque hayan cubierto las 12 horas. **No procesar quincena de operativos hasta implementar la ruta "turno cubierto" en el clasificador.**

### Plan Fase 2a.2 (desbloquea cuando Lucero mande umbrales)

- Agregar columna `rrhh_empleados.turno_horas_requeridas NUMERIC(4,2)` (NULL = usar modelo admin check-in; valor = usar modelo turno cubierto).
- Nueva ruta en `classifyDay` (o función hermana `classifyDayTurnoCubierto`) que calcula tiempo trabajado y aplica escalonado por minutos faltantes.
- `process-quincena` detecta modo por empleado (si `turno_horas_requeridas` presente → modo turno; si no → modo check-in).
- Script seed de los 7 operativos actualiza `turno_horas_requeridas = 12`.
- Tests nuevos para ambos modos.

Esfuerzo estimado: 2-3 h cuando lleguen los umbrales.

## Acuerdos con AC Proyectos (9/10 cerrados por Lucero 2026-10-13)

Fuente: WhatsApp de Lucero Longoria (+52 1 81 1786 9746, `lucero@porteoglobal.com`) a Nazre, 2026-10-13 16:36. **Lucero sí trabaja para AC Proyectos**, enfocada en Porteo. **AC Proyectos y Porteo Global son dos empresas del mismo dueño** (Porteo = línea de trailers). El "servidor de Porteo" del PPTX es infra interna del grupo, no un proveedor externo. Para efectos de Centinelia: una sola org cliente (AC Proyectos), Lucero es operadora autorizada.

| # | Acuerdo | Respuesta Lucero | Notas |
|---|---|---|---|
| 1 | Hora oficial de entrada | **8:00 AM** | Mismo para todos los administrativos. |
| 2 | Minutos de tolerancia | **Cero.** 8:01 AM ya es retardo. | |
| 3 | Monto del retardo | **Progresivo. Pasando las 8:30 el retardo va al doble.** | **Falta pieza:** monto base en pesos (8:01 - 8:30). Preguntar. |
| 4 | Umbral falta vs retardo | **9:30 en adelante es falta.** | Lectura: 8:01 - 8:29 retardo base, 8:30 - 9:29 retardo doble, 9:30+ falta. |
| 5 | Rango de corte quincenal | "Día último del mes a un día antes de la quincena." | Ambiguo. Lectura probable: quincenas 1-15 y 16-fin, calculando hasta un día antes del cierre (como dice el PPTX en el paso 6). Confirmar. |
| 6 | Festivos | **Según la Ley Federal del Trabajo.** | Calendario público, hardcodeable. 2026 = 1 ene, 1er lun feb, 3er lun mar, 1 may, 16 sep, 3er lun nov, 25 dic, + cambio presidencial cada 6 años (1 oct). |
| 7 | Descansos | **Asignados por cada jefe de departamento, se los pasan a Lucero por mensaje al inicio del mes.** | **Implica**: Naia necesita recibir ese mensaje y guardar el calendario de descansos del mes por empleado. Tool nueva `rrhh_registrar_descansos_mensuales`. |
| 8 | Vacaciones | **Por mensaje le mandan las hojas de vacaciones autorizadas.** | **Implica**: Naia necesita leer esos mensajes/adjuntos y guardar vacaciones por empleado. Tool nueva `rrhh_registrar_vacaciones_autorizadas`. |
| 9 | Base de nómina destino | **"Es un Excel aparte, solo agrego la hoja al archivo."** | Entrega: Naia devuelve una hoja Excel lista para pegar/anexar al libro de nómina de Lucero. No pretende tocar el libro completo. |
| 10 | Operadora autorizada | **Lucero Longoria** `lucero@porteoglobal.com` | Único canal autorizado por ahora. Whitelist Naia solo para este correo. |

**Pieza faltante #1:** monto base del retardo (8:01 - 8:30). Sin ese número no se calcula.
**Pieza faltante #2:** monto de la falta (9:30+). Puede ser porcentaje de día o monto fijo. Preguntar.
**Pieza faltante #3:** confirmar rango exacto de quincenas (1-15 / 16-fin, con corte un día antes).

## Reloj físico

- **Marca:** BioCheck
- **Modelo:** **TA-3400** (confirmado por Lucero 2026-10-14, Porteo todavía no sabe la variante exacta de capacidad 30 / 40 / 75 empleados).

Implicaciones opción B (SDK directo, no bloqueante hoy):

- La serie BioCheck TA-3xxx es casi siempre **ZKTeco-compatible** bajo el capot (BioCheck es rebrand común). Protocolo típico: **ZKProtocol sobre TCP:4370**. La librería Python `pyzk` suele funcionar directo.
- Conectividad típica del TA-3400: TCP/IP (RJ45) + USB flash drive para export. Algunos SKU soportan WiFi.
- Capacidad: TA-3400 típicamente 3000 huellas / 100k registros. Las variantes "30/40/75 empleados" que Lucero menciona suenan a licencia del software administrador, no al firmware del aparato — para AC Proyectos (equipo chico) cualquier variante alcanza.
- Para hacer Opción B viable necesitamos:
  1. IP local del reloj (Porteo la tiene) + puerto 4370 accesible.
  2. VPN AC/Porteo ↔ Centinelia, o reverse SSH tunnel desde un worker on-prem, o migrar el reloj a algún gateway en Supabase/VPS.
  3. 1-2 días de desarrollo (prueba de conexión `pyzk` + worker cron que sincroniza cada hora a `rrhh_biocheck_logs`).
- **No urgente.** Opción A (procesar Excel por correo/chat) ya cubre el caso de uso y está en prod. Opción B solo tiene sentido si AC/Porteo quieren eliminar el paso manual de exportar Excel.

## Memoria estructurada que necesita Naia (Fase 2)

Para que la Fase 2 funcione sin que Lucero tenga que mandar todo cada quincena, Naia necesita 3 "memorias" por organización:

1. **Catálogo de empleados activos**: id del reloj, nombre, hora de entrada (default 8:00 AM pero puede variar). Se poda cuando Lucero da baja. Alta/edición vía chat.
2. **Calendario mensual de descansos**: por empleado, qué día(s) del mes tiene descanso autorizado. Se registra con tool nueva al inicio del mes cuando Lucero reenvía los mensajes de los jefes.
3. **Calendario de vacaciones**: por empleado, qué rango de fechas tiene vacaciones. Se registra con tool nueva cuando Lucero reenvía la hoja autorizada.

Festivos nacionales van hardcoded a tabla `holidays_mx_lft`.

## Tool stack decidido para Fase 2

5 tools nuevas, patrón per-org opt-in (NUNCA modifica `promptPersonalidad` de Naia base ni `MEERKAT_VOICE_DISTRIBUTION.naia`):

- `rrhh_registrar_empleado(reloj_id, nombre, hora_entrada?)` — alta en `rrhh_empleados`.
- `rrhh_dar_baja_empleado(reloj_id)` — soft-delete (activo=false + dado_baja_at + dado_baja_por).
- `rrhh_registrar_descansos_mensuales(anio, mes, descansos: [{reloj_id, fechas: [YYYY-MM-DD]}])` — UPSERT por (empleado_id, anio, mes).
- `rrhh_registrar_vacaciones_autorizadas(reloj_id, fecha_inicio, fecha_fin, nota?)` — INSERT en `rrhh_vacaciones`.
- `rrhh_procesar_quincena_desde_excel(excel_url, fecha_inicio, fecha_fin)` **joya**: parser BioCheck → clasificador (ok/retardo_base/retardo_doble/falta) → cruce calendarios → output Excel para anexar.

Todas en los 3 canales por [[feedback-tool-3-canales]]. Feature flag per-org `organizations.features.rrhh_nomina_v1` (NO per-agent). Pack nuevo `hr_nomina` en `src/lib/tools/packs.ts` con `activeCheck: ctx => ctx.has_hr_nomina`. Cobrando normal por [[feedback-pool-work-based]].

### Patrón per-org exacto (sin tocar la base de Naia)

Decisión arquitectónica (confirmada por Nazre 2026-10-13): el `promptPersonalidad` de Naia en `src/lib/portal/meerkat-roles.ts` **nunca se modifica** por este trabajo. El preset `MEERKAT_VOICE_DISTRIBUTION.naia` en `src/lib/vapi/sync.ts` **tampoco se modifica**. Las 5 tools nuevas se exponen al agente Naia-de-AC-Proyectos vía:

1. Registry: `TOOL_REGISTRY_BASE` en `registry.ts` con `gatedByRole: ['naia']`, `pack: 'hr_nomina'`, `channels: ['voice','chat','email']`.
2. Pack: `SKILL_PACKS` en `packs.ts` con las 5 tools. `activeCheck` lee `organizations.features.rrhh_nomina_v1`.
3. Agente: `voice_agents.tool_overrides.enabled += [las 5 tools]` solo para la row del agente Naia de AC Proyectos. Esto las agrega al preset del rol (patrón `tools = preset ∪ universales - disabled + enabled` filtrado por packs activos).

Otras orgs futuras que contraten a Naia: no ven las tools, no corren el pack, ningún cambio en su experiencia.

### Esqueleto Fase 2a (SHIPPED 2026-10-13 — código listo para merge)

**Infra DB:**
- Migración `supabase/migrations/20261013220000_rrhh_nomina_v1_schema.sql`:
  - 5 tablas: `rrhh_empleados`, `rrhh_descansos_mensuales`, `rrhh_vacaciones`, `rrhh_festivos_mx_lft` (global), `rrhh_nomina_config` (per-org).
  - RLS obligatoria por [[feedback-rls-public-tables-default]].
  - Columna `rrhh_authorized_operators` jsonb en `organizations` para whitelist de correos.
  - Seed de 35 festivos LFT 2026-2030 (calculados determinísticamente por `_smoke/compute-lft-holidays.mjs`).

**Core modules `src/lib/rrhh/*`:**
- `parser-biocheck.ts` — parser del Excel exportado por BioCheck (columnas No/Name/Time, tolerante a aliases y formatos de fecha).
- `retardo-classifier.ts` — clasificador puro `ok/retardo_base/retardo_doble/falta/descanso/vacaciones/festivo` con precedencia festivo > vacaciones > descanso > checada.
- `output-excel.ts` — generador exceljs de 3 hojas (Detalle diario, Resumen por empleado, Notas con config aplicada + warnings).
- `process-quincena.ts` — orquestador: lee config + catálogos + parsea + clasifica + genera Excel. Devuelve resumen con `pendienteDeMontos: bool` si config `monto_*` es NULL.

**Executor module `src/lib/tools/executors/rrhh.ts`:**
- 5 tools con gate defense-in-depth: lee `organizations.features.rrhh_nomina_v1`; si falso, rechaza con mensaje user-friendly.
- Branch en `executor.ts` tras el bloque Navi: delegación lazy al módulo.

**Pack `hr_nomina` en `src/lib/tools/packs.ts`:**
- Agregado a `SKILL_PACKS` con `activeCheck: ctx => !!ctx.has_hr_nomina`.
- `has_hr_nomina` en `OrgPackContext` + lectura desde `organizations.features.rrhh_nomina_v1` en `resolveOrgPackContext`.

**Registry `src/lib/tools/registry.ts`:**
- 5 entries nuevas con `gatedByRole: ['naia']`, `channels: A` (voice+chat+email), category `rrhh`, policy DEFAULT.
- De paso: fix drift pre-existente línea 243 `revisar_mi_inbox_ahora` channels: A → ['chat','email'] (nunca tuvo preset voice, por [[feedback-zero-debt]]).

**3 canales (patrón opt-in per-org, NO en preset base de Naia):**
- Voice: 5 cases en `buildToolDef()` de `src/lib/vapi/sync.ts` con `server('exec/<name>')`.
- Chat: 5 `Anthropic.Tool` constants + agregadas a `ALL_TOOLS` + `CHAT_TOOL_BY_NAME` en `agent-chat/route.ts`.
- Email: nuevo array `RRHH_NOMINA_EMAIL_TOOLS` + merge en `EMAIL_TOOL_BY_NAME` en `inbox-processor.ts`.
- Channel mapping: 5 entries en `VOICE_TO_CHAT` de `channel-mapping.ts`.
- Tool-completeness: 5 entries en `KNOWN_DROPS.registryVoiceOverclaimed` con comentario explicando el patrón per-org.

**Script seed `_smoke/seed-ac-rrhh-nomina-v1.ts`:**
- Idempotente, soporta `--dry-run`, montos opcionales (NULL hasta que Lucero los pase).
- Hace: `organizations.features.rrhh_nomina_v1 = true` + `rrhh_authorized_operators += ["lucero@porteoglobal.com"]` + UPSERT en `rrhh_nomina_config` + `voice_agents.tool_overrides.enabled += [5 tools rrhh_*]` para cada agente Naia de la org.

**Tests:**
- `src/lib/rrhh/__tests__/retardo-classifier.test.ts` 17/17 verde (incluye casos exactos AC: 07:58/08:00/08:01/08:29/08:30/09:29/09:30/11:00 + precedencia festivo > vacaciones > descanso + montos NULL).
- `tool-completeness.test.ts` 36/36 verde.
- `npx tsc --noEmit -p tsconfig.json` 0 errores.

**SOP + PDF compañero** ya en Dropbox AC → RR.HH (sesión previa).

### Pendiente para alimentar mañana (datos de Lucero)

1. **Aplicar migración**: Supabase Studio o `supabase db push`.
2. **Correr seed** (con los montos reales ya cuando Lucero los dé):
   ```bash
   npx tsx _smoke/seed-ac-rrhh-nomina-v1.ts \
     --portal-email=<AC_portal_email> \
     --monto-retardo-base=<X> \
     --monto-retardo-doble=<Y> \
     --monto-falta=<Z>
   ```
   Si corre sin los flags de monto, se guardan NULL y la tool `rrhh_procesar_quincena_desde_excel` devuelve clasificación sin cálculo monetario. Para actualizar después:
   ```sql
   UPDATE rrhh_nomina_config SET monto_retardo_base=X, monto_retardo_doble=Y, monto_falta=Z WHERE portal_email='<AC>';
   ```
3. **Subir PDF compañero** al portal AC → Fichas informativas.
4. **Smoke E2E** con Excel real de Lucero (crear bucket `rrhh-reloj` en Supabase storage si no existe, subir Excel, invocar tool desde chat o correo).
5. Confirmar quincenas 1-15 / 16-fin.
6. Modelo exacto BioCheck (plaquita trasera) para evaluar opción B (SDK directo al reloj).

### Pendiente Fase 2b (mañana 2026-10-14)

Bloqueado por 3 datos de Lucero + modelo exacto BioCheck + idealmente un Excel real de muestra. **No empezar hasta tener los datos** — sin montos reales el parser no se puede probar end-to-end.

Orden de implementación recomendado:

1. **Aplicar la migración `20261013220000_rrhh_nomina_v1_schema.sql`** vía Supabase Studio o `supabase db push`.
2. **Executor module** `src/lib/tools/executors/rrhh.ts` con las 5 tools. Branch en `executor.ts` tipo `if (toolName.startsWith('rrhh_')) return (await import('./executors/rrhh')).executeRrhhTool(...)` (patrón Navi en línea 220 de executor.ts).
3. **Pack entry** en `packs.ts`: agregar `has_hr_nomina` a `OrgPackContext`, nuevo `SKILL_PACKS` entry, lectura en `resolveOrgPackContext` desde `organizations.features.rrhh_nomina_v1`.
4. **Registry entries** en `registry.ts` para las 5 tools (`gatedByRole: ['naia']`, `pack: 'hr_nomina'`, `channels: A`).
5. **Voice**: 5 cases en `buildToolDef()` de `vapi/sync.ts` con `server('exec/<tool>')` (dispatcher único `/api/voice/tools/exec/[toolName]/route.ts` ya existe).
6. **Chat**: 5 `Anthropic.Tool` + `ALL_TOOLS` + `VOICE_TO_CHAT` + `CHAT_TOOL_BY_NAME` en `agent-chat/route.ts`.
7. **Email**: ya cubierto automáticamente vía executor + inbox-processor.
8. **Parser BioCheck** `src/lib/rrhh/parser-biocheck.ts` + **clasificador** `retardo-classifier.ts` + **output** `output-excel.ts` (usar `exceljs`, ya en el repo).
9. **Script seed AC** `_smoke/seed-ac-rrhh-nomina-v1.ts`:
   - `UPDATE organizations SET features = features || '{"rrhh_nomina_v1": true}'::jsonb, rrhh_authorized_operators = '["lucero@porteoglobal.com"]'::jsonb WHERE portal_email = '<AC portal_email>'`.
   - INSERT en `rrhh_nomina_config` con hora_entrada 8:00, umbrales 30/90, montos de Lucero.
   - `UPDATE voice_agents SET tool_overrides = jsonb_set(tool_overrides, '{enabled}', (COALESCE(tool_overrides->'enabled', '[]'::jsonb) || '["rrhh_registrar_empleado","rrhh_dar_baja_empleado","rrhh_registrar_descansos_mensuales","rrhh_registrar_vacaciones_autorizadas","rrhh_procesar_quincena_desde_excel"]'::jsonb)) WHERE portal_email = '<AC>' AND (features->>'meerkat_role_id') = 'naia'`.
10. **Tests**: unit del parser + clasificador. Tool-completeness regression (las 5 en los 3 canales). `npx tsc --noEmit -p tsconfig.json` antes del push por [[feedback-tsc-antes-push]].
11. **Smoke E2E** con Excel real de Lucero.
12. **Subir ficha PDF al portal de AC** (manual Nazre).

Total estimado 4-6 h sin smoke, 6-8 h con smoke y ajustes. No arrancar en modo nocturno.

## Ficha informativa que vive en el portal

Para que Naia realmente "aprenda" en runtime, hay que subir el PDF compañero `Manual-Reloj-Checador-para-Naia.pdf` (generado por `_smoke/build-manual-naia-reloj-checador-pdf.mjs`) al portal de AC Proyectos:

1. Portal AC → Fichas informativas → Upload PDF.
2. Esperar a que el extractor saque las secciones.
3. Verificar que la ficha quede **activa** (toggle del portal).
4. Confirmar que Naia tiene el modo correcto (`stuffed` o `embeddings`, ver `fichas_informativas.mode`).

**Esto no se automatiza por script hoy** — se sube desde el portal como cualquier otra ficha.

## Handoff y versiones

- **2026-10-13**: documento creado a partir del PPTX "Presentación Reloj Checador.pptx". Fase 1 lista para arrancar (subir PDF compañero al portal). Fase 2 pendiente de los 10 acuerdos de arriba.

## Referencias

- [[handoff-ac-arranque-mes1-2026-09-30]] — contexto del arranque de AC como cliente.
- [[feedback-ac-contactos-camila-tania]] — Camila y Tania no son contactos de RRHH; verificar quién es la operadora.
- [[feedback-tool-3-canales]] — para la Fase 2 cuando se implemente la tool.
- [[feedback-no-tecnicismos-docs-clientes]] — regla para el PDF compañero.
- [[feedback-logo-real-en-docs-cliente]] — logo real en PDF.
- [[feedback-correo-contacto-cliente-hola-centinelia]] — `hola@centinelia.mx` en documentos cliente.
