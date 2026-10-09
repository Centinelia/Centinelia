# TXT Layout C1 — Ejemplo real para fixture #1 (Grupo Mex)

Documento para compartir con el equipo de desarrollo de IPark en la reunión del lunes 2026-10-05. Muestra el archivo TXT exacto que el Conector C1 esperaría recibir para timbrar la factura del fixture #1 (Laura Morales, Grupo Mex Consultores, 3 días de estacionamiento IPark MTY, boleto 2087341).

Base: PDF `LC1-CFDI40.pdf` de InvoiceOne (recibido 2026-10-02 PM, con los 3 ejemplos oficiales en páginas 19-21).

Este TXT es lo que el **endpoint HTTPS de IPark** debería generar internamente al recibir el JSON de Centinelia, antes de depositarlo en la carpeta `/entrada/` del Conector.

---

## Reglas del formato (confirmadas por el PDF oficial)

- Encoding: **UTF-8**
- Extensión: **`.txt`**
- Nombre: prefijo obligatorio `FE` + nombre libre → `FE[nombre].txt`
- Separador de campos: **pipe `|`**
- Cada sección (COMPROBANTE, EMISOR, RECEPTOR, etc.) va en **su propia línea**
- Campos opcionales vacíos se dejan como pipes consecutivos: `||`
- La línea abre con un pipe tras la etiqueta y **cierra con pipe final**
- Solo valores positivos permitidos en CFDI 4.0
- Opcional: archivo flag `FE[nombre].ban` para control adicional del timbrado

Nombre de archivo propuesto para este ejemplo: `FEcen_2087341_a7f3c8d2.txt` (prefijo FE obligatorio + `cen` indica Serie + folio boleto + primeros 8 chars del hash de idempotencia para trazabilidad).

---

## El TXT completo

```
COMPROBANTE|IPA200101ABC|CEN|GME150312J78|4.0|03||775.86||900.00|PUE|||||MXN||Boleto 2087341 estancia IPark MTY 03-06 sept 2026|00001234|66600|I||01|2026-10-02T18:34:12|
EMISOR|IPA200101ABC|IPARK ESTACIONAMIENTOS SA DE CV|601|||||||||||
RECEPTOR|GME150312J78|GRUPO MEX CONSULTORES SC|66220|||601|G03|||||||||||laura.morales@grupomex.com.mx|||||
CONCEPTO|1|90111500|2087341|3|E48|DIA|Servicio de estacionamiento IPark MTY, 3 dias (del 2026-09-03 al 2026-09-06), boleto 2087341|258.62|775.86||02||
CONCEPTO_IMPUESTO_TRASLADO|1|775.86|002|Tasa|0.160000|124.14|
IMPUESTOS||124.14|
TRASLADOS|775.86|002|Tasa|0.160000|124.14|
```

---

## Breakdown por sección

### COMPROBANTE (23 elementos, 24 pipes totales)

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | RFCEmisor | `IPA200101ABC` | RFC de IPark |
| 2 | Serie | `CEN` | Centinelia (sujeto a confirmación con Americo) |
| 3 | RFCReceptor | `GME150312J78` | Grupo Mex |
| 4 | Versión | `4.0` | Fijo |
| 5 | Forma_Pago | `03` | Transferencia (hipótesis, confirmar con sistema IPark cómo cobró) |
| 6 | Condiciones_Pago | vacío | |
| 7 | Subtotal | `775.86` | total / 1.16 |
| 8 | Descuentos | vacío | |
| 9 | Total | `900.00` | Lo que cobró IPark |
| 10 | Metodo_Pago | `PUE` | Pago en una sola exhibición (default IPark) |
| 11-14 | Pedido, Remision, Cita, NoCliente | vacíos | |
| 15 | Moneda | `MXN` | |
| 16 | TipoDeCambio | vacío | Solo requerido si moneda != MXN |
| 17 | Observaciones | `Boleto 2087341 estancia IPark MTY 03-06 sept 2026` | Trazabilidad humana |
| 18 | Folio | `00001234` | Contador interno de Serie CEN (quién lo administra se decide con Americo) |
| 19 | LugarExpedicion | `66600` | CP de IPark MTY aeropuerto |
| 20 | TipoDocumento | `I` | Ingreso (factura normal) |
| 21 | Confirmacion | vacío | |
| 22 | TipoExportacion | `01` | No es exportación |
| 23 | Fecha | `2026-10-02T18:34:12` | Fecha de expedición (local) |

### EMISOR (13 elementos, 14 pipes)

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | RFC | `IPA200101ABC` | |
| 2 | Nombre | `IPARK ESTACIONAMIENTOS SA DE CV` | |
| 3 | RegimenFiscal | `601` | Personas Morales Régimen General |
| 4-13 | Calle, No_Ext, No_Int, Colonia, Localidad, Referencia, Municipio, Estado, País, C.P. | vacíos | Domicilio opcional, solo se usa si IPark activa Addendas |

### RECEPTOR (22 elementos, 23 pipes)

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | RFC | `GME150312J78` | |
| 2 | Nombre | `GRUPO MEX CONSULTORES SC` | |
| 3 | DomicilioFiscal | `66220` | CP del receptor |
| 4 | ResidenciaFiscal | vacío | Solo si extranjero |
| 5 | NumRegIdTrib | vacío | Solo si extranjero |
| 6 | RegimenFiscal | `601` | |
| 7 | UsoCFDI | `G03` | Gastos en general |
| 8-17 | Calle, No_Ext, No_Int, Colonia, Localidad, Referencia, Municipio, Estado, País, C.P. | vacíos | Domicilio opcional |
| 18 | CorreoElectronico | `laura.morales@grupomex.com.mx` | Para envío automatizado |
| 19-22 | Teléfono, Add_1, Add_2, Add_3 | vacíos | |

### CONCEPTO (12 elementos, 13 pipes). Puede repetirse para múltiples conceptos.

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | ID_Concepto | `1` | Consecutivo (si hay varios conceptos, 1, 2, 3...) |
| 2 | ClaveProdServ | `90111500` | SAT: Servicios de estacionamiento |
| 3 | NoIdentificacion | `2087341` | Folio del boleto para trazabilidad |
| 4 | Cantidad | `3` | 3 días |
| 5 | ClaveUnidad | `E48` | SAT: Unidad de servicio |
| 6 | Unidad | `DIA` | Nombre libre descriptivo |
| 7 | Descripcion | `Servicio de estacionamiento IPark MTY, 3 dias (del 2026-09-03 al 2026-09-06), boleto 2087341` | Armada automáticamente por el endpoint IPark con sucursal + fechas + folio |
| 8 | ValorUnitario | `258.62` | subtotal / cantidad |
| 9 | Importe | `775.86` | cantidad × valor_unitario (debe ser positivo) |
| 10 | Descuento | vacío | |
| 11 | ObjetoImp | `02` | Sí es objeto de impuesto |
| 12 | Aduana | vacío | Solo para operaciones de comercio exterior |

### CONCEPTO_IMPUESTO_TRASLADO (6 elementos, 7 pipes). Un bloque por concepto con impuesto.

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | ID_Concepto | `1` | Refiere al concepto arriba |
| 2 | Base | `775.86` | Base para calcular el IVA |
| 3 | Impuesto | `002` | IVA |
| 4 | TipoFactor | `Tasa` | |
| 5 | TasaOCuota | `0.160000` | IVA 16% (en franja fronteriza sería 0.080000) |
| 6 | Importe | `124.14` | IVA calculado |

### IMPUESTOS (2 elementos, 3 pipes). Totales agregados.

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | TotalImpuestosRetenidos | vacío | IPark no retiene en facturación de estacionamiento |
| 2 | TotalImpuestosTrasladados | `124.14` | Suma de IVA trasladado |

### TRASLADOS (5 elementos, 6 pipes). Suma por tipo de impuesto.

| # | Campo | Valor | Nota |
|---|-------|-------|------|
| 1 | Base | `775.86` | Suma de bases de todos los conceptos |
| 2 | Impuesto | `002` | IVA |
| 3 | TipoFactor | `Tasa` | |
| 4 | TasaOCuota | `0.160000` | |
| 5 | Importe | `124.14` | Suma del IVA trasladado |

---

## Catálogos SAT referenciados en este ejemplo

| Catálogo | Valor usado | Significado |
|----------|-------------|-------------|
| c_FormaPago | 03 | Transferencia electrónica de fondos |
| c_MetodoPago | PUE | Pago en una sola exhibición |
| c_Moneda | MXN | Peso mexicano |
| c_TipoDeComprobante | I | Ingreso |
| c_Exportacion | 01 | No es operación de exportación |
| c_RegimenFiscal | 601 | Personas Morales Régimen General |
| c_UsoCFDI | G03 | Gastos en general |
| c_ClaveProdServ | 90111500 | Servicios de estacionamiento |
| c_ClaveUnidad | E48 | Unidad de servicio |
| c_ObjetoImp | 02 | Sí es objeto del impuesto |
| c_Impuesto | 002 | IVA |
| c_TipoFactor | Tasa | Factor aplicado por tasa |
| c_TasaOCuota | 0.160000 | 16% |

Para casos edge:
- **Público en general:** receptor RFC `XAXX010101000`, régimen `616`, uso `S01`, CP del emisor.
- **Extranjero:** receptor RFC `XEXX010101000`, ResidenciaFiscal con código ISO (ej. `USA`), NumRegIdTrib con el Tax ID del país origen.
- **Nota de crédito:** TipoDocumento `E`, agregar secciones `CFDI_RELACION|1|04|` y `CFDI_RELACIONADO|1|<UUID_original>|`.

---

## Flujo end-to-end propuesto

1. **Centinelia (Nala)** extrae datos del correo → arma el JSON del request (ver `08-endpoint-json-propuesta.md`) → POST HTTPS al endpoint de IPark.
2. **Endpoint IPark** recibe el JSON → arma el TXT como el ejemplo de arriba → asigna el folio desde su contador atómico de Serie CEN → escribe `FEcen_2087341_a7f3c8d2.txt` en `/entrada/` del Conector.
3. **Conector C1** detecta el archivo (file watcher), timbra contra EasyOne.
4. Si éxito: Conector mueve `.txt` a `/procesados/` y escribe `FEcen_2087341_a7f3c8d2.xml` + `FEcen_2087341_a7f3c8d2.pdf` en `/salida/`.
5. Si error: Conector escribe `FEcen_2087341_a7f3c8d2.error.txt` con el motivo.
6. **Endpoint IPark** (vigilando `/salida/` con fs.watch o polling corto) detecta los archivos resultantes → parsea → devuelve response HTTPS a Centinelia con UUID + XML (base64) + PDF (base64), o error_code mapeado del `.error.txt`.
7. **Centinelia (Nala)** recibe el response → envía la factura al correo del cliente final.

---

## Observaciones y pendientes

- La **Serie `CEN`** cabe perfectamente en el límite de 1-25 chars del campo. Pendiente que IPark confirme que no choca con sus convenciones internas.
- El **Folio es opcional** según el PDF (el Conector no lo administra). Es responsabilidad de quien genera el TXT. Propuesta: IPark lleva el contador atómico en el server del endpoint, un solo contador por Serie, formato `00000001` a `00099999`.
- La **Observación** incluye boleto + fechas para que un humano pueda cruzar el XML con la operación de IPark sin tener que decodificar la descripción del concepto.
- La **Fecha** debe ser hora local del lugar de expedición (sin TZ offset).
- Para múltiples boletos en un correo (fixture #13), la decisión está abierta: 1 TXT con múltiples bloques CONCEPTO vs. N TXTs separados. Mi default sería N separados por simplicidad y trazabilidad.
