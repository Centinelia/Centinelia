---
name: centinelia-competencia
description: "Vigilancia competitiva semanal. Busca updates de Vapi, ElevenLabs, competidores de IA de voz en México, y nuevas regulaciones de telecomunicaciones. Resume novedades relevantes para el roadmap de Centinelia."
---

# Centinelia — Vigilancia Competitiva

## Qué hace este skill

Cuando se invoca `/centinelia-competencia`, buscas noticias y actualizaciones relevantes para el mercado de agentes de voz IA, con foco en México y en las plataformas que usa Centinelia.

## Qué buscar

### 1. Updates de proveedores core

Busca en la web:
- `Vapi AI update changelog 2026` — nuevas features, cambios de precios, límites
- `ElevenLabs API update 2026` — nuevas voces, modelos, precios
- `Anthropic Claude API update 2026` — nuevos modelos, precios, límites de contexto

### 2. Competidores directos en México

Busca:
- `agente de voz IA Mexico 2026` 
- `asistente telefónico IA PYME Mexico`
- `AI voice agent Mexico startup`
- Competidores conocidos: Converse AI, Bland AI, Retell AI, Voiceflow — buscar si tienen presencia en MX

### 3. Regulaciones y telecom

- `regulación IA Mexico 2026`
- `IFT telecomunicaciones IA 2026`
- `Twilio Mexico cambios 2026`

### 4. Tendencias del mercado

- `voice AI SMB trends 2026`
- `AI agent pricing model 2026`

## Formato del reporte

```
CENTINELIA — VIGILANCIA COMPETITIVA [FECHA]

PROVEEDORES CORE:
[Vapi] — [hallazgo o "Sin cambios relevantes"]
[ElevenLabs] — [hallazgo o "Sin cambios relevantes"]
[Anthropic/Claude] — [hallazgo o "Sin cambios relevantes"]

COMPETIDORES:
[competidor] — [hallazgo: nueva feature, cambio de precio, etc.]

MERCADO MEXICO:
[hallazgo relevante o "Sin actividad significativa"]

REGULACIONES:
[hallazgo o "Sin novedades"]

IMPACTO PARA CENTINELIA:
1. [acción o decisión que debería considerarse]
2. [acción o decisión que debería considerarse]

FUENTES:
- [URL 1]
- [URL 2]
```

## Si se usa con /loop o /schedule

Ideal ejecutar semanalmente (viernes por la tarde). El goal de terminación es: haber buscado los 4 bloques de información y generado el reporte completo en menos de 8 turnos.

## Notas

- Prioriza cambios de precio — impactan directamente el margen de Centinelia
- Anota cualquier feature nueva de Vapi que podríamos adoptar
- Si un competidor lanza en México, esto es de alta prioridad: notificar a Nazre de inmediato
- Guardar el reporte en `/centinelia-competencia-YYYY-MM-DD.md` si se quiere historial local
