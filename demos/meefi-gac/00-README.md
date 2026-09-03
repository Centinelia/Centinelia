# Meefi + GAC Demo — Ambientes para cita 15-sept

Ambientes de demo dedicados para la cita del **15 de septiembre de 2026** con:
- **Gerardo Guajardo** — socio operativo MTY / co-founder de **Meefi** (fintech de tesorería multi-divisa B2B para importadoras mexicanas)
- **Miguel Guajardo** (hermano) — socio director de **GAC** (despacho contable boutique en Monterrey)

Contexto y estrategia consolidada: `handoff_prospecto_gerardo_guajardo_2026-09-02.md` en memoria.

## Estructura de archivos

### Meefi (empresa de Gerardo)

| # | Archivo | Contenido |
|---|---|---|
| research-01 | `research-01-meefi.md` | Perfil profundo de Meefi (fuente: 2 agents research 2026-09-02) |
| 01 | `meefi-01-clientes.md` | 7 empresas importadoras cliente ficticias con datos coherentes |
| 02 | `meefi-02-kb-nara.md` | KB de Nara — recepción y soporte 24/7 |
| 03 | `meefi-03-kb-niva.md` | KB de Niva — KYB, compliance UIF, análisis |
| 04 | `meefi-04-kb-nova.md` | KB de Nova — consolidación, reporting diario, ingesta correo |
| 05 | `meefi-05-escenarios.md` | 6 escenarios wow para la cita + estimación de valor + pitch |
| 06 | `meefi-06-statement-jpmc-02sept2026.csv` | Statement bancario ficticio JPMC (32 movimientos, 3 breaks deliberados para escenario 5) |
| 07 | `meefi-07-ledger-interno-02sept2026.csv` | Ledger interno Meefi mismo día (para reconciliar contra statement) |
| 08 | `meefi-08-cartera-master-02sept2026.csv` | Master mensual clientes con TPV/take rate/alertas |

### GAC (despacho de Miguel)

| # | Archivo | Contenido |
|---|---|---|
| research-02 | `research-02-gac.md` | Perfil GAC + supuestos declarados (fuente pública limitada) |
| 01 | `gac-01-clientes.md` | 6 clientes cliente ficticios (mix de giros, tamaños, regímenes) |
| 02 | `gac-02-kb-nara.md` | KB de Nara — coordinación operativa, chase mensual, atención |
| 03 | `gac-03-kb-nala.md` | KB de Nala — facturista/timbradora nómina + CFDI + REP |
| 04 | `gac-04-kb-niva.md` | KB de Niva — reportes ejecutivos al cliente + análisis rentabilidad |
| 05 | `gac-05-escenarios.md` | 6 escenarios wow para la cita + estimación de valor + pitch |
| 06 | `gac-06-variables-nomina-quincena.csv` | Variables nómina Distribuidora Sofía (12 empleados, 2 alertas para escenario 2) |
| 07 | `gac-07-xmls-recibidos-transportes-guerra.csv` | 40 XMLs recibidos Transportes Guerra (con duplicado + RFC inválido para escenario 3) |
| 08 | `gac-08-balance-transportes-guerra-ago2026.csv` | Balance + Estado Resultados agosto Transportes Guerra (para escenario 4) |

## Combos de empleados por ambiente

**Meefi:** Nara + Niva + Nova (Nico en fase 2 cuando escalen volumen para cobros)
**GAC:** Nara + Nala + Niva (Nova en fase 2 para ingesta masiva de XMLs)

## Frames de venta

**Meefi:**
> "Ustedes venden a importadoras 'tesorería global sin contratar treasurer'. Centinelia les vende a ustedes 'escalar operaciones sin escalar payroll'. Misma tesis, otro nivel."

**GAC:**
> "Los despachos boutique MTY pierden clientes porque no pueden crecer sin contratar más juniors. Centinelia le permite a GAC pasar de 65 a 90 clientes sin contratar a nadie más. Miguel factura +50%, equipo trabaja menos horas en captura y más en asesoría."

## Estimación de valor por ambiente

| Ambiente | Ahorro payroll año 1 | Revenue nuevo posible | Precio sugerido |
|---|---|---|---|
| Meefi | ~$2M MXN | +200-400% clientes con mismo equipo | $35-50K/mes + setup $50-80K |
| GAC | ~$450K MXN | +30 clientes (~$10M MXN revenue nuevo) | $25-35K/mes + setup $40-60K |

## Alertas para la cita del 15-sept

- **Gerardo NO aparece como founder público de Meefi** (los founders públicos son Daniel Rodríguez + Andrés González). Confirmar rol al inicio de la cita — puede ser co-founder silencioso, inversionista, C-level reciente, o socio MTY.
- **GAC no aparece en búsquedas públicas.** Perfil está construido con supuestos razonables de despacho boutique típico MTY. Antes del 15 confirmar con Miguel: (a) nombre legal exacto + sitio, (b) número real de clientes activos, (c) sistema contable (asumido CONTPAQi — si es otro, cambia mucho).
- **Ambientes NO están provisionados aún**. Están diseñados en papel. Fase 3 (provisioning en el portal de Centinelia) arranca cuando Nazre esté listo.

## Timeline restante

| Fase | Días | Acción |
|---|---|---|
| ✅ Fase 1 — Research | Sep 2 | 2 agents completados. Perfiles Meefi + GAC. |
| ✅ Fase 2 — Diseño de contenido | Sep 2 (hoy) | KBs + clientes + escenarios. Este directorio completo. |
| ⏳ Fase 3 — Build/Provisioning | Sep 3-8 | Provisionar 2 ambientes en portal + brecha #1 (pipeline correo Nova) + config Resend inbound. |
| ⏳ Fase 4 — Testing | Sep 9-12 | Dry run + iterar KBs si suenan raros. |
| ⏳ Fase 5 — Ejecución | Sep 15 | Cita con Gerardo + Miguel. |

## Reglas del pivot 2026-09-02

- **Fondo Demo del Norte** (assets en `../fondo-demo-del-norte/`) queda **ARCHIVADO**. No usar. Sirve como referencia arquitectural (shape de archivos, patrón de heterogeneidad de Excels, template runbook).
- **Meefi y GAC son ambientes distintos** — pueden vivir en un solo portal con 2 orgs distintas o en 2 portales separados. Se decide en Fase 3.
- **Brechas de código (2, 3, 4) ya cerradas.** El vertical financiero, kill switch org-wide y alertas Nazre están listos en producción.
- **Brecha #1 (pipeline correo Nova) SIGUE OPEN**. Con 13 días de ventana ahora sí es viable cerrarla (~8h). Impacta directamente el escenario 4 de Meefi (reporte diario matutino por correo) y el 3-4 de GAC (ingesta XMLs y reporte al cliente por correo).
