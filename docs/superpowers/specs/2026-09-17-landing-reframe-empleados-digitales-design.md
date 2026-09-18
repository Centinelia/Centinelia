---
date: 2026-09-17
type: design
status: draft
owner: nazre
scope: landing pública centinelia.mx
---

# Landing reframe: capacidad on-demand vía empleados digitales

## Contexto

La landing actual quedó corta frente a lo que Centinelia vende hoy. La narrativa vigente en la mente del owner es: **"capacidad on-demand a través de automatizaciones convertidas en empleados digitales, que usan teléfono, correo y herramientas que las automatizaciones normales no pueden."**

Esa narrativa es interna. La landing habla a PyME tradicional mexicana (Tortillería Estrella, AC Proyectos, IPark, Nami AC): dueño de negocio que no sabe qué es Zapier, pero le duele contestar el teléfono, cotizar, facturar y cobrar. El copy visible traduce la narrativa a lenguaje HR: **empleados digitales que hacen tareas concretas, sin contratar**.

Adicionalmente incorpora un aprendizaje reciente de AC Proyectos: **cobrar la consultoría y automatización previa como capa separada**, no regalarla para cerrar la venta del empleado.

## Audiencia y ángulo

- **Audiencia primaria:** PyME tradicional (dueño operador, 5-50 empleados humanos, negocio con teléfono y correo activos).
- **Competidor mental del cliente:** contratar staff nuevo, o no hacer nada y seguir perdiendo llamadas. **No** Zapier ni chatbots.
- **Vocabulario visible:** "empleado digital" literal. Los meerkats se presentan con nombre + rol tipo LinkedIn.
- **Reglas duras que aplican al copy** (memoria): sin "IA/AI", sin em-dashes, sin emojis, español completo con acentos y ñ, evitar regionalismos chilangos ("te late"), coordinadores sin voz descrita como capacidad de voz.

## Estructura: híbrida (corta arriba, profunda abajo)

10 secciones, dos ritmos: los primeros 3 pliegues estilo Linear (hero + prueba + elenco), el resto tipo página de ventas expandida para quien scrollea.

---

### Sección 1 — Hero

**Copy:**
```
Contesta el teléfono. Cotiza.
Factura. Cobra. Agenda.

Sin contratar a nadie.

Empleados digitales que empiezan
a trabajar el próximo lunes.

[ Deja que Nia te llame ]   [ Conoce al equipo ]
```

**Diseño:**
- Fondo limpio, morado Centinelia #6C3BFF como acento.
- Foto pequeña de Nia en la esquina como firma, no como visual dominante.
- Micro-línea encima del headline (kicker): "Empleados digitales para tu negocio".
- CTA primario abre form callback inline en la siguiente sección; CTA secundario hace scroll a elenco.
- Sin video ni gráfico grande. El "wow" está en el callback abajo, no en el hero.

---

### Sección 2 — Prueba en vivo (callback)

**Copy:**
```
En menos de 60 segundos, uno de nuestros
empleados digitales te llama.

[ Tu teléfono          ]   [ Tu tipo de negocio ▾ ]
[ Quiero que me llame Nia ahora ]

☐ Autorizo que Centinelia me contacte por teléfono.

Vas a hablar con Nia. Va a durar unos 2 minutos.
Te va a preguntar sobre tu negocio para mostrarte
cómo trabajaría contigo.
```

**Diseño y comportamiento:**
- Dropdown de industria enruta al meerkat que llama:
  - Tortillería / abarrotes / reparto → Nia
  - Constructora / obra → Nova o Nia (default Nia si Nova no aplica)
  - Despacho contable / facturación → Nala
  - Servicios profesionales / consultoría → Nia
  - Otro → Nia (default)
- Micro-señal de vida opcional debajo del form: "última llamada hace X min" — **solo si hay dato real**, si no, se omite. Cero copy falso.

**Guardrails técnicos (no negociables):**

1. **Fallback si el cron o pipeline falla:** memoria `feedback_cron_critico_ventana_catchup` documenta que Vercel tiene ~25% miss-rate en hourly. El callback aquí no puede depender de un cron hourly. Debe ejecutarse:
   - Idealmente síncrono desde el submit (edge function que llama a Vapi outbound directo).
   - Si asíncrono, con verificación a los 90 segundos: si no salió la llamada, mostrar mensaje "Se nos complicó llamarte automático. Te llamamos en menos de 30 minutos desde nuestro equipo" + notificación WhatsApp/correo a Nazre.
2. **Rate limit / anti-abuse:** OTP por SMS antes de disparar la llamada. Sin OTP, algún troll puede meter 100 números y agotar el pool de minutos de Centinelia. Alternativa mínima: rate limit por IP + captcha invisible + verificación de país MX en el número.
3. **Consentimiento LFPDPPP:** checkbox visible + link a aviso de privacidad. Sin marcar, el botón queda disabled (respetando `feedback_hide_over_disable` — o mejor, ocultar el botón hasta que se marque).
4. **Guión pre-establecido de Nia:** ya existe personalidad en `meerkat-roles.ts`. Necesita variante específica "demo de landing" que:
   - Se presenta como empleada digital de Centinelia (no del negocio del usuario).
   - Pregunta a qué se dedica el negocio.
   - Explica cómo trabajaría con él.
   - Ofrece agendar una llamada con humano de Centinelia si hay interés.
   - Duración objetivo: 2-3 minutos.
5. **Consumo de minutos:** cada callback cobra al pool interno de Centinelia (memoria `feedback_pool_accuracy_top_priority`: todo cobra, incluso demo). Presupuesto/cap por día para evitar sorpresas de $$.
6. **Horario:** si el submit ocurre fuera de horario razonable (ej. 11pm), en vez de llamar de madrugada, agendar callback para el siguiente día laboral 9am y decirlo explícito en el UI.

---

### Sección 3 — Elenco

**Copy:**
```
Este es tu nuevo equipo.
Cada empleado se especializa en su función.

[Grid con 8-10 meerkats visibles, resto en expand]

[ Ver todo el equipo ]
```

**Contenido real** (fuente: `src/lib/portal/meerkat-roles.ts`, 13 roles públicos):

| Meerkat | Rol | Canales |
|---|---|---|
| Nia | Recepcionista | voz + chat + correo |
| Noah | Ventas | voz + chat + correo + outbound |
| Nara | Coordinadora (gobierno) | voz + chat + correo |
| Nico | Cobranza | voz + chat + correo + outbound |
| Naia | Recursos Humanos | voz + chat + correo |
| Nelia | Atención al cliente | voz + chat + correo + outbound |
| Neo | Operaciones (helpdesk) | voz + chat + correo |
| Nova | Centro de Coordinación (despacho) | voz + chat + correo |
| Nala | Facturista | chat + correo |
| Nalú | Analista de Tesorería (financiero) | chat + correo |
| Nami | Inventarios | voz + chat + correo |
| Nox | Director (coordinador) | chat + correo |
| Niva | Directora (coordinadora) | chat + correo |

**Exclusiones explícitas:**
- Neka (facturista interna Centinelia): `INTERNAL_MEERKAT_IDS` en el código. No se muestra públicamente.
- Nash (clon operativo del owner): también interno.
- Navi / Navi Agencia (social/creativo): construido pero behind feature flag `social_publishing`, Meta App Review pendiente. No se muestra hasta que Meta apruebe.

**Diseño:**
- Cada card: foto meerkat, nombre grande, rol como "cargo laboral", 2-3 tareas concretas (no features). Click expande inline o lleva a `/empleados/<slug>`.
- Cards de coordinadores (Nox, Niva) tienen badge sutil "Sin llamadas — coordina al equipo" para explicar por qué no aparece voz. Alternativa: agruparlos visualmente separado.
- Visibles arriba (5-8 más comunes según industria más frecuente): Nia, Noah, Nala, Nova, Nelia, Nox, más 1-2. El resto detrás de "Ver todo el equipo".
- **No** hay tarjeta "Otro rol" en este grid — eso queda en la franja de pricing.

---

### Sección 4 — Cómo funciona

**Copy:**
```
1. Eliges qué empleado necesitas.
2. En una llamada de 30 minutos lo capacitamos con tu info.
3. Empieza a trabajar el próximo lunes.

Sin instalar nada. Sin cambiar tus sistemas.
```

**Diseño:** 3 columnas horizontales, ícono simple por paso, una línea por paso. Cero texto largo.

---

### Sección 5 — Casos reales

**Contenido:**
- **Tortillería Estrella** — logo, foto, métrica principal ("Nia contesta el 100% de las llamadas") + una línea de contexto.
- **AC Proyectos / IPark / otro** — cuando haya permiso escrito del cliente.

**Diseño:** bloques grandes horizontales, no cards apretadas. Foto real del negocio importa más que la métrica en tamaño visual. Cero testimonios largos en v1 (agregar cuando existan).

---

### Sección 6 — Comparativa

**Copy:**
```
Un empleado humano vs. un empleado digital
```

**Tabla (3 columnas):**

| | Contratar humano | Empleado digital Centinelia |
|---|---|---|
| Arranca en | 2 a 4 semanas | El siguiente lunes |
| Sueldo mensual | Desde $12,000 | Desde $2,997 |
| IMSS y prestaciones | +30% del sueldo | Incluido en tu plan |
| Aguinaldo | 15 días | No aplica |
| Vacaciones | Sí (y aumentan cada año) | No aplica |
| Utilidades (PTU) | Sí | No aplica |
| Faltas y llegadas tarde | Sí | Nunca falta |
| Capacitación | Semanas | 30 minutos |
| Trabaja 24/7 | No | Sí |
| Contesta teléfono | Sí | Sí |
| Manda correos | Sí | Sí |
| Usa tus sistemas | Después de entrenarlo | Desde el día 1 |
| Cotiza y factura | Sí | Sí |

**Notas de copy:**
- Cero mención a "IA", "AI", "automatización", "chatbot", "GPT". Solo funciones y comparación laboral concreta.
- El anclaje de $12,000 es realista para MTY, ajustar según data real del segmento.
- La comparación **no se hace contra chatbot ni contra Zapier** — la memoria interna diría "eso también aplica" pero el visitor PyME no está pensando en esos productos. Comparar contra ellos confunde. La comparación laboral es la que vende.

**Diseño:**
- Tabla limpia con dos columnas, no tres. Chatbot no es competidor real en la cabeza del cliente.
- Filas coloreadas sutilmente donde Centinelia gana (mayoría).
- Debajo, una línea: "Un empleado humano en tu negocio te cuesta al año, con carga laboral completa, entre $180,000 y $350,000. Un empleado digital de Centinelia arranca desde $35,964 al año."

---

### Sección 7 — Integraciones

**Copy:**
```
Se conecta con lo que ya usas.
```

**Grid de logos** (solo lo que el cliente conecta desde su lado):

- Gmail / Google Workspace
- Outlook / Microsoft 365
- Google Sheets
- Google Drive
- Dropbox
- OneDrive
- QuickBooks Online
- Facturama
- ContPAQi
- InvoiceOne
- Solución Factible
- Notion

**Exclusiones explícitas:**
- **WhatsApp NO va aquí.** Memoria `feedback_no_whatsapp` + `feedback_wa_meerkat_outbound_descartado`: el meerkat no manda WhatsApp saliente al cliente final del cliente. WhatsApp puede aparecer como CTA de contacto hacia Centinelia (footer, no aquí).
- **Vapi, Supabase, Anthropic NO van aquí.** Son infraestructura de Centinelia, no cosas que el cliente conecta.
- **Twilio** tampoco — es infra.

**Diseño:** grid neutro, logos gris/mono. "+ más integraciones" abajo con link a página con el catálogo completo si existe.

---

### Sección 8 — Pricing

**Copy:**
```
Un plan. Tres tamaños. Tres sabores.
Elige lo que necesita tu negocio.
```

**Tabla real** (fuente: `src/lib/billing/plans.ts`, `JORNADA_CONFIG`):

| | Media Jornada | Jornada Completa | Alta Demanda |
|---|---|---|---|
| **Precio mensual** | $2,997 + IVA | $5,994 + IVA | $11,988 + IVA |
| **Sabor Combinado** (default) | 250 min + 300 tareas | 500 min + 600 tareas | 1,000 min + 1,200 tareas |
| **Sabor Voz** | 500 min | 900 min | 1,800 min |
| **Sabor Tareas** | 500 tareas | 1,200 tareas | 3,000 tareas |
| CTA | [ Empezar ] | [ Empezar ] | [ Empezar ] |

**Elementos alrededor:**
- Debajo del CTA de cada tier, letra menor: "Incluye una sola incorporación de $14,990 + IVA."
- Al pie de la tabla, nota gris pequeña: "Minutos adicionales $12 MXN por minuto. Se compran desde el portal en cualquier momento."
- Los coordinadores (Nox, Niva) usan los mismos tres tiers pero solo en sabor Tareas. Una línea explicativa: "Nox y Niva no toman llamadas, solo coordinan al equipo. Usan el plan en sabor Tareas."

**Franja "empleado a la medida" (debajo de la tabla, decisión aprobada en brainstorm):**

```
¿El rol que necesita tu negocio no está en el catálogo?

Diseñamos empleados digitales a la medida de tu operación.
Empezamos con un diagnóstico de tu negocio, automatizamos
lo que necesita quedar listo antes, y luego incorporamos
al empleado que tu equipo va a usar.

Consultoría y automatización desde $60,000 + IVA.
Después, el empleado que diseñamos entra en un plan del
catálogo o en cotización empresarial.

[ Agenda tu diagnóstico ]
```

**Notas críticas de esta franja:**
- Refleja el aprendizaje de AC Proyectos: **cobrar la consultoría y automatización como capa separada**, no regalarlas.
- **$60,000 + IVA es el piso.** Piso defendible: equivale a ~$3,000 USD, ~2-4 días de consultoría empaquetada, ~1-2 semanas de trabajo si va más profundo. Contra el setup del catálogo ($14,990) da múltiplo 4x — justifica la diferencia por el trabajo real detrás del empleado a la medida. Proyectos reales pueden ir a $150k-$250k+ según scope; el diagnóstico cierra el número real con el prospect.
- **Lo que $60,000 incluye**: diagnóstico de operación + automatización + integración de sistemas del cliente + diseño del rol del empleado a la medida.
- **Lo que $60,000 NO incluye**: setup del empleado ($14,990 + IVA aparte, o cotizado si es fully custom) ni el mensual (plan del catálogo o cotización empresarial). Esto debe quedar explícito en el diagnóstico para no repetir el patrón AC de trabajar de más pensando que la venta del empleado cubre el desarrollo previo.
- El CTA no lleva a callback automático — lleva a agenda con Nazre o al form de "cotizar" para negocios que necesitan diagnóstico. El diagnóstico inicial (llamada de descubrimiento) puede ser gratis; el trabajo formal empieza cuando se firma cotización.

---

### Sección 9 — FAQ

**Preguntas obligatorias:**

- **¿Esto es un chatbot?** — No. Los empleados digitales de Centinelia contestan el teléfono, mandan correos y usan tus sistemas. Un chatbot solo responde texto en una ventana.
- **¿Y si se equivoca? ¿Quién revisa?** — Cada acción del empleado queda auditada. Tú ves todo lo que hizo en tu portal y puedes corregirlo. Los coordinadores (Nox, Niva) revisan al equipo automáticamente.
- **¿Cuánto tarda en aprender mi negocio?** — 30 minutos de capacitación con nosotros y una semana de ajustes finos.
- **¿Habla en español mexicano?** — Sí, todos los empleados hablan español de México, con acentos y modismos naturales.
- **¿Necesito cambiar mi correo o mi teléfono?** — No. El empleado se conecta a los que ya tienes.
- **¿Manda WhatsApp?** — Hoy no. Los empleados trabajan por teléfono, chat de portal y correo. WhatsApp para negocio no está en el producto hoy.
- **¿Y si necesito un rol que no está en el catálogo?** — Lo diseñamos. Empezamos con un diagnóstico de tu operación, cobramos la consultoría y automatización previa, y luego incorporamos al empleado. (link a franja pricing)
- **¿Puedo probar antes de pagar?** — Sí. Deja tu teléfono en la parte de arriba y Nia te llama en 60 segundos.
- **¿Qué pasa si crece mi negocio y necesito más empleados?** — Contratas más. Cada empleado tiene su propio plan.
- **¿Dónde guardan mis datos?** — En Supabase (nube), México/US. Con encripción en tránsito y en reposo. Aviso de privacidad completo en `centinelia.mx/privacidad`.

---

### Sección 10 — CTA final

**Copy:**
```
Contrata a tu primer empleado digital hoy.

[ Deja que Nia te llame ]   [ Agenda una llamada humana ]
```

- Botón primario reingresa al callback (segunda oportunidad).
- Botón secundario abre calendario con Nazre / equipo de ventas para quien prefiere hablar con humano antes de dejar su teléfono.
- Debajo, footer con link a WhatsApp de contacto hacia Centinelia (opcional, es distinto al canal del meerkat).

---

## Fuera de scope de esta v1

- Reestructurar la home actual completa. Este spec cubre solo la landing pública principal (`centinelia.mx`).
- Rediseño visual/estética completa. Se mantiene la identidad Centinelia actual, solo se cambia estructura + copy.
- Landing pages secundarias por industria (`/tortillerias`, `/despachos`, `/gobierno`). Pueden derivarse después con los meerkats verticalizados (Nara para gobierno, Nalú para financiero, Nova para operaciones/despacho).
- Landing en inglés.
- Sección de blog / recursos.

## Riesgos y consideraciones

1. **Callback pipeline es carga real.** Si arriba de cierto tráfico rompe el pool de minutos o Vapi, la landing daña la marca. Necesita monitoreo dedicado y cap diario.
2. **La comparativa contra "contratar humano" tiene que ser honesta.** El anclaje $12,000 puede sentirse bajo o alto según industria. Validar con Nazre antes de publicar.
3. **La franja "empleado a la medida" abre puerta a leads que no encajan con catálogo.** El piso de $60,000 + IVA ya filtra a prospects serios, pero el tiempo de diagnóstico sigue siendo un costo real. Considerar form previo antes del calendario (industria, tamaño, si acepta rango $60k-$250k+). Si el prospect se espanta con $60k, no era prospect real y filtró bien.
4. **El setup fee de $14,990 puede ser barrera de conversión.** Está en letra menor a propósito, pero el visitor lo va a notar. Alternativa a considerar en v2: setup 50% al inicio + 50% al primer mes.
5. **Riesgo específico del piso $60k.** Si el prospect real necesita $150k+ pero llega ancla en $60k, la negociación se vuelve difícil. Mitigación: en el diagnóstico, cotizar por scope (no por hora) con desglose claro (fases con entregables), y comunicar temprano que "$60,000 es el proyecto mínimo, tu operación probablemente cae en $X-$Y".

## Métricas de éxito (evals a proponer antes del ship)

- Tasa de clic en "Deja que Nia te llame" (baseline actual desconocido).
- Tasa de completion del callback (llamada exitosa vs abandonos).
- Tasa de conversión de llamada exitosa a agendar demo con humano.
- Tasa de leads que llegan por la franja "empleado a la medida" vs catálogo estándar.

## Siguiente paso

Al aprobar este spec, invocar `superpowers:writing-plans` para descomponer en tareas de implementación (copy final por sección, componentes React, integración pipeline Vapi para callback, migración pricing table, etc.).
