# Plantillas de fichas informativas para Santiago NL

Estas plantillas se suben al portal del cliente Santiago NL desde:
`/portal/<TOKEN>/` → Fichas informativas → Nueva ficha.

Al subir cada ficha, el autotag Sonnet propone tags. Verifica que sean:
- Ficha 01 multas: `atencion_cliente`, `operaciones`, `politicas` (rechazar `contabilidad`, `fiscal`).
- Ficha 02 directorio: `atencion_cliente`, `operaciones`.
- Ficha 03 servicios fuera de alcance: `politicas`, `atencion_cliente`.

Contenidos son ejemplos genéricos — reemplazar con los datos reales del municipio antes de subir.

## Orden de activación sugerido

1. Subir ficha 03 primero (servicios fuera de alcance). Es la que más previene alucinaciones en Nia.
2. Subir ficha 01 (multas). Resuelve el problema de orientación a Tesorería.
3. Subir ficha 02 (directorio). Habilita búsqueda por primer nombre.

## Cómo activar client_memory para Nia de Santiago NL

Una vez que Nazre active el agente de Santiago NL, correr en Supabase:

```sql
UPDATE voice_agents
SET features = features || jsonb_build_object('client_memory', true)
WHERE id = '<agent_id_de_nia_santiago>';
```

Esto permite que Nia recuerde el historial de llamadas del mismo número de teléfono entre sesiones.
