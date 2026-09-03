# Contalink Research — 2026-09-03

Research delegado a research-agent para decidir alcance del adapter Contalink de cara a la cita 15-sept con Miguel Guajardo (GAC).

## Veredicto

**Adapter Contalink es factible con alcance MEDIO.** Hay API pública (API Key por empresa) que cubre pólizas, CFDIs y balanza. **No expone timbrado de nómina, no tiene webhooks, y la contratación es por-RFC** — con 65 clientes de GAC eso son 65 API Keys separadas.

## Qué expone la API

**SÍ (confirmado):**
- Pólizas manuales: crear / consultar / editar / eliminar
- CFDIs recibidos y emitidos: listar filtrado por tipo, RFC, fechas
- Upload masivo de XMLs con procesamiento asíncrono + URL de status
- Validación de status CFDI (activo, cancelado, pendiente)
- Balanza de comprobación entre fechas
- Saldos de cuenta a fecha
- Movimientos bancarios (depósitos/retiros)
- Registro de pagos a facturas (conciliación)

**NO expone (o no documentado):**
- Timbrado de nómina vía API — módulo existe pero solo por UI
- Webhooks
- Alta de clientes/proveedores
- Emisión CFDI 4.0 (solo consulta y upload de XMLs ya timbrados externos)
- Rate limits públicos
- OpenAPI spec / Postman collection pública

## Features nativas de Contalink que compiten con Nala/Niva

Contalink ya hace out-of-the-box:
- Descarga automática CFDIs desde SAT
- Auto-clasificación ingresos/gastos/nómina
- Auto-conciliación bancaria
- Envío automático DIOT al SAT
- **Timbrado ilimitado de nómina** (incluido en Start $590 y Pro $790 MXN/mes)
- Contabilidad electrónica lista para SAT
- App móvil para el contador
- Reportes financieros nativos

## Dónde SÍ agregamos valor (aunque Contalink automatice mucho)

- Chase automatizado a los 65 clientes por docs faltantes (WhatsApp / email / voz) — Contalink no hace outreach
- Reportes ejecutivos "traducidos" al lenguaje del dueño — Contalink los da técnicos
- Clasificación de XMLs por reglas de negocio no fiscales (proyectos, centros de costo custom, notas del cliente)
- Notificaciones proactivas de anomalías al despacho
- Coordinación multi-canal (voz Nara + email Niva + chat interno del despacho)

## 3 estrategias posibles para el pitch del 15-sept

### Opción A — Adapter completo con write-back
Niva + Nala leen/escriben en Contalink vía API: pólizas, CFDIs, balanza para reportes. Timbrado nómina se queda en UI de Contalink (Nia recuerda). Setup + módulo mensual. **Riesgo**: 65 API Keys × posible costo add-on = unit economics vulnerables.

### Opción B — Capa pre-Contalink (fallback seguro)
Centinelia opera *antes* de Contalink: chase docs, clasificación XMLs, Excel/Sheets consolidado que contador GAC sube manualmente o vía import. Cero riesgo técnico, valor claro en horas-persona.

### Opción C — Híbrida (recomendada por el research)
Opción B para los 65 clientes (chase + reportes traducidos + balanza traducida) + Opción A activada solo en 5-10 clientes premium de GAC donde el ROI justifica pagar API separada. Pitch: "empezamos por volumen, escalamos por valor".

## Riesgos si prometes API sin verificar

1. **API Key por RFC = costo escondido**. Si el add-on tiene costo por empresa, 65 × $X mata unit economics.
2. **Nómina sin API = promesa rota**. Si Miguel espera timbrado auto y solo hay UI, caes a RPA frágil o dejas el paso al contador.
3. **Sin webhooks = polling cada N min por 65 RFCs** — escala mal.
4. **65 API Keys en cleartext** que GAC debe generar y compartir — fricción de onboarding real.
5. **Contalink puede lanzar su propio "empleado IA"** en 6-12 meses (startup en crecimiento) — diferénciate en chase multi-canal + voz.

## Next actions antes del 15-sept

Contactar ventas Contalink pidiendo:
1. Precio del add-on API por empresa (si es que cuesta extra).
2. Confirmación de si nómina se puede timbrar vía API en roadmap.
3. Sample de docs completo del API o acceso demo.

Sin esos 3 datos vas a la cita con incertidumbre en unit economics.

## Fuentes

- https://tutoriales.contalink.com/es/articles/8569647-configuracion-api — manual API
- https://www.contalink.com/precios
- https://www.contalink.com/
- https://www.contalink.com/contalink-vs-contpaq-aspel/
- https://tutoriales.contalink.com/es/collections/6529223-nomina
- https://apidocs.contalink.com (portal existe, requiere API Key para spec completa)
