# Demo IPark Estacionamientos — Nala facturista

Prospecto entrando vía **Bernardo Bichara** (Monterrey). Contacto operativo: asistente/mano derecha (nombre pendiente). Primera llamada breve ya sucedió, quedó de agendarse 2ª con demo listo.

## Perfil del cliente

- **Negocio:** IPark, estacionamientos de estancia larga en aeropuertos (MTY confirmado, otros aeropuertos MX por confirmar).
- **Volumen fiscal:** ~35,000 CFDIs/mes toda la red. De esos, ~1,000/mes son "despistados" que llegan por correo y hoy resuelve un equipo humano en Monterrey.
- **PAC actual:** InvoiceOne (EasyOne API). Volumen alto ya cubierto técnicamente.
- **Portal público:** existe y funciona — clientes recurrentes/autoservicio ya facturan solos.
- **Dolor real:** los 1,000 correos/mes que no pasan por autoservicio y se acumulan en un inbox humano.

## Qué vende Centinelia aquí

**Nala facturista** conectada al correo actual de IPark que:

1. Lee todos los correos entrantes del inbox de facturación.
2. Filtra con criterio ESTRICTO: solo abre correos que CLARAMENTE piden factura.
3. Extrae datos (RFC, folio boleto, importe, uso CFDI).
4. Si datos completos → timbra vía InvoiceOne EasyOne API (bajo la cuenta de IPark) → responde con CFDI adjunto (XML+PDF).
5. Si falta info → responde pidiendo lo faltante.
6. Si no puede resolver (RFC inexistente, mes vencido, disputa) → escala a humano con contexto.
7. Los correos que NO son de facturación quedan intactos en el inbox para que el humano los siga viendo.

## No compite con

- **InvoiceOne** — sigue timbrando los 34,000 autoservicio, y timbra los 1,000 nuevos vía API.
- **Portal público de IPark** — sigue igual, autoservicio no cambia.
- **Persona actual** — Nala la libera del trabajo repetitivo, la promueve a auditora + casos difíciles.

## Estado

- [x] Adapter InvoiceOne EasyOne (mock mode + stub SOAP real) — `src/lib/invoicing/invoiceone/`
- [x] Nala IPark prompt — `01-nala-ipark-prompt.md`
- [ ] Fixtures correos demo — `02-fixtures-correos.md`
- [ ] Org demo provisionada
- [ ] Runbook demo — `03-runbook-demo.md`
- [ ] Propuesta ejecutiva — `04-propuesta-ejecutiva.md`

## Externos pendientes (Nazre)

- Pedir credenciales sandbox de InvoiceOne EasyOne a soporte@invoiceone.com.mx o desde el portal ayuda.invoiceone.com.mx. Sin credenciales el demo corre en modo mock (funciona igual, solo pierde 5% de wow-factor).
- Confirmar nombre de la asistente de Bichara y correo para follow-up post-demo.
