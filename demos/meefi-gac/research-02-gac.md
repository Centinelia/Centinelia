# Research profundo — GAC de Miguel Guajardo

Investigación realizada 2026-09-02 para diseñar ambiente demo dedicado para la cita del 15-sept.

---

## 🚨 GAC no se encontró en fuentes públicas

Búsqueda exhaustiva en Google, LinkedIn, directorios del IMCP/Instituto de Contadores Públicos de NL, ZoomInfo, Facebook — **no arrojó despacho llamado "GAC" ligado a Miguel Guajardo en Monterrey**. Descartados:

- **GGAF (Guajardo Abogados y Asesores Fiscales)** — socios Gustavo + Gilberto Guajardo, NO es GAC ni Miguel.
- **Guajardo Cantú Asociados** — apellido Guajardo pero Miguel no aparece en directorios públicos.

Confirmación cruzada: el investigador también confirmó independientemente que **Gerardo Guajardo NO aparece como founder público de Meefi** (mismo hallazgo del reporte Meefi). Los founders públicos son Daniel Rodríguez + Andrés González.

**Perfil de GAC = ASUMIDO basado en despacho boutique típico de MTY** hasta que Nazre confirme detalles.

---

## Perfil asumido (despacho boutique MTY)

**Servicios estándar de un despacho de 10-25 personas en MTY:**
1. Contabilidad general mensual multi-RFC (CONTPAQi Despachos o Aspel COI)
2. Cumplimiento fiscal — ISR, IVA, IEPS, DIOT, retenciones
3. Contabilidad electrónica (SAT: catálogo, balanza, pólizas)
4. Timbrado nómina quincenal (CONTPAQi Nóminas / NOI)
5. Dictamen fiscal e ISSIF para clientes >$140M ingresos
6. Declaraciones anuales PM/PF
7. Asesoría devoluciones IVA
8. Constitución sociedades + altas SAT/IMSS
9. Outsourcing administrativo (facturación, CxC)
10. Precios de transferencia + UIF (típicamente subcontratado)

**Cliente típico:** PyMEs $5M-$150M MXN/año + empresas familiares medianas. 40-120 clientes activos. Sectores: manufactura ligera, servicios, comercio, transporte, construcción, restaurantes.

**Estructura del equipo:** 1 socio (Miguel) + 1-2 gerentes CPC + 4-8 senior + 4-8 juniors + 1-2 admin. Sede probable SPGG / Valle Oriente / Cumbres. Fundación 2005-2015.

## 6 clientes ficticios representativos

1. **Refaccionaria Industrial Del Norte SA** — mayoreo, 28 emp, $4M/mes, PM Régimen General, 180/320 facturas emitidas/recibidas
2. **Transportes Guerra Hermanos S de RL** — carga, 45 unidades, $8M/mes, PM Coordinado, 90/500 (muchos combustibles/casetas)
3. **Constructora Almar del Valle SA** — obra residencial, 15 admin + 60 obra, $6M/mes, 20/250
4. **Clínica Dental Ceballos** — 3 dentistas, PF actividad empresarial, $400K/mes, 300/40
5. **Distribuidora de Alimentos Sofía S de RL** — abarrotes, 12 emp, $2.5M/mes, RESICO PM, 600/400
6. **Grupo Restaurantero Barra Cinco SA** — 3 sucursales, 55 emp, $3M/mes, PM General, 2,500/400 (tickets)

## 6 escenarios wow para el demo

1. **Nara — chase mensual**: día 1 de mes dispara recordatorio a 60 clientes ("mándanos edo cuenta y nómina de agosto"), lleva scoreboard, escala morosos al día 5. Reemplaza junior dedicado 3 días.
2. **Nala — timbrado nóminas simultáneo**: recibe variables de 6 clientes por correo/WhatsApp, valida contra template, timbra en CONTPAQi Nóminas, regresa PDF+XML.
3. **Nova — ingesta XMLs**: 500 XMLs recibidos de Transportes Guerra Hermanos → clasifica combustible/casetas/refacciones para DIOT → devuelve tabla lista.
4. **Niva — reporte cierre traducido**: toma balanza CONTPAQi, la traduce a lenguaje de dueño ("tus utilidades bajaron 12% vs julio porque nómina subió $80k"), correo listo para Miguel.
5. **Nara — atención llamadas**: cliente pregunta "¿ya se pagaron mis impuestos?", consulta ledger interno, responde status + monto + línea de captura sin escalar.
6. **Nala + Nova — dashboard día 15-17**: revisan quién tiene declaración lista, quién falta, quién debe depositar. Semáforo rojo/verde por cliente para Miguel.

## Ángulos de venta

**Dolor #1 más agudo**: capacidad. Despachos boutique MTY **pierden clientes porque no pueden crecer sin contratar** — cada nuevo cliente = un junior más. Los CPC juniors buenos escasean y rotan.

**Dolor #2**: errores en día 15-17 por overload → multas + requerimientos SAT + clientes molestos.

**Dolor #3**: honorarios impagados por falta de seguimiento sistemático.

**Combo demo recomendado:** Nara + Nala + Niva (Nova background).

**Métricas ROI que resuenan con un CPC:**
- Horas de socio/gerente liberadas ($800-$2,000/hora facturables)
- Clientes adicionales sin contratación ($8K-$25K MXN/mes ARR por cliente nuevo)
- Días de cierre reducidos (12 → 6 del mes siguiente)
- Reducción multas SAT + requerimientos por vencimientos perdidos

**Pitch de una línea:**
> "GAC puede pasar de 60 a 90 clientes sin contratar a nadie más. Miguel factura +50% y su equipo trabaja menos horas en captura, más en asesoría."

---

## 3 preguntas críticas para Nazre ANTES del 15-sept

1. **Nombre legal exacto y sitio web de GAC** (para confirmar que existe y calibrar tamaño)
2. **Parentesco real Miguel↔Gerardo↔Meefi** — que Gerardo confirme cómo es socio/founder/otro de Meefi
3. **Sistema contable que usa GAC** — CONTPAQi / Aspel COI / Odoo / otro. Cambia MUCHO el demo (el adapter tortillería ya está hecho para CONTPAQi, sirve reutilizarlo si aplica)

## Fuentes
- [GGAF (descartado)](https://ggaf.mx/)
- [Guajardo Cantú Asociados](https://mexicoo.mx/guajardo-cantu-asociados-distribex-2923552)
- [Instituto Contadores Públicos NL](https://imcp.org.mx/instituto-de-contadores-publicos-de-nuevo-leon-a-c/)
- [CONTPAQi Despachos](https://www.contpaqi.com/publicaciones/contabilidad/despacho-contable-claves-para-el-exito)
