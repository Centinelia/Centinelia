# Round-Trip Fixtures

Este directorio contiene los fixtures para el test harness de round-trip XML CONTPAQi.

## Agregar un fixture real (CFDIs de Beatriz)

1. Copia el XML real exportado de CONTPAQi como `<caso>.contpaqi.xml`
   - Ejemplo: `tortilleria-agosto-01.contpaqi.xml`

2. Crea `<caso>.input.json` con los datos del adapter (lo que hubiera venido en la notita):

```json
{
  "invoice": {
    "clientRFC": "RFC_DEL_CLIENTE",
    "date": "YYYY-MM-DD",
    "lines": [
      { "sku": "CODIGO_PRODUCTO", "qty": 5, "unitPrice": 18.00, "ivaTasa": 0 }
    ],
    "paymentMethod": "transferencia",
    "usoCFDI": "G03",
    "serie": "A"
  },
  "config": {
    "serie": "A",
    "rfcEmisor": "RFC_EMISOR",
    "regimenFiscal": "601",
    "lugarExpedicion": "64000",
    "usoCFDIDefault": "G03"
  }
}
```

3. Corre los tests:

```
npm test round-trip
```

## ADVERTENCIA: No commitear fixtures reales del cliente

Los archivos `*.contpaqi.xml` y `*.input.json` estan en `.gitignore` para proteger datos fiscales del cliente.
Solo `dummy.contpaqi.xml` y `dummy.input.json` (datos de prueba sin RFC real) estan exentos y pueden commitearse.

## Fixture dummy (baseline)

`dummy.contpaqi.xml` + `dummy.input.json` — datos genericos (RFC XAXX010101000, emisor EJEM010101AAA).
Siempre corre en CI. Si este test falla, algo se rompio en `buildImportXml` o en el parser.
