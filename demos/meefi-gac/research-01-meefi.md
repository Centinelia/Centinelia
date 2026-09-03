# Research profundo — Meefi

Investigación realizada 2026-09-02 para diseñar ambiente demo dedicado para la cita del 15-sept con Gerardo Guajardo.

---

## 🚨 Alerta importante para la cita

**Gerardo Guajardo NO aparece como founder público de Meefi.**

- CEO público en LinkedIn/Crunchbase/CB Insights/ThOrg: **Daniel Rodriguez** (Co-Founder & CEO)
- Otro co-founder mencionado: **Jose Roberto Said Kauachi**
- Founders Launchpad Axented menciona también a **Andres Gonzalez**

Gerardo puede ser: socio capitalista, inversionista mayoritario, co-founder no listado, C-level reciente (CFO/COO/COO MTY), o confusión con otra empresa del grupo. **Confirmar rol al inicio de la cita antes de asumir**.

---

## A) Qué hace Meefi

**Producto:** "La cuenta global que tu empresa ya necesitaba" — plataforma de tesorería global multi-divisa para PYMES mexicanas que importan y exportan.

**Servicios:**
- Pagos internacionales mismo día a +70 países, trazabilidad tiempo real
- SPEI local
- Pagos masivos / dispersión (nómina, proveedores en un batch)
- Cuenta empresarial (CLABE MXN)
- Cuentas multi-divisa: USD, MXN, EUR, GBP, **CNY** (clave para importadoras de China)
- Tesorería con dashboard tiempo real
- Integración con SAT
- Roles y permisos con audit trail

**Regulatorio:**
- NO son ITF ni SOFOM
- Modelo BaaS: infra de terceros regulados, ellos hacen UX + orquestación
- Trabajan con CNBV (interlocución) y FinCEN (EE.UU.)
- Solo personas morales

**Modelo de negocio:** spread FX transparente + comisiones + probable suscripción features avanzadas.

## B) Tamaño y equipo

- Fundación: 2023
- Empleados: 2-10
- Sedes: Middletown Delaware + CDMX (HQ oficial LinkedIn) + Monterrey (operaciones)
- Funding: pre-seed ~$100K de Platanus Ventures (Feb 2024)
- Competidor comparable: EFEX ($8M seed 2026, misma tesis)

## C) Operaciones internas que consumen tiempo

1. **KYB de nuevas importadoras** — prometen <24h, alta carga manual
2. **Soporte transaccional 24/7** — status wires, disputas FX, casos en tránsito
3. **Reconciliación de pagos internacionales** — matching MT103, devoluciones parciales
4. **Compliance / UIF** — operaciones >$7,500 USD, PLD
5. **Facturación de comisiones** — CFDIs mensuales por cliente
6. **Cobros de comisiones morosas** — cargo automático falla → llamada
7. **Onboarding beneficiarios internacionales** — SWIFT/IBAN, listas OFAC
8. **Reporting interno diario** — volumen, revenue por spread, top clientes
9. **Coordinación bancos corresponsales** — MT199, investigaciones
10. **Follow-up ventas** — leads landing que no terminaron KYB

## D) 7 empresas cliente ficticias (para seed data)

1. **Grupo Textiles del Norte SA** (Monterrey) — telas de India/Turquía. ~$180M MXN/año. 25 pagos/mes, ~$400K USD.
2. **Electrónica Global Pacífico SA** (Guadalajara) — componentes Shenzhen. ~$95M MXN. 40 pagos/mes CNY, ~$220K USD.
3. **Autopartes Río Bravo SAPI** (Nuevo Laredo) — refacciones EE.UU./Corea. ~$250M MXN. 60 pagos/mes ACH/wire, ~$650K USD.
4. **Distribuidora de Vinos Meridiano** (CDMX) — vinos España/Italia/Chile. ~$40M MXN. 15 pagos/mes EUR, ~$90K USD.
5. **Insumos Médicos MedCore** (Monterrey) — dispositivos Alemania/EE.UU. ~$120M MXN. 20 pagos/mes EUR/USD, ~$180K USD.
6. **Ferretera Industrial Aztlán** (Puebla) — herramientas China/Taiwán. ~$70M MXN. 30 pagos/mes CNY, ~$150K USD.
7. **Café y Empaques Boutique** (Chiapas/CDMX) — maquinaria Italia + café verde export EE.UU. ~$55M MXN. 10 pagos out + 8 collections/mes.

## E) 6 escenarios wow para el demo del 15-sept

1. **Nara — soporte 24/7**: dueño de importadora llama sábado 3am "¿ya salió mi wire de $85K USD a Mumbai?". Nara autentica, consulta status vía API Meefi, responde MT103 emitido + ETA + registra ticket.

2. **Nara + Niva — onboarding KYB**: lead vía landing → Nara agenda call + recolecta docs por WhatsApp → Niva clasifica acta/RFC/poder + checks OFAC/UIF automatizados → expediente listo para aprobación humana en 40 min vs 6h manuales.

3. **Nova — dashboard diario Excel**: cada 8am jala transacciones del día anterior, arma Sheet con volumen por divisa, revenue por spread, top 10 clientes, alertas outliers. Mail a Daniel + Gerardo.

4. **Nico — cobros morosos**: 12 clientes con comisión vencida. Llama cordial, ofrece link de pago, escala solo si objetan. Recupera 70% sin tocar CSM.

5. **Niva + Nova — reporte UIF/PLD mensual**: Niva detecta operaciones >$7,500 USD, Nova consolida en formato UIF, borrador listo para oficial de cumplimiento.

6. **Nara — resolución de excepción**: cliente reporta "proveedor en Turquía dice que llegó $2K menos". Nara diagnostica que probablemente es fee del banco intermediario, pide MT103, arma caso, escala a ops con contexto listo. Cliente feliz en 5min.

## F) Ángulos de venta

**Dolor #1 (más agudo):** soporte transaccional. No escala con headcount, clientes hablan con proveedores en Asia de noche/fin de semana.

**Dolor #2:** promesa <24h de KYB vs 2-10 personas.

**Dolor #3:** reporting operativo/financiero diario para VCs/board.

**Combo demo recomendado:** Nara (voz+chat 24/7) + Niva (KYB/compliance) + Nova (reporting). Nico en fase 2.

**Estimación de valor:**
- Evitar 2 CSMs jr: ~$1.4M MXN/año
- Analista jr reemplazado por Nova: ~$420K MXN/año
- Mejora conversión lead→cliente activado 15-20 pts
- Total conservador: **~$2M MXN/año en payroll + capacidad 3x-5x clientes sin crecer equipo**

**Ángulo emocional para Gerardo:**
> "Meefi le vende a las importadoras 'tesorería global sin contratar treasurer'. Centinelia le vende a ustedes 'escalar clientes sin escalar payroll'. Misma tesis, otro nivel."

---

## Fuentes
- [meefi.io](https://meefi.io/)
- [Meefi LinkedIn](https://www.linkedin.com/company/meefi)
- [CB Insights](https://www.cbinsights.com/company/meefi)
- [Crunchbase](https://www.crunchbase.com/organization/meefi)
- [ThOrg](https://theorg.com/org/meefi)
- [Founders Launchpad Axented](https://founderslaunchpad.axented.com/p/meefi)
- [EFEX competidor](https://www.latamfintech.co/articles/fintech-efex-recauda-us-8m-en-una-ronda-semilla-para-consolidar-su-plataforma-de-tesoreria-global-en-mexico-y-ee-uu)
