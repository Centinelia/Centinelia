# Correo Nova consolidado diario — Asset para escenario M2 del demo 15-sept

Este correo se manda **manualmente desde una cuenta que aparente ser Nova** (nova@meefi-demo.centinelia.mx o similar) a Gerardo/Daniel el 15-sept temprano (7:30 AM), antes de la cita. Cuando lleguen a la cita, ya lo tienen en la bandeja y M2 es "abrir el correo en pantalla".

## Datos técnicos del envío

- **De**: `nova@meefi-demo.centinelia.mx` (o el alias que uses)
- **Para**: `gerardo@meefi.io` (o el que confirme Gerardo)
- **CC**: `daniel@meefi.io`
- **Hora envío**: 7:30 AM el 15-sept
- **Adjunto**: `Consolidado_diario_14sept2026.xlsx` (armar aparte con la tabla de ops del día)

## Subject

```
Meefi — Consolidado diario 14-sept — TPV $71,340 USD, 11 operaciones
```

## Body (HTML plano, para pegar en Gmail)

```
Buenos días.

Cierre operativo del sábado 14-sept.

RESUMEN DEL DÍA
TPV $71,340 USD equivalente · 11 operaciones · Revenue estimado $1,024 USD
Variación vs promedio 7 días: -18% (esperado, fin de semana con cutoff limitado)

BREAKDOWN POR CORREDOR

MX → EEUU  USD          $32,180 USD    4 ops    3 clientes
MX → China CNY          $18,900 USD    3 ops    2 clientes
MX → Europa EUR         $12,460 USD    2 ops    2 clientes
MX → Corea del Sur KRW  $5,200 USD     1 op     1 cliente
MX → India USD          $2,600 USD     1 op     1 cliente

TOP 5 CLIENTES POR VOLUMEN DEL DÍA

1. Autopartes Río Bravo SAPI      $28,400 USD    3 ops    (USD, KRW)
2. Grupo Textiles del Norte SA    $18,900 USD    2 ops    (USD, EUR)
3. Electrónica Global Pacífico    $11,240 USD    3 ops    (CNY)
4. Insumos Médicos MedCore        $8,200 USD     2 ops    (EUR, USD)
5. Ferretera Industrial Aztlán    $4,600 USD     1 op     (CNY)

ALERTAS DEL DÍA

🔴 Reconciliation break — MT103 #WRE-8842 (Autopartes Río Bravo, $12,400 USD a Detroit ordenado ayer 12:40 CDMX) sin confirmación de corresponsal después de 18h. Escalado a Roberto Alcalá para MT199.

🟡 Cliente Ferretera Aztlán operó 1.8σ arriba de su baseline mensual (día individual). No es 3σ pero mantiene la tendencia de +45% vs julio que ya está flagada. Recomiendo que Iván (ejecutivo de cuenta) valide con Carolina Espinoza que es actividad esperada.

🟡 Nuevo beneficiario en revisión — Café y Empaques Boutique registró "Trattoria Meccanica Milano SRL" (Italia, EUR). País no sensible, KYB estándar en cola. Compliance responde antes de 4h hábiles.

🟢 Todas las demás operaciones reconciliadas al cierre del día.

MÉTRICAS OPERATIVAS

Time-to-first-response mesa humana:           promedio 2:14 min
KYBs procesados:                              1 nuevo (Comercializadora del Bajío, en cola de aprobación)
Clientes activos en el día:                   5 de 7
Consultas 24/7 atendidas por Nara:            8 (todas resueltas, 0 escalaciones)

Adjunto Excel con detalle completo por operación, sub-ledger por cliente actualizado, y hoja de excepciones para tesorería.

Nova
Centro de Coordinación · Meefi
```

## Contenido del Excel adjunto (armar en Google Sheets o Excel manual)

**Hoja 1 · Operaciones del día**

| ID | Cliente | Ordenante | Beneficiario | País destino | Divisa | Monto USD equiv | Rieles | Estado | ETA / Ref |
|---|---|---|---|---|---|---|---|---|---|
| MT103-8842 | Autopartes Río Bravo | Autopartes Río Bravo SAPI | Detroit Motor Parts LLC | EEUU | USD | 12,400 | SWIFT | En tránsito 🔴 | Esperando MT199 |
| MT103-8843 | Autopartes Río Bravo | Autopartes Río Bravo SAPI | Hyundai KRW Parts | Corea del Sur | KRW | 5,200 | SWIFT | Acreditado | Ref 4092-KRW |
| ACH-2201 | Autopartes Río Bravo | Autopartes Río Bravo SAPI | Border Wholesale Inc | EEUU | USD | 10,800 | ACH | Acreditado | Ref ACH-2201 |
| MT103-8844 | Grupo Textiles del Norte | Grupo Textiles del Norte SA | Anadolu Kumas AS | Turquía | USD | 8,900 | SWIFT | Acreditado | MT103-8844 |
| MT103-8845 | Grupo Textiles del Norte | Grupo Textiles del Norte SA | Bombay Cotton Traders | India | USD | 2,600 | SWIFT | Acreditado | MT103-8845 |
| MT103-8846 | Grupo Textiles del Norte | Grupo Textiles del Norte SA | Textilio Milano SRL | Italia | EUR | 7,400 | SWIFT | Acreditado | MT103-8846 |
| MT103-8847 | Electrónica Global | Electrónica Global Pacífico | Shenzhen Chip Ltd | China | CNY | 4,900 | SWIFT | Acreditado | MT103-8847 |
| MT103-8848 | Electrónica Global | Electrónica Global Pacífico | Shanghai Panels Inc | China | CNY | 3,600 | SWIFT | Acreditado | MT103-8848 |
| MT103-8849 | Electrónica Global | Electrónica Global Pacífico | Guangzhou Cables Co | China | CNY | 2,740 | SWIFT | Acreditado | MT103-8849 |
| MT103-8850 | MedCore | Insumos Médicos MedCore | Siemens Healthineers | Alemania | EUR | 5,060 | SWIFT | Acreditado | MT103-8850 |
| SPEI-int-4021 | MedCore | Insumos Médicos MedCore | Boston Scientific USA | EEUU | USD | 3,140 | SPEI internacional | Acreditado | Ref SPEI-4021 |
| MT103-8851 | Ferretera Aztlán | Ferretera Industrial Aztlán | Ningbo Tools Co | China | CNY | 4,600 | SWIFT | Acreditado | MT103-8851 |

**Hoja 2 · Sub-ledger por cliente (movimientos del día)**

Cada cliente con: saldo abierto, operaciones del día, comisiones cargadas, saldo cierre.

**Hoja 3 · Excepciones (para tesorería)**

- MT103-8842 — Ordenado 14-sept 12:40 CDMX, sin confirmación. Corresponsal JPMC. Acción: MT199 mañana AM.
- Café y Empaques — beneficiario nuevo pendiente KYB.
- Ferretera Aztlán — tendencia +45% baseline sostenida, revisar con ejecutivo.

## Nota operativa

Si a la 7:30 AM del 15-sept aún no tienes cuenta de correo "nova@" configurada, envía desde Gmail personal firmado como Nova y menciona en el body "Nota: este correo se envía desde la cuenta de demo mientras se completa la config del dominio". No mata el wow.
