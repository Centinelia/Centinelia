# Print queue — contract con el Windows Writer

**Motivación**: la impresora está en la red local del cliente (Tortillería). El server Centinelia (cloud) no puede alcanzarla. El único proceso que sí tiene acceso a la impresora es el Windows Writer que corre en la PC del cliente.

## Flujo end-to-end

1. **Solicitud** (múltiples entrypoints posibles):
   - Beatriz manda `POST /api/portal/[token]/billing/print` desde la UI o llamada CLI.
   - (Futuro) Nala procesa un correo de Beatriz "imprime factura X" y llama `enqueuePrintJob` como tool.

2. **Server escribe job JSON a Dropbox**:
   ```
   /{basePath}/print_queue/{YYYY}/{MM}/{jobId}.json
   ```
   Ej: `/Facturacion/print_queue/2026/09/prn_2026-09-10T15-30-00-000Z_abc12345.json`

   Contenido:
   ```json
   {
     "job_id":       "prn_2026-09-10T15-30-00-000Z_abc12345",
     "requested_at": "2026-09-10T15:30:00.000Z",
     "requested_by": "beatriz@grupoestrella.mx",
     "cfdi_ref": {
       "uuid":        null,
       "serie":       "FTEN",
       "folio":       "1234",
       "cliente_rfc": null,
       "fecha_desde": null,
       "fecha_hasta": null
     },
     "copies":       1,
     "printer_name": null,
     "status":       "pending"
   }
   ```

3. **Writer processes** (post-piloto — a implementar):

   a. Poll cada N segundos (recomendado 15-30s) sobre
      `/{basePath}/print_queue/**/*.json`, filtro por `status="pending"`.

   b. Para cada job:
      - Resolver el CFDI en CONTPAQi:
         - Si `uuid` viene: buscar directo por UUID.
         - Si `serie+folio` viene: buscar por serie/folio.
         - Si `cliente_rfc + fecha_desde + fecha_hasta`: buscar el más reciente en el rango (si hay múltiples, error → status='error').
      - Exportar PDF vía CONTPAQi API/SDK (representación impresa).
      - Enviar `copies` copias al print spooler:
         - Si `printer_name` viene, usar esa impresora exacta.
         - Si `null`, usar la default del sistema.
      - Mover el job JSON a `/{basePath}/print_queue/done/{YYYY}/{MM}/{jobId}.json` con campos añadidos:
        ```json
        {
          ... campos originales ...,
          "status":         "ok",  // o "error"
          "printed_at":     "2026-09-10T15:30:47.000Z",
          "printer_used":   "HP LaserJet Beatriz",
          "error_message":  null   // o string si status=error
        }
        ```

## Idempotencia

- `jobId` incluye timestamp ISO + short-ref del CFDI. Colisiones son extremadamente improbables (< 1 en millones para el mismo request).
- Si el Writer procesa un job dos veces (crash + restart), imprime dos veces. Mitigación: mover el archivo a `done/` en cuanto empiece a procesar, no cuando termine. Si crashea a mitad, el job se pierde silente y Beatriz reenvía. Preferible a duplicar impresión (costo de tinta > costo de reintento manual).

## Errores

- CFDI no encontrado → `status="error"`, `error_message="CFDI no existe en CONTPAQi (busqué por UUID/folio/rango)"`.
- Impresora no responde → `status="error"`, `error_message="Impresora {name} no responde después de N intentos"`.
- Job JSON malformado → mover a `/print_queue/errors/{jobId}.json` con nota.

## MVP vs futuro

- **MVP** (hoy shipped): server escribe jobs, Writer no los procesa aún → jobs acumulan en `/print_queue/` sin efecto. Cero riesgo, solo scaffolding.
- **Writer v1.x** (post-piloto): implementar polling + búsqueda CFDI + print. Ver notas arriba.
- **Reporting** (después): endpoint `GET /api/portal/[token]/billing/print/status?job_id=...` que lee del JSON en `/done/` para que la UI muestre "impreso a las 15:30 en HP-LaserJet".
