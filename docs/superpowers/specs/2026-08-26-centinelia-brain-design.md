# Centinelia Brain (`.brain/`) - Design

**Fecha:** 2026-08-26
**Autor:** Nazre + Claude Opus 4.7 (sesión brainstorm)
**Estado:** Fase 0 shippeada junto con este spec.

## Problema

Hoy la inteligencia acumulada de Centinelia vive en 3 lugares desconectados:

1. **Auto-memory local** (`C:\Users\Nazre\.claude\projects\C--Users-Nazre\memory\`, ~80 archivos).
   - Atada a la máquina y al asistente que la escribió.
   - Mezcla `feedback_*` (policies + preferencias) con `handoff_*` (proyectos + decisiones) y `project_*` (estado + histórico).
   - No sobrevive cambio de máquina, y si abres Cursor/Codex en el repo arrancan de cero.

2. **Skills instaladas** (`~/.claude/skills/centinelia-*` + `.claude/skills/centinelia-*` en el repo).
   - Los triggers viven bien, pero el contenido está disperso: parte en la skill, parte en auto-memory, parte en docs de código.
   - Ejemplo: la regla "3 canales obligatorios" está en `feedback_tool_3_canales.md`, en `feedback_3channel_tools.md` (duplicada), en la skill `centinelia-tool-completeness`, y en comentarios de `sync.ts`.

3. **Handoffs sueltos** (~15 archivos `handoff_*.md`).
   - Mezclan estado presente con decisiones históricas.
   - No hay separación entre "esto se decidió y por qué" (inmutable) vs "esto está pasando ahora" (mutable).

**Consecuencia práctica**: cada sesión nueva re-explora, re-explica, y a veces re-comete el mismo error (ej. shipear tool solo en voice sin registrar chat/email - commit `bacb5d2a`).

## Objetivos

1. **Fuente de verdad versionada** en `centinelia/.brain/` - sobrevive máquina, tool, y sesión.
2. **Navegación explícita** vía `README.md` que actúa como mapa (no índice) - un agente que solo lee el mapa sabe a qué carpeta ir para cualquier tarea.
3. **Separación clara** entre:
   - `decisions/` inmutables con fecha (histórico intacto vía `replaced_by`)
   - `policies/` mutables (reglas duras que aplican siempre)
   - `skills/` procesos ejecutables navegables
   - `projects/` estado actual mutable
   - `learnings.md` append-only (correcciones revisadas)
4. **Loop de corrección → PR → merge** - cada corrección al brain pasa por PR review, no se edita silenciosamente.
5. **Piloto acotado**: workflow "agregar/modificar tool de meerkat" (workflow que se corrige repetidamente).

## No-objetivos (YAGNI)

- **Migrar los 80 archivos de auto-memory de golpe.** Migración pull-based: solo se promueve al brain lo que se toque en sesiones reales.
- **UI portal para el brain.** Es markdown en git. Editar = commit. Review = PR. No hay panel de admin en `/oficina`.
- **Brain per-org de clientes.** El "org" del brain es *Centinelia-el-equipo* (Nazre + AIs desarrollando la plataforma). Los meerkats de clientes NO leen este brain. Cuando eventualmente se productize (brain per-cliente en Supabase) es otro spec.
- **Sync bidireccional automático auto-memory ↔ brain.** Auto-memory queda como scratch/drafts personal. Promoción es manual y explícita (comando `/brain-promote` o commit directo).
- **Reemplazar skills existentes.** `centinelia-tool-completeness`, `centinelia-copy-guidelines`, etc. siguen siendo los triggers. Su contenido eventualmente se adelgaza a un pointer al brain, pero no en Fase 0.

## Diseño

### Estructura

```
centinelia/.brain/
├── README.md                    # company map - front door, <200 líneas, señalización pura
├── decisions/                   # inmutables con fecha, replaced_by opcional
│   ├── 2026-08-18-3-canales-obligatorio.md
│   └── 2026-08-18-feature-flag-por-org.md
├── policies/                    # reglas mutables que aplican siempre
│   └── tool-completeness.md     # 5 reglas del bloat
├── skills/                      # procesos ejecutables navegables
│   └── adding-a-meerkat-tool.md # el piloto
├── people/                      # owners + approval boundaries
│   └── nazre.md
├── learnings.md                 # append-only, correcciones revisadas
├── workers/                     # (vacía en Fase 0, crear al primer worker real)
├── projects/                    # (vacía en Fase 0, migrar handoffs pull-based)
└── company-brief.md             # (opcional Fase 1, si aparece necesidad)
```

**Regla**: carpetas vacías NO se crean en Fase 0. `workers/` y `projects/` nacen cuando llega su primer archivo real.

### Formato de archivo

Todo archivo del brain tiene frontmatter YAML:

```yaml
---
name: <slug-kebab>
description: <una línea, para que otros agentes decidan si entrar>
type: decision | policy | skill | worker | person | project | learning
owner: nazre
last_verified: YYYY-MM-DD
replaced_by: <slug>  # solo en decisions/, opcional
supersedes: <slug>   # solo en decisions/, opcional
---
```

Links entre archivos: `[[slug-del-otro]]` (estilo Obsidian, ya usado en auto-memory).

### El loop de corrección → review → share

Cuando una sesión corrige algo, la corrección se enruta a la capa correcta:

| Tipo de corrección | Capa | Ejemplo |
|---|---|---|
| Hecho actualizado | `projects/<proyecto>.md` | "AC ya migró a QB Online" |
| Nueva decisión estratégica | `decisions/YYYY-MM-DD-<tema>.md` | "custom meerkat eliminado sitewide" |
| Preferencia repetida | `policies/<área>.md` | "nunca 'IA' en copy visible" |
| Técnica probada | `skills/<verbo>-<sustantivo>.md` | "adding-a-meerkat-tool" |
| Secuencia end-to-end | `workers/<job>.md` | "new-org-onboarding" |
| Acción peligrosa | `policies/*` + gate mecánico | "verificar org antes de leer por ID" |
| Lección de incidente | `learnings.md` (append) | "bug Nox create_document" |

**Mecánica:**

1. **Detección**: en sesión, cuando Nazre corrige algo, el asistente dice explícitamente *"esto va a `.brain/policies/X.md`"* antes de aplicar. Sin ruteo explícito, la lección muere en la sesión.
2. **Draft**: cambio en branch `brain/<tema>`.
3. **Review = PR**: Nazre revisa el diff. Un typo en `policies/` afecta a todos los agentes futuros → merece PR.
4. **Merge**: `.brain/` cambia y todo agente que lea el brain hereda.
5. **Retroalimentación**: si en 2 semanas la policy no aplicó bien, `learnings.md` documenta el gap y se ajusta.

**Regla dura**: `decisions/` NUNCA se editan. Se crea uno nuevo con `replaced_by: <old-slug>` en frontmatter. Historial preservado (aprendizaje directo del incidente `custom` eliminado sitewide 2026-08-18).

**Filtro anti-scope-creep**: no todo bug va al brain. Solo lo que **se va a repetir** o **cambió el modelo mental**. Test: "¿un agente nuevo la próxima vez volvería a caer aquí sin este cambio?" Si no → commit normal, no toca brain.

### Interacción con auto-memory local

- Auto-memory sigue existiendo para drafts y contexto de sesión (mismo hook, misma ubicación).
- Cuando algo en auto-memory sobrevive 2+ sesiones y aplica a Centinelia (no personal) → se promueve al brain manualmente.
- `MEMORY.md` local: entradas que ya están en `.brain/` se marcan `→ .brain/<path>` y se limpian gradualmente.
- **Regla de conflicto**: cuando `.brain/` y auto-memory dicen cosas distintas, `.brain/` gana. Auto-memory desactualizada se borra.

### Interacción con skills instaladas

- Fase 0: no se tocan. Los triggers siguen viniendo del skill loader de Claude Code.
- Fase 1+: cuando la skill se adelgaza, su contenido se vuelve `Ver .brain/skills/<slug>.md para el procedimiento completo`.

## Rollout

### Fase 0 (esta sesión - SHIPPED)

Archivos creados:
- `.brain/README.md` (mapa)
- `.brain/skills/adding-a-meerkat-tool.md` (piloto)
- `.brain/policies/tool-completeness.md` (5 reglas)
- `.brain/decisions/2026-08-18-3-canales-obligatorio.md`
- `.brain/decisions/2026-08-18-feature-flag-por-org.md`
- `.brain/people/nazre.md`
- `.brain/learnings.md` (con 1 entrada: bug Nox `create_document template=factura`)
- `docs/superpowers/specs/2026-08-26-centinelia-brain-design.md` (este spec)

Total: 8 archivos nuevos. Cero cambios de código Centinelia.

### Fase 1 (siguiente sesión que agregue un tool)

- Invocar `.brain/skills/adding-a-meerkat-tool.md` explícitamente antes de tocar código.
- Seguir checklist.
- Si algo falla o falta → PR al brain con la corrección + entrada en `learnings.md`.

### Fase 2 (semanas siguientes - pull-based, sin plan cerrado)

Se agregan solo cuando toque el tema en sesión real. Candidatos naturales priorizados:

1. `skills/adding-a-meerkat-role.md` (role_requests pipeline)
2. `skills/shipping-a-cron.md` (52 crons activos)
3. `workers/weekly-vercel-cost-audit.md`
4. `policies/portal-security.md` (pointer al skill existente `centinelia-portal-security`)
5. `policies/copy-spanish.md` (pointer a `centinelia-copy-guidelines`)

## Success criteria (verificación end-to-end)

| Métrica | Cómo medirla | Meta a 4 semanas |
|---|---|---|
| Skill piloto invocada correctamente | Asistente dice "invocando `.brain/skills/adding-a-meerkat-tool.md`" antes de tool work | ≥80% de tool-work sessions |
| Correcciones que van al brain | `git log .brain/` desde 2026-08-26 | ≥1 commit/semana |
| Re-explicaciones evitadas | Anecdótico: veces que Nazre no tuvo que repetir una regla ya en brain | Bajar a la mitad |
| Bit-rot | Archivos con `last_verified` >90 días sin re-verificar | 0 |

**Verificación inmediata (Fase 0):**
1. `ls C:\Users\Nazre\centinelia\.brain\` - los 6 archivos raíz + 3 subcarpetas existen.
2. Abrir `.brain/README.md` - un agente que lo lee sabe a qué carpeta ir para "agregar un tool a un meerkat".
3. Abrir `.brain/skills/adding-a-meerkat-tool.md` - checklist ejecutable, links resuelven a archivos que existen.
4. `git status` en centinelia - todos los archivos del brain aparecen como untracked/nuevos, listos para primer commit.

## Riesgos

1. **Brain se convierte en carpeta muerta.**
   - Mitigación: el skill piloto es forcing function. Si en 4 semanas no se invocó ni una vez → mata el experimento, no expandas.
2. **Auto-memory + brain contradicen.**
   - Mitigación: regla explícita en README (`.brain/` gana).
3. **Over-engineering: crear carpetas sin uso real.**
   - Mitigación: Fase 0 solo crea las 3 carpetas que sí tienen contenido (`decisions/`, `policies/`, `skills/`, `people/`). `workers/` y `projects/` NO se crean vacías.
4. **Duplicación con skills existentes.**
   - Mitigación: Fase 0 no toca skills. Solo Fase 1+ adelgaza contenido, dejando skill como trigger.

## Referencias

- Artículo inspirador (HQ / vibe-marketer): concepto de "company brain" con memory + judgment + capability + learning.
- Auto-memory actual: `C:\Users\Nazre\.claude\projects\C--Users-Nazre\memory\MEMORY.md`
- Skills existentes: `.claude/skills/centinelia-*` en repo + `~/.claude/skills/centinelia-*` local.
- Fuentes que alimentan Fase 0: `feedback_tool_bloat_reglas.md`, `feedback_tool_3_canales.md`, `feedback_3channel_tools.md`, `handoff_post_flujo_manual_pendientes.md`, `feedback_tool_distribution_intentional.md`, `user_identity.md`.
