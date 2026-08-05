# Portal Centinelia — Auditoría de Restructuración (2026-08-05)

**Referencia:** Spec original `2026-08-04-portal-simplificacion-ia-design.md`
**Estado:** Auditoría completada. Propuestas accionables abajo.

---

## 1. `/portal/[token]?tab=inicio` (Escritorio / Dashboard)

**Secciones actuales:**
- Greeting banner (status de oficina: activa/pausada)
- Aviso de contrato pendiente (si aplica)
- Reauth alerts para Gmail/Outlook (mobile strip)
- Period filter (7 días / 30 días / Todo)
- **KPI cards** (7-8 widgets): Conversaciones · Sin intervención · Leads · Pedidos · Citas · Salientes · Tareas
- Ratio de autonomía (texto small)
- Brief del día (si Nox activo)
- **Tu equipo hoy** (widget con estado real-time de empleados)
- **Insights de la semana**
- **Actividad reciente** (feed 5 últimos eventos: calls + leads + orders + appts)
- **Horas pico** (chart de distribución horaria)
- Reporte mensual (sidebar mobile + desktop)
- Contexto de empleados (KB memory bars por empleado)
- Salientes widget (desktop-only: campañas activas, contactos pendientes, última ejecución)

**Oportunidades detectadas:**

- **[REDUCIR DENSIDAD]** KPIs: Mostrar 3 primarios (Conversaciones · Sin intervención · Atención requerida) + 4 secundarios en fila menor (Autonomía · Tasa contestada · Tareas · Leads). Hoy hay 7-8 KPIs compitiendo por atención en grid flexible que cambia según feature flags.
  - **Razón:** Densidad tóxica. Usuario nuevo abruma con tantos números. Spec propone exactamente esto (3 KPIs + 1 fila secundaria).
  - **Severity:** ALTA — impacta onboarding.

- **[MOVER]** "Insights de la semana" → `/historial/aprendizajes`. Hoy está en Inicio compitiendo con otros widgets. No es un KPI, es un análisis que el usuario consulta cuando necesita reflexionar, no cada mañana.
  - **Razón:** Reduce ruido en dashboard. Página `/historial/aprendizajes` es natural.
  - **Severity:** MEDIA.

- **[MOVER]** "Tu equipo hoy" widget → fusionarse con tab "Administración › Tu equipo" como estado persistente. Hoy duplica lo que existe en `/agentes`.
  - **Razón:** El estado de equipo es para decisiones de gestión, no para el dashboard de "cómo va hoy". El dashboard debería mostrar IMPACTO (leads, pedidos, ahorros), no detalles operacionales.
  - **Severity:** MEDIA — es redundancia conceptual.

- **[SIMPLIFICAR]** Feed de actividad: 5 eventos está bien, pero mezclar calls + leads + orders + appts en orden cronológico es ruido. Priorizar: Leads/Pedidos/Citas (acciones capturadas) > Calls. Las calls pueden ir a `/historial/llamadas`.
  - **Razón:** El feed debe mostrar "trabajo hecho" (captures), no raw call data.
  - **Severity:** BAJA — visual, no funcional.

---

## 2. `/portal/[token]?tab=negocio` (Organización)

**Secciones actuales:**
- OrgCard (perfil: nombre, descripción, foto, localización)
- Branding de documentos (colores, website, footer)
- Horarios de negocio
- Knowledge Base (manual general de la org)
- Perfil del dueño (nombre, email, foto)
- Políticas de negocio (guardrails org-level)
- Sitio web sync
- Link de reseñas (Google)

**Oportunidades detectadas:**

- **[ESTADO]** Ya está simplificado en el spec propuesto como `/administracion/organizacion`. Combinación de 5 secciones coherentes: Perfil · Marca · Horarios · KB · Políticas.
  - **Razón:** No hay redundancia. Ya es una sección uniforme de "configuración organizacional".
  - **Severity:** NINGUNA — mantener como está.

- **[NOTA]** Link de reseñas Google puede movarse a `/administracion/integraciones` si se agregan más integraciones de reputación (Trustpilot, etc.). Hoy es edge case.
  - **Razón:** Cuando hay 1-2 integración, vivirán in-line. Cuando hay N, launcher grid es mejor.
  - **Severity:** BAJA — decisión futura.

---

## 3. `/portal/[token]?tab=cuenta` (Cuenta / Billing)

**Secciones actuales:**
- Minutos: uso · reset date · compra rápida
- AI Ops (Tareas): uso · límite · compra rápida
- Auto-refill config
- Compra de minutos (Stripe UI)
- Compra de tareas (Stripe UI)
- Plan upgrade callout
- Jornada selector (minutos · tareas · combinada)
- Facturación (si government)
- Reportes por email subscription

**Oportunidades detectadas:**

- **[FUSIÓN]** "Minutos" + "AI Ops" + "Jornada" → consolidar en una card "Tu plan de servicio" con 3 subsecciones colapsables o 3 pills de filtro (Voz · Tareas · Configuración).
  - **Razón:** Reducir 5 cards a 1, ahorrando scroll. Son parte del mismo concepto: "qué estoy usando y cómo".
  - **Severity:** MEDIA — mejora UX pero no es duplicación.

- **[MOVER]** "Facturas" / "Reportes por email" → `/administracion/facturación`. Hoy están en Cuenta pero son operacionales/administrativas, no de consumo personal.
  - **Razón:** Separación de conceptos. Cuenta = Mi uso · Administración = Gestión empresa.
  - **Severity:** MEDIA.

- **[NOTA]** Auto-refill: está bien aquí, pero podría ser en admin también si se agrega "Método de pago". Dejar donde está por ahora.
  - **Severity:** NINGUNA.

---

## 4. `/portal/[token]/agentes/page.tsx` (Mis Empleados)

**Secciones actuales:**
- Agent cards grid (N empleados con avatar · nombre · rol · estado · capabilities · call count · pause/resume buttons)
- Capability coverage banner (% de tools cubiertos · categorías core vs especializadas · recomendaciones de nuevos meerkats)

**Oportunidades detectadas:**

- **[ESTADO]** Estructura correcta. Ya implementa el patrón "Tu equipo" propuesto en spec.
  - **Razón:** Esta página es limpia, no hay duplicación. Cards son auto-descriptivas.
  - **Severity:** NINGUNA — mantener.

- **[NOTA]** Capability banner es excelente, pero podría ser opcionable (colapsable por defecto en mobile) para reducir scroll en cuentas con muchos empleados.
  - **Severidad:** BAJA — improvement, no requisito.

---

## 5. `/portal/[token]/llamadas/entrantes/page.tsx`

**Secciones actuales:**
- Header badge (count de llamadas)
- Registro de llamadas (tabla/search: caller · duration · outcome · timestamp)
- Descarga CSV
- **Leads tabs section** (si enabled): Pills tabs (Leads · Pedidos · Citas) con tabla de capturas

**Oportunidades detectadas:**

- **[ESTADO]** Limpio, single-purpose. Este es uno de los 3 endpoints de "Llamadas" que spec propone consolidar.
  - **Razón:** Spec quiere 1 sola ruta `/historial/llamadas?filtro=entrantes` con pills. Hoy es `/llamadas/entrantes`.
  - **Severity:** MEDIA — requiere refactor de routing, pero UX final será mejor.

- **[MOVER]** "Leads tabs section" → podría dividirse en 2 vistas:
  1. Inline aquí si el usuario quiere "ver qué capturé de esas llamadas"
  2. O mover a `?view=capturas` para reducir altura de página
  - **Razón:** Reduce cognitive load. Un usuario que solo quiere ver el log de llamadas no necesita ver simultáneamente 3 tabs de capturas.
  - **Severity:** BAJA — UX, no funcional.

---

## 6. `/portal/[token]/llamadas/salientes/page.tsx`

**Secciones actuales:**
- Outbound toggles (habilitar/deshabilitar outbound)
- OutboundSection con 2 sub-tabs:
  - Contactos (lista de números pendientes · status · fail count · manual dial button)
  - Campañas (campañas activas · última ejecución · métricas)

**Oportunidades detectadas:**

- **[ESTADO]** Está correctamente aislado si Outbound está enabled. Si disabled, redirige a `/llamadas/entrantes`.
  - **Razón:** Buena práctica. No muestra features disabled.
  - **Severity:** NINGUNA.

- **[NOTA]** Con spec de consolidación, esta ruta se convertiría en `/historial/llamadas?filtro=salientes` con sub-pills (Contactos · Campañas).
  - **Razón:** UX unificada.
  - **Severity:** MEDIA — refactor necesario en futuro.

---

## 7. `/portal/[token]/usuarios/page.tsx` (Usuarios del Portal)

**Secciones actuales:**
- SubUserManager (agregar · editar · eliminar usuarios con módulos específicos)

**Oportunidades detectadas:**

- **[ESTADO]** Correctamente aislado. Owner-only. Limpio.
  - **Razón:** Gestión de permisos es concepto separado, bien ubicado.
  - **Severity:** NINGUNA — mantener.

- **[NOTA]** Con V2 refactor, esto podría moverse a `/administracion/usuarios-y-permisos` para centralizar admin. Hoy es accesible pero "flotante".
  - **Severity:** BAJA — mejor cuando haya más secciones admin.

---

## 8. `/portal/[token]/configurar/page.tsx` (Empleado — Configuración)

**Secciones actuales:**
- **5 tabs** (ya refactorizado de 30+ anclas a esto):
  1. **Personalidad y voz:** Voz Vapi · Idioma · Rol/responsabilidades · Definición de listo · Tono de marca
  2. **Conocimiento y guardrails:** KB general · Guardrails org · Brand voice guide
  3. **Herramientas e integraciones:** Tools por rol · Email integration · Aprobaciones · Integraciones externas (Sheets, Notion, QB, etc.)
  4. **Horarios y automatizaciones:** Jornada · Horarios · Heartbeat · Iniciativas
  5. **Marca y ajustes:** Logo · Colores · Plantillas email · Passphrase (si coordinador) · Números de equipo

**Oportunidades detectadas:**

- **[ESTADO]** Excelente refactor ya realizado. 5 tabs es the sweet spot.
  - **Razón:** Spec original propone exactamente esto. Implementación está alineada.
  - **Severity:** NINGUNA — mantener estructura.

- **[SIMPLIFICAR dentro Tab 3]** "Herramientas e integraciones" podría dividirse:
  - Subsección A: Tools (capabilities selector con visual de qué hace cada una)
  - Subsección B: Email (solo si habilitado)
  - Subsección C: External integrations (grid de logos: Sheets · Notion · QB · Helpdesk · etc.)
  - Razón: Hoy es larga. Acordeones ayudan, pero separación visual es mejor.
  - **Severity:** BAJA — improvement de legibilidad.

---

## 9. `/portal/[token]/oficina/` (Grupo Oficina — 14 items)

### 9.1 `/oficina/page.tsx` (Hoy en la oficina)

**Secciones actuales:**
- EquipoHoySection (estado real-time de empleados)
- AgentRankingSection (ranking de performance: llamadas · leads · autonomía)
- ActividadFeed (eventos últimas 24h)
- AttentionPanel (items que requieren atención: fallas · aprobaciones · investigaciones)

**Oportunidades detectadas:**

- **[MOVER]** EquipoHoySection, AgentRankingSection → `/administracion/tu-equipo` (nueva página).
  - **Razón:** Estos son reportes de gestión, no de "hoy en la oficina". Hoy duplican `/agentes`.
  - **Severity:** ALTA — clara duplicación.

- **[MOVER]** ActividadFeed → `/historial/aprendizajes` o crear `/historial/eventos` (últimas 24-48h).
  - **Razón:** Feed es histórico, no presente. Pertenece a Historial.
  - **Severity:** MEDIA.

- **[FUSIÓN]** AttentionPanel → Consolidar con Bandeja. No es "un item de oficina", es "inbox" del usuario.
  - **Razón:** Requieren-tu-atención es bandeja. No merece página separada ni panel.
  - **Severity:** ALTA — es bandeja disfrazada.

- **[RESULTADO propuesto]** `/oficina/page.tsx` debería desaparecer. Sus widgets se distribuyen:
  - "Hoy en la oficina" → `/administracion/tu-equipo`
  - "Atención" → `/bandeja`
  - "Eventos" → `/historial`

---

### 9.2 `/oficina/bandeja/page.tsx`

**Secciones actuales:**
- CommsRoutingEditor (si vertical=gobierno)
- OpsInboxSection (mensajes · aprobaciones · fallas · tareas · investigaciones)

**Oportunidades detectadas:**

- **[ESTADO]** Correcto. Esta es la Bandeja unificada que spec propone (absorbe mesa-de-ayuda + aprobaciones + fallas).
  - **Razón:** Patrón "Requieren tu acción" ya validado. Solo mensaje es ir a top-level routing.
  - **Severity:** NINGUNA — mantener como está, solo mover a `/bandeja` top-level (redirigir `/oficina/bandeja`).

- **[NOTA]** CommsRoutingEditor debería ir a una sección de gobierno específica o `/administracion/gobierno` si es org-scoped.
  - **Severity:** BAJA — vertical edge case.

---

### 9.3 `/oficina/llamadas/page.tsx`

**Secciones actuales:**
- LlamadasTabs con multi-tabs:
  - Registro de llamadas (tabla)
  - Leads (si enabled)
  - Pedidos (si enabled)
  - Citas (si enabled)
  - Salientes (si enabled)
  - Campañas salientes (si enabled)
  - Missed call recovery (si enabled)

**Oportunidades detectadas:**

- **[FUSIÓN]** Esta es la "oficina view" de llamadas. Spec propone fusionarse con `/llamadas/entrantes` y `/llamadas/salientes` en 1 sola ruta.
  - **Razón:** Hoy el usuario no sabe si ir a `/llamadas/entrantes` o `/oficina/llamadas`. Duplicación mental.
  - **Severity:** ALTA — confusión arquitectónica explícita en spec original (sesión 1: "ambigüedad de dónde va cada acción").

- **[PROPUESTA]** Post-refactor:
  - Ruta única: `/historial/llamadas`
  - Pills de filtro: [Entrantes] [Salientes] [Campañas] [Recovery]
  - Sub-tabs contextuales: si filtro=Entrantes, mostrar pills de Leads·Citas·Pedidos

---

### 9.4–9.15 Otros `/oficina/*` (reportes, aprendizajes, investigación, documentos, contratos, plantillas, tareas-programadas, juntas, onboarding, encuestas, helpdesk, integraciones, cabildo, facturas)

**Consolidación propuesta en spec:**

| Ítem actual              | Nueva ubicación                           | Notas                                              |
|-------------------------|-------------------------------------------|----------------------------------------------------|
| `/oficina/reportes`     | `/historial/reportes`                     | Análisis histórico, no operacional diario.         |
| `/oficina/aprendizajes` | `/historial/aprendizajes`                 | Insights de patrones detectados.                   |
| `/oficina/investigacion`| `/historial/investigacion`                | Auditoría post-call, histórico.                    |
| `/oficina/documentos`   | `/administracion/recursos/documentos`     | Archivo/recurso empresarial.                       |
| `/oficina/contratos`    | `/administracion/recursos/contratos`      | Archivo/recurso empresarial.                       |
| `/oficina/plantillas`   | `/administracion/recursos/plantillas`     | Archivo/recurso empresarial.                       |
| `/oficina/tareas-prog`  | `/administracion/recursos/tareas`         | Configuración recurso, no lista diaria.            |
| `/oficina/juntas`       | `/administracion/recursos/juntas`         | Archivo/recurso empresarial.                       |
| `/oficina/onboarding`   | `/administracion/recursos/onboarding`     | Configuración recurso.                             |
| `/oficina/encuestas`    | `/administracion/recursos/encuestas`      | Configuración recurso.                             |
| `/oficina/helpdesk`     | `/bandeja?tipo=helpdesk`                  | Tickets de soporte son bandeja.                    |
| `/oficina/integraciones`| `/administracion/integraciones`           | Gestión de APIs/conectores.                        |
| `/oficina/cabildo`      | `/administracion/recursos/cabildo`        | Vertical gobierno, configuración.                  |
| `/oficina/facturas`     | `/administracion/facturacion`             | Billing, no recursos.                              |

**Oportunidades clave:**

- **[CONSOLIDACIÓN]** "Recursos de la oficina" grid launcher:
  - Propósito: agrupa 9 items de bajo uso diario (documentos, contratos, plantillas, tareas, juntas, onboarding, encuestas, cabildo, investigación).
  - **Razón:** Hoy son 9 items compitiendo en el sidebar. Usuarios rara vez necesitan todos. Un launcher grid cabe en 1 pantalla.
  - **Severity:** ALTA — sidebar bloat directo.

- **[MOVER /oficina → top-level]** "Bandeja" debe ser top-level (actualmente en `/oficina/bandeja`).
  - **Razón:** Es donde el usuario pasa el 30% del tiempo operacional. Merece 1 click, no 2.
  - **Severity:** ALTA — flujo diario.

---

## Resumen: Duplicaciones REALES Detectadas

| Concepto                   | Ubicación A                     | Ubicación B                     | Impacto   |
|----------------------------|---------------------------------|---------------------------------|-----------|
| Llamadas (log)             | `/llamadas/entrantes`           | `/oficina/llamadas` (tabs)      | **ALTA** |
| Llamadas salientes         | `/llamadas/salientes`           | `/oficina/llamadas` (tab)       | **ALTA** |
| Documentos/Contratos/etc   | `/oficina/documentos` (14 items)| Sidebar compitiendo             | **ALTA** |
| Equipo hoy                 | `/oficina/page` (widget)        | `/agentes` (full page)          | **MEDIA** |
| Atención requerida         | `/oficina/page` (panel)         | `/oficina/bandeja`              | **MEDIA** |
| Insights                   | `/portal?tab=inicio` (widget)   | `/oficina/aprendizajes`         | **MEDIA** |
| Integraciones              | `/oficina/integraciones`        | `/portal?tab=cuenta` (inline)   | **BAJA** |

---

## Impacto de Implementación (Fase 1-3 del Spec)

**Fase 1 — IA (redirecciones):**
- Crear redirects: `/llamadas/*` → `/historial/llamadas?filtro=*`
- Crear redirects: `/oficina/*` → `/administracion/recursos/*`
- No cambios en UI aún. Usuarios no se dan cuenta.

**Fase 2 — Estructura (refactor de rutas):**
- `/historial/llamadas` unificado con pills de filtro
- `/bandeja` top-level
- `/administracion/recursos` launcher grid

**Fase 3 — Densidad (simplificación UI):**
- Inicio: 7 KPIs → 3 primarios + 4 secundarios
- Mover widgets: Insights, Tu equipo

---

## Cambios que NO Hacer (Evitar Anti-Patterns)

1. **No colapsar el sidebar entero a un mega-drawer o árbol expandible** (spec dice: esconde jerarquía).
2. **No mover integraciones a launcher tiles con 2 clicks** (ya está bien ubicada).
3. **No cambiar copy** (respetar `centinelia-copy-guidelines`).
4. **No romper redirects de usuarios activos** (preservar `/llamadas/entrantes` como redirige a `/historial/llamadas?filtro=entrantes`).
5. **No duplicar permisos por subuser** (mantener pattern de `getAgentAccess` / módulos).

---

## Notas de Implementación

- **Feature flag:** `portal_v2_restructure`. Rollout gradual con org específica.
- **Redirects permanentes:** Bookmarks compartidos no deben romperse.
- **Testing:** Verificar `getAgentAccess()` sigue filtrando por permisos en nuevas rutas.
- **SEO/Analytics:** Actualizar tracking de eventos en nuevas rutas.

---

**Documento completado:** 2026-08-05
**Próximos pasos:** Resolver con Nazre sí/no por cada propuesta. Cero ambigüedad.
