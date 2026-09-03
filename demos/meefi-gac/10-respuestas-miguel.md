# Respuestas Miguel Guajardo (recibidas 2026-09-03 vía WhatsApp)

## Respondidas

1. **Nombre legal / sitio**: Gestores y Asesores Contables — https://www.gacservicios.com
2. **Sistema contable**: **Contalink** (NO CONTPAQi como habíamos asumido)
6. **Cita 15-sept**: presencial
7. **Duración cita**: 1 hora

## Pendientes de Miguel

3. Número real de clientes activos
4. Tamaño del equipo (socios + juniors + captura)
5. Retos operativos concretos (qué duele más al mes: chase docs, timbrado, cierre, cobranza a clientes)

## Implicaciones inmediatas

### Contalink cambia el pitch técnico (impacto ALTO)

- **Contalink** es plataforma cloud SaaS mexicana de contabilidad. Distinto de CONTPAQi Desktop.
- **El adapter CONTPAQi construido para Tortillería NO aplica directamente.**
- Necesitamos verificar antes de la cita:
  - ¿Contalink tiene API pública? (research pendiente)
  - ¿Cómo timbran CFDIs? ¿Integración propia o con PAC externo?
  - ¿Se puede subir póliza contable vía API o solo UI?
- Si Contalink expone API → **podemos construir adapter Contalink** (esfuerzo similar al de CONTPAQi, ~3-5 días).
- Si NO expone API → offering para GAC se limita a: automatización pre-Contalink (chase docs, clasificación XMLs, reportes al cliente) y NO auto-captura en el sistema.

### Cita presencial 1 hora — formato demo

- Presencial = mejor demo en pantalla que autoservicio con token.
- 1 hora es ajustado — hay que priorizar escenarios wow. Recomiendo:
  - 5 min intro
  - 20 min escenarios Meefi (2-3 wow)
  - 20 min escenarios GAC (2-3 wow)
  - 15 min preguntas y comercial
- Definir quién opera pantalla (Nazre) y plan B si no hay proyector/internet.

### Update KBs GAC

- KB Nala GAC (timbrado CFDI, nómina) sigue vigente conceptualmente pero hay que revisar frases que asuman "capturamos en tu sistema" — con Contalink puede ser "preparamos el asiento en Sheets y tú (o Nala misma con acceso Contalink UI vía RPA fase 2) lo sube".

## Acciones inmediatas

- [ ] Research quick Contalink API (10 min WebSearch)
- [ ] Ajustar `gac-03-kb-nala.md` para no asumir stack específico
- [ ] Guardar en memoria: GAC usa Contalink (invalidar asumption CONTPAQi)
