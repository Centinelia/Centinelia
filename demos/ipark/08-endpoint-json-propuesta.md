# Propuesta de contrato JSON — Endpoint IPark para timbrado desde Centinelia

Documento para compartir con el equipo de desarrollo de IPark en la reunión del lunes 2026-10-05.

Esta es una **propuesta inicial**, no un contrato cerrado. El equipo de IPark define el shape final según sus convenciones internas (nombres de campos, autenticación, formato de response). Lo importante es que todos los datos relevantes del CFDI estén cubiertos, independientemente del naming.

El objetivo es que su equipo pueda arrancar diseño del endpoint con un ejemplo concreto a la mano, en vez de empezar desde cero.

Base de este ejemplo: fixture #1 del demo (Laura Morales, Grupo Mex Consultores, estancia 3 días en IPark MTY del 3 al 6 de septiembre, folio 2087341).

## Importante: este documento spec de Opción A

Este documento especifica el contrato del endpoint para la **Opción A arquitectural** (endpoint HTTPS mediado que absorbe toda la complejidad file-based del Conector). Ver `12-pre-meeting-lunes.md` sección "Las 3 opciones de arquitectura" para contexto completo.

**Si en la reunión del lunes se elige Opción B o C** (SFTP compartido o sub-carpeta dedicada), el contrato del endpoint se simplifica significativamente:

- Request: igual al que se muestra abajo (o incluso Centinelia puede mandar directamente el TXT ya armado).
- Response: inmediato, muy simple:
  ```json
  {
    "status": "dropped",
    "filename": "FEcen_2087341_a7f3c8d2.txt",
    "received_at": "2026-10-02T18:34:12Z"
  }
  ```
- IPark NO parsea XML+PDF ni mapea errores. Solo deposita el TXT en el Conector y confirma recepción.
- Centinelia polea la carpeta de salida (completa en B, sub-carpeta en C) buscando archivos con prefijo `FEcen_*`.

Las secciones "Response HTTP", "Endpoint auxiliar propuesto: consulta de estatus", y "Casos edge" de este documento aplican solo a Opción A. En B/C, Centinelia maneja todo el flujo post-drop del lado nuestro.

El **body del request** (sección siguiente) es útil en las 3 opciones como referencia de qué datos Centinelia tiene disponibles para armar el CFDI, aunque en B/C el endpoint IPark lo use solo para generar el TXT y no haga nada más con él.

## Contexto del Conector C1 (confirmado por InvoiceOne 2026-10-02)

El endpoint que IPark construya vive encima del Conector C1 y debe traducir el flujo HTTPS a file-drop:

1. **Entrada:** Centinelia postea JSON → el endpoint IPark arma un TXT con el layout C1 (encoding UTF-8, extensión `.txt`) y lo deposita en la carpeta `/entrada/` del Conector.
2. **Procesamiento:** el Conector es un file watcher. Detecta el TXT nuevo automáticamente, lo lee, timbra contra EasyOne, y mueve el archivo a `/procesados/`.
3. **Resultado:** si tiene éxito, genera `nombre_base.xml` + `nombre_base.pdf` en la carpeta `/salida/`. Si falla, genera `nombre_base.error.txt` con el motivo.
4. **Retorno a Centinelia:** el endpoint IPark debe hacer file watch interno de `/salida/` (o polling corto) para detectar la aparición de los archivos y traducir el resultado a una respuesta HTTPS limpia hacia Centinelia.

Puntos clave que impactan el diseño:
- El Conector NO tiene webhook ni callback. IPark debe polear o usar file watcher nativo del OS.
- El Conector NO administra Serie ni folio. Deben venir dentro del TXT.
- El Conector NO reintenta automáticamente. Si falla, hay que reenviar el TXT.
- Los archivos de salida conservan el mismo nombre base del TXT de entrada: `cen_2087341_<hash>.txt` → `cen_2087341_<hash>.xml` + `cen_2087341_<hash>.pdf`.

---

## 1. Request HTTP (lo que Centinelia manda a IPark)

### Método y URL

```
POST https://api.ipark.com.mx/v1/facturas
```

### Headers

```http
Content-Type: application/json
Authorization: Bearer <API_KEY_QUE_IPARK_NOS_DA>
Idempotency-Key: 8f3c2a1b9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a
X-Centinelia-Agent: nala-ipark/1.0
X-Correlation-Id: cen_01HPQR0X9Y8Z7W6V5U4T3S2R1Q
```

Explicación de headers:
- `Authorization`: credencial que IPark provisiona a Centinelia. Formato propuesto bearer token; mTLS también posible si prefieren.
- `Idempotency-Key`: hash SHA-256 determinístico del contenido fiscal del request (ver `tests/lib/invoicing/c1-idempotency-design.test.ts`). Si llega el mismo key dos veces en una ventana de 24h, IPark debe devolver el UUID original en vez de volver a timbrar.
- `X-Centinelia-Agent`: identifica qué sistema envía (útil para logs de IPark cuando a futuro haya otros meerkats).
- `X-Correlation-Id`: id interno de Centinelia para trazabilidad end-to-end en logs de ambos lados.

### Body

```json
{
  "serie": "CEN",
  "tipo_comprobante": "I",
  "folio_boleto": "2087341",
  "forma_pago": "03",
  "metodo_pago": "PUE",
  "moneda": "MXN",
  "receptor": {
    "rfc": "GME150312J78",
    "nombre": "Grupo Mex Consultores SC",
    "regimen_fiscal": "601",
    "domicilio_fiscal_cp": "66220",
    "uso_cfdi": "G03"
  },
  "conceptos": [
    {
      "clave_prod_serv": "90111500",
      "clave_unidad": "E48",
      "cantidad": 3,
      "descripcion": "Servicio de estacionamiento IPark MTY, 3 dias (del 2026-09-03 al 2026-09-06), boleto 2087341",
      "valor_unitario": 258.62,
      "importe": 775.86,
      "objeto_imp": "02",
      "impuestos": {
        "traslados": [
          {
            "base": 775.86,
            "impuesto": "002",
            "tipo_factor": "Tasa",
            "tasa_o_cuota": 0.160000,
            "importe": 124.14
          }
        ]
      }
    }
  ],
  "totales": {
    "subtotal": 775.86,
    "total_impuestos_trasladados": 124.14,
    "total": 900.00
  },
  "entrega": {
    "correo_destino": "laura.morales@grupomex.com.mx",
    "correos_copia": []
  },
  "metadatos_centinelia": {
    "source_message_id": "<CAHJfK9Q2z8vXYZabc123@mail.gmail.com>",
    "source_received_at": "2026-10-02T18:34:12Z",
    "nala_agent_version": "1.0",
    "nala_extraction_confidence": 0.98
  }
}
```

### Notas sobre campos

**Campos que probablemente IPark ya tiene y Centinelia podría omitir si prefieren:**
- `clave_prod_serv` (siempre 90111500 para estacionamiento)
- `clave_unidad` (siempre E48)
- `objeto_imp` (siempre 02)
- `impuestos.traslados[].*` (siempre IVA 16%, calculable desde total)
- `totales.subtotal` y `totales.total_impuestos_trasladados` (derivables de `totales.total`)

Si IPark prefiere que Centinelia solo mande `total` y ellos derivan subtotal e IVA, perfecto. Reduce superficie de error.

**Campos que IPark necesita que Centinelia mande siempre:**
- `folio_boleto` (anchor fuerte, para que IPark cruce con su sistema de cobros)
- `receptor.*` (los datos fiscales que Nala extrajo del correo)
- `metadatos_centinelia.source_message_id` (para auditoría y debug cross-system)

**Campos que podrían venir del header en vez del body:**
- `serie` (podría ser configuración de la API key: cada API key tiene su serie asignada)

---

## 2. Response HTTP (lo que IPark devuelve a Centinelia)

### Éxito 200 OK (síncrono, timbrado completado)

```json
{
  "status": "timbrado_ok",
  "uuid": "A1B2C3D4-5E6F-7A8B-9C0D-1E2F3A4B5C6D",
  "serie": "CEN",
  "folio": "00001234",
  "fecha_timbrado": "2026-10-02T18:34:45Z",
  "sello_sat": "base64...",
  "cadena_original": "||1.1|...||",
  "no_certificado_sat": "00001000000500000000",
  "xml": "base64_del_xml_timbrado_completo==",
  "pdf": "base64_del_pdf_render==",
  "qr_code": "base64_del_png_del_qr==",
  "metadatos_ipark": {
    "endpoint_version": "1.0",
    "tiempo_timbrado_ms": 1847,
    "rfc_emisor_usado": "IPA200101ABC"
  }
}
```

### Éxito con flujo asíncrono 202 Accepted (si IPark prefiere no incluir XML+PDF síncronos)

```json
{
  "status": "aceptado_en_cola",
  "uuid_asignado": null,
  "poll_url": "https://api.ipark.com.mx/v1/facturas/req_01HPQR0X9Y/status",
  "estimated_ready_in_seconds": 15
}
```

Centinelia poleará `poll_url` cada 10 segundos hasta recibir `status: "timbrado_ok"` con los datos finales.

### Duplicado 409 Conflict (mismo Idempotency-Key previamente procesado)

```json
{
  "status": "ya_timbrado",
  "uuid": "A1B2C3D4-5E6F-7A8B-9C0D-1E2F3A4B5C6D",
  "serie": "CEN",
  "folio": "00001234",
  "fecha_timbrado_original": "2026-10-02T18:34:45Z",
  "xml": "base64...",
  "pdf": "base64...",
  "mensaje": "Este request ya fue procesado previamente. Devolviendo CFDI existente."
}
```

El código 409 permite a Centinelia detectar duplicados sin tratar como error real.

### Validación 400 Bad Request (datos inválidos)

```json
{
  "status": "rechazado",
  "error_code": "RFC_RECEPTOR_INVALIDO",
  "mensaje": "El RFC 'GME150312J7' no tiene formato valido o no existe en el padron del SAT.",
  "campo_afectado": "receptor.rfc",
  "accion_sugerida": "Verificar RFC con el cliente antes de reintentar."
}
```

### Error del conector 503 Service Unavailable (fallo downstream)

```json
{
  "status": "error_timbrado",
  "error_code": "CONECTOR_C1_UNAVAILABLE",
  "mensaje": "El Conector C1 de InvoiceOne no respondio en tiempo. Reintente en 60 segundos.",
  "retry_after_seconds": 60,
  "retry_safe": true
}
```

`retry_safe: true` indica a Centinelia que puede reintentar con el mismo Idempotency-Key. Si fuera `false` (ej. ya se mandó al PAC pero no se recibió confirmación), Centinelia debe esperar y usar el endpoint de consulta por folio.

### Error del PAC 502 Bad Gateway (SAT rechazó)

```json
{
  "status": "error_sat",
  "error_code": "SAT_CFDI_304",
  "mensaje": "Certificado emisor revocado. Contactar a soporte IPark urgente.",
  "retry_safe": false,
  "escalation_required": true
}
```

---

## 3. Endpoint auxiliar propuesto: consulta de estatus

Para los casos de reintento donde Centinelia no sabe si el timbrado se completó, un endpoint secundario:

```
GET https://api.ipark.com.mx/v1/facturas/by-idempotency-key/{idempotency_key}
Authorization: Bearer <API_KEY>
```

Response posibles:
- 200 OK con el CFDI (si existe)
- 404 Not Found (si nunca se procesó)
- 202 Accepted (si está en proceso)

Esto permite recuperarse de timeouts en el request original sin riesgo de doble timbrado.

---

## 4. Casos edge que vale la pena contemplar desde el diseño

### 4a. Público en general (sin RFC)

Nala manda:
```json
{
  "receptor": {
    "rfc": "XAXX010101000",
    "nombre": "PUBLICO EN GENERAL",
    "regimen_fiscal": "616",
    "domicilio_fiscal_cp": "66600",
    "uso_cfdi": "S01"
  }
}
```

IPark debe aceptar este caso sin tratarlo como validación fallida. `domicilio_fiscal_cp` toma el valor del lugar de expedición del emisor.

### 4b. Pre-pago (cliente escribió antes del cobro)

Nala NO llama al endpoint todavía. El request se queda en cola de Centinelia hasta que el folio tenga cobro final en el sistema de IPark. Esto no afecta el contrato pero vale la pena mencionarlo.

### 4c. Correo de entrega distinto al remitente

```json
{
  "entrega": {
    "correo_destino": "cmendoza@grupomex.com.mx",
    "correos_copia": ["ana.rodriguez@grupomex.com.mx"]
  }
}
```

¿IPark envía el PDF+XML por correo, o solo lo devuelve a Centinelia y Centinelia lo envía? Decisión abierta.

### 4d. Múltiples boletos en una factura

Caso a decidir con IPark en la llamada: emitimos N requests (uno por folio) o un solo request con múltiples conceptos. Default propuesto: N requests separados, mismo correo destino.

---

## 5. Resumen de decisiones que IPark debe tomar

1. Response síncrono con XML+PDF, o asíncrono con polling
2. Mecanismo del endpoint para detectar fin del timbrado del Conector: file watcher (fs.watch del lado IPark) o polling corto de `/salida/` cada N segundos
3. Timeout del endpoint cuando no hay respuesta del Conector (sugerencia: 60s)
4. Convención de nombre del TXT que armará el endpoint (sugerencia: `cen_<folio_boleto>_<idempotency_key_corto>.txt` para trazabilidad)
5. Quién administra el contador de folios de Serie CEN (recomendado: IPark en su server del endpoint, un solo contador atómico)
6. Idempotencia por header (`Idempotency-Key`) o por hash interno de IPark sobre el body
7. Correo final al cliente lo envía IPark o Centinelia
8. Autenticación: bearer token, API key, o mTLS
9. Nomenclatura de Serie: `CEN` o alternativa
10. Multi-RFC emisor: parámetro en body, o derivado del folio, o endpoint distinto por RFC
11. Qué campos del CFDI prefieren recibir vs. derivar internamente
12. Cómo parsear el contenido de `.error.txt` del Conector y traducirlo a `error_code` HTTP semántico
