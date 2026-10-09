# TXT Layout C1 — Ejemplos adicionales para casos edge

Documento complementario a `09-txt-layout-c1-ejemplo-fixture1.md`. Muestra el TXT exacto que el Conector C1 esperaría recibir para los 4 casos edge más comunes del inbox de IPark, basados en los fixtures #4, #11, #12 y #14 del demo.

Juntos, los 5 ejemplos (este archivo + el 09) cubren prácticamente todas las variantes que el endpoint de IPark tendrá que generar en producción.

Para el breakdown exhaustivo de cada campo del layout, ver `09-txt-layout-c1-ejemplo-fixture1.md`. Aquí solo documento el TXT final de cada caso + lo que cambia respecto al patrón base.

---

## Caso #4 — Cliente extranjero con RFC MX (correo en inglés)

**Correo origen:** `robert.chen@meridian-partners.com`, pide "tax invoice" en inglés para 5 días de estancia IPark MTY del 28 de agosto al 2 de septiembre, boleto 2081204.

**Datos fiscales:** RFC `MEP180415UR9`, Meridian Partners Mexico SA de CV (empresa mexicana con director extranjero), régimen `601`, uso CFDI `G03`, CP `06500`.

**Monto:** $1,856 total (5 días a $320/día + IVA).

### TXT completo

```
COMPROBANTE|IPA200101ABC|CEN|MEP180415UR9|4.0|03||1600.00||1856.00|PUE|||||MXN||Boleto 2081204 estancia IPark MTY 28 ago - 02 sep 2026|00001235|66600|I||01|2026-10-02T18:45:00|
EMISOR|IPA200101ABC|IPARK ESTACIONAMIENTOS SA DE CV|601|||||||||||
RECEPTOR|MEP180415UR9|MERIDIAN PARTNERS MEXICO SA DE CV|06500|||601|G03|||||||||||robert.chen@meridian-partners.com|||||
CONCEPTO|1|90111500|2081204|5|E48|DIA|Servicio de estacionamiento IPark MTY, 5 dias (del 2026-08-28 al 2026-09-02), boleto 2081204|320.00|1600.00||02||
CONCEPTO_IMPUESTO_TRASLADO|1|1600.00|002|Tasa|0.160000|256.00|
IMPUESTOS||256.00|
TRASLADOS|1600.00|002|Tasa|0.160000|256.00|
```

### Qué cambia vs. fixture #1 (Grupo Mex)

- RFC distinto, razón social distinta, CP distinto, correo distinto. Todo RECEPTOR cambia.
- Cantidad = 5 (vs 3), ValorUnitario = 320 (vs 258.62).
- Observaciones y descripción del concepto se ajustan con las fechas correctas.
- **El idioma del correo del cliente (inglés) NO afecta el TXT**: el TXT siempre va en español porque es el formato fiscal mexicano. La respuesta al cliente final sí va en inglés (Nala la redacta aparte).

---

## Caso #11 — Público en general (cliente sin RFC)

**Correo origen:** `jose.hernandez@gmail.com`, pide factura "a nombre de público en general" porque no tiene RFC propio. Boleto 2104892, estancia "la semana pasada" (sin fechas específicas, el sistema de IPark da fecha_entrada = 2026-09-25, fecha_salida = 2026-09-27 = 2 días).

**Datos fiscales (todos defaults):** RFC `XAXX010101000`, razón social `PUBLICO EN GENERAL`, régimen `616` (sin obligaciones fiscales), uso `S01` (sin efectos fiscales), CP del emisor (`66600`).

**Monto:** $696 total (2 días a $300/día + IVA).

### TXT completo

```
COMPROBANTE|IPA200101ABC|CEN|XAXX010101000|4.0|01||600.00||696.00|PUE|||||MXN||Boleto 2104892 estancia IPark MTY 25-27 sep 2026, factura publico general|00001236|66600|I||01|2026-10-02T18:52:00|
EMISOR|IPA200101ABC|IPARK ESTACIONAMIENTOS SA DE CV|601|||||||||||
RECEPTOR|XAXX010101000|PUBLICO EN GENERAL|66600|||616|S01|||||||||||jose.hernandez@gmail.com|||||
CONCEPTO|1|90111500|2104892|2|E48|DIA|Servicio de estacionamiento IPark MTY, 2 dias (del 2026-09-25 al 2026-09-27), boleto 2104892|300.00|600.00||02||
CONCEPTO_IMPUESTO_TRASLADO|1|600.00|002|Tasa|0.160000|96.00|
IMPUESTOS||96.00|
TRASLADOS|600.00|002|Tasa|0.160000|96.00|
```

### Qué cambia vs. fixture #1 (Grupo Mex)

- **Receptor con RFC genérico:** `XAXX010101000` + `PUBLICO EN GENERAL`.
- **DomicilioFiscal del receptor = CP del emisor:** `66600` en vez del CP del cliente real. Esto es regla SAT para público general.
- **Régimen `616`** (sin obligaciones fiscales) y **UsoCFDI `S01`** (sin efectos fiscales). Combinación obligatoria para público general.
- **Forma_Pago `01`** (efectivo). Default para público general cuando no se sabe cómo cobró IPark; para corporate normalmente es 03 (transferencia) o 04 (TC).
- La Observación menciona explícitamente "factura publico general" para que un humano lo vea rápido al revisar.
- Nala en la respuesta al cliente debe advertir que esta factura **no sirve para deducir**, y ofrecer regenerar con datos fiscales reales si los proporciona.

---

## Caso #12 — Nota de crédito (TipoDocumento E con CFDI relacionado)

**Correo origen:** `patricia.luna@consultoresjl.com`, dice que el 20 de septiembre dejó auto 3 días (al 23) pero IPark le cobró por 5 días. Factura original UUID `4F2E8A1B-9D3C-4A7F-B2E1-77CC88DD99EE`. Pide nota de crédito por los 2 días de más y reembolso.

**Datos fiscales:** RFC `CJL180815KS4`, Consultores JL SA de CV, régimen `601`, uso `G03`, CP `66220`.

**Monto a acreditar:** $696 (2 días de más a $300/día + IVA).

### TXT completo

```
COMPROBANTE|IPA200101ABC|CEN|CJL180815KS4|4.0|03||600.00||696.00|PUE|||||MXN||Nota de credito por ajuste 2 dias estancia IPark MTY 20-23 sep 2026, boleto original 2095412|00001237|66600|E||01|2026-10-02T19:05:00|
CFDI_RELACION|1|01|
CFDI_RELACIONADO|1|4F2E8A1B-9D3C-4A7F-B2E1-77CC88DD99EE|
EMISOR|IPA200101ABC|IPARK ESTACIONAMIENTOS SA DE CV|601|||||||||||
RECEPTOR|CJL180815KS4|CONSULTORES JL SA DE CV|66220|||601|G03|||||||||||patricia.luna@consultoresjl.com|||||
CONCEPTO|1|90111500|2095412|2|E48|DIA|Ajuste por dias cobrados en exceso, estancia IPark MTY del 2026-09-20 al 2026-09-23, boleto original 2095412|300.00|600.00||02||
CONCEPTO_IMPUESTO_TRASLADO|1|600.00|002|Tasa|0.160000|96.00|
IMPUESTOS||96.00|
TRASLADOS|600.00|002|Tasa|0.160000|96.00|
```

### Qué cambia vs. fixture #1 (Grupo Mex)

- **TipoDocumento `E`** en vez de `I`. Es un Egreso (nota de crédito).
- **Dos secciones nuevas obligatorias:**
  - `CFDI_RELACION|1|01|` donde `01` es la clave SAT `c_TipoRelacion` para "Nota de crédito de los documentos relacionados".
  - `CFDI_RELACIONADO|1|<UUID_original>|` con el UUID del CFDI de ingreso que estamos ajustando.
- La descripción del concepto cambia: "Ajuste por días cobrados en exceso" en vez de "Servicio de estacionamiento".
- Observaciones menciona explícitamente "Nota de credito" para trazabilidad.
- **Pendiente operativo:** el endpoint de IPark debe poder buscar el UUID original dado un folio_boleto en su sistema, o Centinelia debe guardarlo cada vez que timbra y mandarlo en el request del Egreso. Pregunta abierta para Americo.

---

## Caso #14 — Asistente ejecutiva (correo entrega distinto al remitente)

**Correo origen:** `ana.rodriguez@grupomex.com.mx` (asistente del Lic. Carlos Mendoza), pide factura con los datos fiscales de la empresa pero que el XML+PDF llegue directo a `cmendoza@grupomex.com.mx` con copia a ella. Boleto 2101223, estancia 2 días.

**Datos fiscales:** mismos que fixture #1 (Grupo Mex Consultores SC, RFC `GME150312J78`, régimen `601`, uso `G03`, CP `66220`).

**Monto:** $696 (2 días × $300 + IVA).

### TXT completo

```
COMPROBANTE|IPA200101ABC|CEN|GME150312J78|4.0|03||600.00||696.00|PUE|||||MXN||Boleto 2101223 estancia IPark MTY 24-26 sep 2026, Lic Mendoza|00001238|66600|I||01|2026-10-02T19:12:00|
EMISOR|IPA200101ABC|IPARK ESTACIONAMIENTOS SA DE CV|601|||||||||||
RECEPTOR|GME150312J78|GRUPO MEX CONSULTORES SC|66220|||601|G03|||||||||||cmendoza@grupomex.com.mx|||||
CONCEPTO|1|90111500|2101223|2|E48|DIA|Servicio de estacionamiento IPark MTY, 2 dias (del 2026-09-24 al 2026-09-26), boleto 2101223|300.00|600.00||02||
CONCEPTO_IMPUESTO_TRASLADO|1|600.00|002|Tasa|0.160000|96.00|
IMPUESTOS||96.00|
TRASLADOS|600.00|002|Tasa|0.160000|96.00|
```

### Qué cambia vs. fixture #1 (Grupo Mex)

- **Mismo RFC, misma razón social que fixture #1** (son la misma empresa; el boleto puede ser de cualquier colaborador).
- **El `CorreoElectronico` del RECEPTOR = `cmendoza@grupomex.com.mx`** (el destino que pidió la asistente), NO el remitente Ana Rodríguez.
- Observaciones menciona al Lic. Mendoza para que un humano lo cruce visualmente.
- El JSON del request de Centinelia debe llevar un campo `correos_copia: ["ana.rodriguez@grupomex.com.mx"]` para que el envío del XML+PDF por correo lleve a Ana en CC. Esto NO va en el TXT (es responsabilidad del envío post-timbrado, no del CFDI mismo).

---

## Catálogos SAT adicionales usados en estos ejemplos

Complemento a los del fixture #1:

| Catálogo | Valor nuevo | Significado | Caso donde aplica |
|----------|-------------|-------------|-------------------|
| c_RegimenFiscal | 616 | Sin obligaciones fiscales | Caso #11 público general |
| c_UsoCFDI | S01 | Sin efectos fiscales | Caso #11 público general |
| c_FormaPago | 01 | Efectivo | Caso #11 default cuando no se sabe |
| c_TipoDeComprobante | E | Egreso | Caso #12 nota de crédito |
| c_TipoRelacion | 01 | Nota de crédito de los documentos relacionados | Caso #12 |

## Pendientes derivados de estos ejemplos

- **Caso #12 (nota de crédito):** confirmar con Americo cómo obtener el UUID del CFDI original dado un folio_boleto. Opciones: endpoint IPark lo busca en su DB, o Centinelia lo guarda al momento de timbrar cada ingreso.
- **Caso #14 (asistente ejecutiva):** confirmar con Americo si el envío del XML+PDF al cliente final lo hace su endpoint (en cuyo caso necesitan el campo `correos_copia` en el request) o Centinelia (en cuyo caso solo necesitamos los archivos y Nala los distribuye).
- **Caso #11 (público general):** confirmar con Americo si IPark tiene políticas específicas para público general en su facturación manual actual, o si simplemente aplicamos el default SAT.
