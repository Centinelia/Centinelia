# Runbook de provisionamiento — IPark Estacionamientos (demo)

Este runbook es para Nazre. Instrucciones paso a paso para dejar la org demo lista antes de la 2ª llamada con la asistente de Bichara. Estimado: **30-45 min** siguiendo el runbook exacto.

## Preflight (5 min)

- [ ] Estás logueado en admin de Centinelia con la cookie `Centinelia_admin` puesta
- [ ] El adapter InvoiceOne ya está desplegado (verificar `PROVIDER_REGISTRY` en `src/lib/invoicing/registry.ts` incluye `invoiceone`)
- [ ] Tienes a la mano `01-nala-ipark-prompt.md` para pegar en el KB del rol
- [ ] Tienes a la mano `02-fixtures-correos.md` para cargar los 10 correos

## Paso 1 — Crear la org y Nala (15 min)

En `/admin/agentes/nuevo`:

- **portal_email:** `ipark-demo@centinelia.mx`
- **Business name:** `IPark Estacionamientos (Demo)`
- **Business description:** `Cadena de estacionamientos de estancia larga en aeropuertos de México. Cliente prospecto vía Bernardo Bichara. Demo para 2ª llamada.`
- **Industry:** `estacionamientos` (o el más cercano — `servicios` funciona si no existe)
- **Rol del meerkat:** `nala`
- **Nombre agente:** `Nala`
- **KB del negocio:** pegar el bloque a continuación
- **KB del rol / prompt extra:** pegar el contenido completo de `01-nala-ipark-prompt.md` (bloque "Bloque a inyectar en system prompt")
- **Voice:** no relevante (Nala no habla por voz en este demo)
- **Features:** por default (email pipeline habilitado, voice pipeline puede quedar off)

### KB del negocio (pegar tal cual)

```
IPark es una cadena de estacionamientos de estancia larga ubicados en aeropuertos de México. Confirmado en operación: aeropuerto de Monterrey (MTY). Otros aeropuertos por confirmar.

Los clientes son mayoritariamente viajeros de negocios que dejan su auto durante viajes de trabajo (días o semanas) y pagan a la salida por los días acumulados. Alta proporción requiere CFDI para deducir el estacionamiento como gasto de viaje.

Volumen fiscal actual: aproximadamente 35,000 CFDIs/mes en toda la red. La mayoría se timbra sin intervención humana:
- Clientes recurrentes con facturación automática (tarjeta empresarial + convenio).
- Viajeros que usan el portal público de autoservicio.

El punto donde entra Centinelia: aproximadamente 1,000 correos/mes llegan al inbox de facturación porque el cliente no supo, no pudo, o prefirió no usar el autoservicio. Hoy los resuelve un equipo humano en Monterrey.

Stack fiscal:
- PAC: InvoiceOne (EasyOne API). Cuenta bajo el RFC de IPark.
- CSD: cargado en InvoiceOne (no en Centinelia).
- Régimen fiscal emisor: 601 Personas Morales Régimen General.

Nala se conecta al inbox de facturación (via reenvío) y opera bajo la cuenta InvoiceOne de IPark cuando timbra.

Contacto humano para escalación en el demo: nazre20@gmail.com (Nazre). En operación real será una persona del equipo de IPark asignada por el cliente.
```

## Paso 2 — Configurar el PAC InvoiceOne (5 min)

En `/portal/{TOKEN}/oficina/integraciones/facturacion` (con el token del portal recién creado):

- **PAC:** InvoiceOne (EasyOne). Si no aparece en el catálogo (está `enabled: false`), tienes 2 opciones:
  1. Flippear temporalmente `enabled: true` en `PAC_CATALOG` de `FacturacionSection.tsx` (git no lo commiteas)
  2. O actualizar directo en Supabase la columna `organizations.invoicing_provider = 'invoiceone'` para esta org

- **Credenciales:**
  - usuario: `demo`
  - password: `demo`
  - Esto activa `isMockMode` en `src/lib/invoicing/invoiceone/mock.ts` → adapter retorna respuestas plausibles sin llamar InvoiceOne.

- **Datos fiscales del emisor** (para que el CFDI mock salga realista):
  - RFC: `IPA200101ABC` (RFC ficticio, no importa que no exista)
  - Razón social: `IPARK ESTACIONAMIENTOS SA DE CV`
  - Régimen fiscal: `601`
  - Lugar de expedición (CP): `66600` (aeropuerto MTY)

- **Modo:** test (checkbox activo)

### Valores fijos por negocio (defaults del `CfdiInput` para IPark)

Estos valores NO los extrae Nala del correo del cliente. Se setean una sola vez al provisionar la org, y el pipeline los inyecta automáticamente al armar el `CfdiInput` antes de mandarlo al PAC (o al TXT del Conector C1).

Ubicación recomendada: columna `business_defaults` (JSON) de `organizations`, o en el `agent.business_context` si no hay columna dedicada. Si se agrega como columna nueva, nombre sugerido: `invoicing_defaults`.

```json
{
  "moneda": "MXN",
  "metodo_pago_default": "PUE",
  "exportacion": "01",
  "tipo_comprobante_default": "I",
  "concepto_defaults": {
    "clave_prod_serv": "90111500",
    "clave_unidad": "E48",
    "objeto_imp": "02"
  },
  "iva_rate": 0.16,
  "forma_pago_fallback": "01",
  "serie_default": "CEN",
  "publico_en_general": {
    "rfc": "XAXX010101000",
    "razon_social": "PUBLICO EN GENERAL",
    "regimen_fiscal": "616",
    "uso_cfdi": "S01"
  },
  "extranjero_sin_rfc_mx": {
    "rfc": "XEXX010101000",
    "regimen_fiscal": "616",
    "uso_cfdi": "S01"
  }
}
```

Justificación por valor:
- **moneda MXN**: IPark cobra en pesos siempre.
- **metodo_pago PUE**: el cliente paga a la salida en exhibición única. Nunca PPD en estacionamientos.
- **exportacion 01**: no es operación de exportación (campo nuevo de CFDI 4.0, obligatorio).
- **tipo_comprobante I**: factura de ingreso. Nala puede sobrescribir a E (egreso) para notas de crédito o P (pago) para REP si el caso lo justifica.
- **clave_prod_serv 90111500**: código SAT para "Servicios de estacionamiento".
- **clave_unidad E48**: código SAT para "Unidad de servicio".
- **objeto_imp 02**: el servicio sí es objeto de impuesto (campo nuevo de CFDI 4.0).
- **iva_rate 0.16**: tasa estándar. Si en el futuro IPark opera en franja fronteriza, cambiar a 0.08 por sucursal.
- **forma_pago_fallback 01**: default si el sistema de IPark no entrega la forma de pago real para un folio dado.
- **serie_default CEN**: Centinelia. Reservada por IPark para trazabilidad de los CFDIs que emite Nala.

El `txt-builder.ts` del adapter C1 leerá estos defaults al armar cada TXT. Para orgs no-IPark que usen InvoiceOne C1 a futuro, los defaults serán distintos (otro tipo de negocio = otra clave_prod_serv y clave_unidad).

## Paso 3 — Seed de la bandeja con los 16 correos (20 min)

Opción A — vía SQL directo (más rápido si tienes acceso):

Ejecuta este SQL en Supabase (reemplaza `<AGENT_ID>` con el `id` del voice_agent Nala creado):

```sql
-- ipark-demo: seed inbox con 16 correos fixture
-- Fuente: demos/ipark/02-fixtures-correos.md

INSERT INTO ops_inbox (agent_id, source, email_from, email_subject, email_body, category, status, action_required, item_type, created_at)
VALUES
  -- #1 Facturación completa
  ('<AGENT_ID>', 'demo_seed', 'laura.morales@grupomex.com.mx', 'Solicitud de factura estancia MTY',
   'Hola, buen día. Estuve en IPark del aeropuerto de Monterrey del 3 al 6 de septiembre. Anexo el ticket de salida (folio 2087341). Le pido de favor emitir factura con los siguientes datos: RFC: GME150312J78. Razón social: Grupo Mex Consultores SC. Régimen fiscal: 601. Uso CFDI: G03. Código postal: 66220. Gracias, quedo pendiente. Saludos, Laura Morales, Grupo Mex Consultores',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '4 hours'),

  -- #2 Facturación incompleta
  ('<AGENT_ID>', 'demo_seed', 'hector.villareal@outlook.com', 'Factura',
   'Buen día, necesito la factura de mi estancia del fin de semana pasado. Folio del boleto: 2091008. Datos: RFC: VIRH880203MN2. Nombre: Héctor Villarreal. Gracias.',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '6 hours'),

  -- #3 RFC mal escrito
  ('<AGENT_ID>', 'demo_seed', 'mfernandez@bufete-mx.mx', 'Facturación estacionamiento',
   'Buenas tardes, adjunto ticket para facturar. Datos: RFC: BUM-091510-XL3. Razón social: Bufete Fernández y Asociados. Régimen: 601. Uso: G03. CP: 64000. Folio boleto: 2098772. Saludos, M. Fernández',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '10 hours'),

  -- #4 En inglés
  ('<AGENT_ID>', 'demo_seed', 'robert.chen@meridian-partners.com', 'Tax invoice for parking',
   'Hi, I parked at IPark MTY airport from Aug 28 to Sep 2 (ticket folio 2081204). Could you please issue the tax invoice (CFDI) with the following details: RFC: MEP180415UR9. Nombre / Legal name: Meridian Partners Mexico SA de CV. Régimen fiscal: 601. Uso CFDI: G03. Código postal: 06500. Thanks, Robert Chen',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '14 hours'),

  -- #5 Boleto perdido, mes vencido
  ('<AGENT_ID>', 'demo_seed', 'patricia.moreno@gmail.com', 'Ayuda con factura',
   'Hola, estuve en su estacionamiento de MTY hace como 6 semanas más o menos, dejé mi carro para un viaje a Europa. Pagué como $2,400 pesos. Perdí el boleto que me dieron pero necesito la factura para mi contabilidad. Cómo lo hacemos? Datos: RFC MOPP810725TL2, régimen 605, uso G03, CP 66240. Gracias.',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '18 hours'),

  -- #6 Queja operativa (IGNORAR)
  ('<AGENT_ID>', 'demo_seed', 'arturo.gomez@yahoo.com.mx', 'Rayón en mi carro',
   'Buenas tardes, ayer recogí mi vehículo del IPark Monterrey (boleto 2099102) y al llegar a mi casa noté un rayón en la puerta del copiloto que definitivamente no estaba cuando dejé el auto. Necesito reportar esto formalmente y saber qué proceso siguen para daños en el estacionamiento. Adjunto foto del daño. Espero pronta respuesta. Arturo Gómez',
   'otro', 'pending', true, 'email', NOW() - INTERVAL '20 hours'),

  -- #7 Marketing entrante (IGNORAR)
  ('<AGENT_ID>', 'demo_seed', 'ventas@mejoresprecios-limpieza.com', 'Cotización servicio de limpieza para su estacionamiento',
   'Estimados, somos una empresa especializada en limpieza y mantenimiento de estacionamientos. Nos gustaría enviarles una propuesta comercial adaptada a las necesidades específicas de IPark. Adjunto brochure y quedamos a sus órdenes para agendar una cita. Saludos cordiales, Rafael Ochoa, Ventas',
   'spam', 'pending', false, 'email', NOW() - INTERVAL '22 hours'),

  -- #8 Notificación automática (IGNORAR)
  ('<AGENT_ID>', 'demo_seed', 'notificaciones@bancomer.com', 'Estado de cuenta disponible',
   'Estimado cliente, le informamos que su estado de cuenta del mes de agosto ya se encuentra disponible en su portal de Banca en Línea. Ingrese a bbva.mx para consultarlo. Este es un mensaje automático, favor de no responder. BBVA México',
   'notificacion', 'pending', false, 'email', NOW() - INTERVAL '23 hours'),

  -- #9 Re-envío de factura
  ('<AGENT_ID>', 'demo_seed', 'contabilidad@techmex.mx', 'Re-envío de factura extraviada',
   'Hola equipo, el mes pasado nos generaron una factura por el estacionamiento del director general (RFC TME140628PQ1). Necesitamos que nos la reenvíen porque no la encontramos en nuestro sistema. El folio del boleto fue el 2074511. Gracias, Contabilidad TechMex',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '28 hours'),

  -- #10 Corrección de factura
  ('<AGENT_ID>', 'demo_seed', 'admin@constructoralm.com.mx', 'Error en factura emitida',
   'Buen día, la factura que nos generaron ayer (UUID F8A7C2B1-4E9D-4A2F-9C1B-88AA33BB44CC) tiene mal el régimen fiscal — quedó como 601 y debe ser 603. Pueden corregirla? Saludos, Admin Constructora LM',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '30 hours'),

  -- #11 Público en general (sin RFC)
  ('<AGENT_ID>', 'demo_seed', 'jose.hernandez@gmail.com', 'Factura por mi estacionamiento',
   'Buen día, dejé mi auto en IPark MTY la semana pasada y quiero pedir mi factura. No tengo RFC propio, soy persona física sin actividad empresarial. Pueden hacerla a nombre de público en general? Folio del boleto: 2104892. Gracias. José Hernández',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '32 hours'),

  -- #12 Nota de crédito (cliente dice que le cobraron de más)
  ('<AGENT_ID>', 'demo_seed', 'patricia.luna@consultoresjl.com', 'Error de cobro en estancia MTY',
   'Buenas tardes, el 20 de septiembre dejé mi auto en IPark MTY y lo recogí el 23 (3 días). Al salir me cobraron por 5 días cuando solo fueron 3. Ya tengo la factura emitida (UUID 4F2E8A1B-9D3C-4A7F-B2E1-77CC88DD99EE) por el monto incorrecto. Necesito que me emitan la nota de crédito por los 2 días de más y me reembolsen la diferencia. Datos fiscales: RFC CJL180815KS4, razón social Consultores JL SA de CV, régimen 601, uso G03, CP 66220. Quedo pendiente. Patricia Luna',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '34 hours'),

  -- #13 Múltiples boletos en el mismo correo
  ('<AGENT_ID>', 'demo_seed', 'tesoreria@grupoindustrial.mx', 'Facturación consolidada 3 estancias septiembre',
   'Hola, nuestro director tuvo 3 viajes en septiembre y necesitamos facturar las 3 estancias en IPark MTY. Folios: 2089115, 2093440, 2098772. Fechas aproximadas: 1-3 sept, 10-12 sept, 22-25 sept. Datos para los 3 CFDIs: RFC GIN150820RM3, razón social Grupo Industrial del Norte SA de CV, régimen 601, uso G03, CP 64000. Pueden enviarlas por separado o en una sola si es posible? Gracias. Tesorería',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '36 hours'),

  -- #14 Asistente ejecutiva (correo de entrega distinto)
  ('<AGENT_ID>', 'demo_seed', 'ana.rodriguez@grupomex.com.mx', 'Factura para el Lic. Mendoza',
   'Buenas tardes, soy la asistente del Lic. Carlos Mendoza. Él viajó la semana pasada y dejó su auto en IPark MTY (folio 2101223). Les pido de favor que la factura la envíen directamente a él al correo cmendoza@grupomex.com.mx. A mí me pueden poner en copia. Datos fiscales (de la empresa): RFC GME150312J78, razón social Grupo Mex Consultores SC, régimen 601, uso G03, CP 66220. Gracias. Ana Rodríguez, Asistente Dirección General',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '38 hours'),

  -- #15 Cliente escribió antes del pago
  ('<AGENT_ID>', 'demo_seed', 'fernando.cantu@startupmx.io', 'Factura próxima estancia',
   'Hola, buenas tardes. Estoy en el aeropuerto de Monterrey ahora mismo, acabo de dejar mi auto en IPark para un viaje a Guadalajara. Regreso el jueves. Quiero adelantarles los datos para que me manden la factura directo cuando regrese y pague. Boleto: 2110887 (acabo de entrar). RFC CAFE880912TY5, razón social Fernando Cantú (persona física), régimen 612, uso G03, CP 66260. Gracias. Fernando',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '40 hours'),

  -- #16 Correo duplicado (dedup esperado — mismo folio que #1)
  ('<AGENT_ID>', 'demo_seed', 'laura.morales@grupomex.com.mx', 'Re: Solicitud de factura estancia MTY',
   'Hola, hace unas horas les pedí la factura por mi estancia (del 3 al 6 de septiembre, folio 2087341) con los datos de Grupo Mex Consultores. Pueden confirmar si ya quedó? No he recibido el XML. Gracias, Laura',
   'factura', 'pending', true, 'email', NOW() - INTERVAL '42 hours');
```

Opción B — vía admin UI si existe endpoint de seeding: no hay uno construido. Recomendado: SQL directo arriba.

## Paso 4 — Configurar escalación al humano (2 min)

En `/portal/{TOKEN}/oficina/equipo` (o donde configures directorio):

- Agregar contacto humano de escalación:
  - Nombre: `Nazre (escalación demo)`
  - Email: `centinelia.dev@gmail.com`
  - Rol: `facturacion_supervisor`
  - Es este el destino de `pedir_a_humano` cuando Nala escale.

## Paso 5 — Verificación pre-demo (5 min)

Antes de la llamada:

- [ ] Log in al portal de IPark demo, ir a `/portal/{TOKEN}/oficina/bandeja`
- [ ] Confirmar que los 16 correos aparecen listados
- [ ] Correr manual (o esperar al cron `email-runner`) para que Nala procese la bandeja
- [ ] Verificar visualmente que:
  - 11 correos de facturación tienen decisión: procesar / responder / escalar según fixture
  - 5 correos (queja/marketing/notificaciones) tienen decisión: skipped / ignorar
- [ ] Abrir uno de los procesados (Correo #1 Grupo Mex) y verificar que el "timbrado" mock funciona: UUID generado, XML válido, PDF renderizado
- [ ] Verificar que el correo #16 (duplicado de #1) NO vuelve a timbrar — detecta el folio ya procesado y responde con el UUID original
- [ ] Verificar que el correo #11 (público en general) aplica XAXX010101000 + S01 + 616 correctamente
- [ ] Verificar que el correo #15 (pre-pago) NO timbra y queda marcado como "pendiente de pago"

Si algo falla, arreglarlo antes de la llamada. Si todo pasa, estás listo.

## Reset entre ensayos (2 min)

Cuando quieras correr la demo de nuevo desde cero (pre-cliente):

```sql
-- Elimina ops_inbox del demo y re-siembra
DELETE FROM ops_inbox WHERE agent_id = '<AGENT_ID>' AND source = 'demo_seed';
-- Volver a correr el INSERT del Paso 3
```

Los CFDIs mock generados durante ensayos no persisten en tablas fiscales (adapter mock no escribe a `invoices_emitted` — verificar si aplica en tu setup).

## Después del cliente (si se cierra)

Cuando IPark firme el POC:

1. Cambiar la org demo → org real: renombrar de `IPark Estacionamientos (Demo)` a `IPark Estacionamientos`, `portal_email` a `facturacion@ipark.com.mx` (o el email real que ellos usen).
2. Reemplazar credenciales InvoiceOne mock (`demo/demo`) por las credenciales reales de sandbox que IPark comparta.
3. Cargar el CSD real de IPark en InvoiceOne (side of InvoiceOne, no de Centinelia).
4. Activar el reenvío del inbox real de facturación de IPark hacia el email `ipark-facturacion@inbox.centinelia.mx` (o el que tengas configurado).
5. Marcar `PAC_CATALOG` entry de `invoiceone` como `enabled: true`.
6. Correr 5-10 tests de humo end-to-end en sandbox antes de flippear a prod.
7. Deprecar/borrar la org demo `ipark-demo@centinelia.mx`.
