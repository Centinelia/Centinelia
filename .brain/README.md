# Centinelia Brain - Company Map

**Este NO es un índice. Es un mapa.**
Un índice lista todo. Un mapa te dice a dónde ir según lo que necesitas hacer.

Si eres un agente (Claude Code, Cursor, Codex, o un humano nuevo en el equipo), lee este archivo **completo** antes de tocar nada. Luego entra solo a las carpetas que tu tarea necesita.

---

## Qué es Centinelia

SaaS de **empleados digitales** (meerkats) para PYMEs mexicanas. Cada meerkat trabaja en 3 canales simultáneos: **voz** (Vapi), **chat** (portal cliente) y **correo** (inbox-processor). Roster actual: Nia (recepcionista), Nox (admin), Niva (director), Nova, Neo, Naia (director híbrido). Owner único: Nazre.

Stack: Next.js 15, Supabase (Postgres + storage + auth), Vapi para voz, Anthropic Claude para razonamiento en chat/email, Vercel para deploy.

---

## Qué importa ahora

1. **Piloto AC Proyectos** - técnico completo, bloqueado por migración QB Desktop→Online del cliente.
2. **Piloto Tortillería MTY** - empleado facturación con adaptador CONTPAQi Comercial. Trial instalado, Fase 0 completa.
3. **Cero deuda técnica** - todo bug o gap detectado en sesión se arregla en la misma sesión.

---

## Orden de fuentes (cuando algo entra en conflicto)

1. **Código en `src/`** - verdad ejecutable del comportamiento actual.
2. **Base de datos Supabase** - verdad de estado (orgs, features, ledger, etc.).
3. **`.brain/decisions/`** - por qué se decidieron cosas (histórico inmutable).
4. **`.brain/projects/`** - dónde va cada iniciativa hoy.
5. **`.brain/policies/`** - reglas duras que aplican siempre.
6. **Auto-memory local** (`~/.claude/projects/.../memory/`) - solo si no está en `.brain/`. Si contradice al brain, brain gana.

---

## Navegación por tarea

### "Voy a agregar/modificar/quitar una tool de un meerkat"
→ `skills/adding-a-meerkat-tool.md` (checklist ejecutable)
→ `policies/tool-completeness.md` (las 5 reglas del bloat)
→ `decisions/2026-08-18-3-canales-obligatorio.md` (por qué siempre los 3 canales)
→ `decisions/2026-08-18-feature-flag-por-org.md` (por qué feature flag)

### "Voy a tomar una decisión de producto / arquitectura importante"
→ Revisa `decisions/` para ver si algo relacionado ya se decidió.
→ Si tu decisión reemplaza una anterior, crea un archivo nuevo con `supersedes: <old-slug>` y edita el anterior para agregarle `replaced_by: <new-slug>`. **Nunca edites decisiones históricas.**

### "Necesito saber cómo hacer X reglamentado"
→ `policies/` - reglas duras que aplican siempre.
→ Si tu regla no está ahí y es dura → agrégala vía PR.

### "Necesito saber quién decide qué"
→ `people/nazre.md` - owner único hoy. Todas las aprobaciones vienen de él.

### "Necesito el estado actual de un proyecto/piloto"
→ `projects/` (vacía en Fase 0 - se migra pull-based desde `handoff_*.md` de auto-memory).
→ Mientras tanto: `~/.claude/projects/.../memory/handoff_*.md` sigue siendo la fuente.

### "Voy a ejecutar un job repetible end-to-end"
→ `workers/` (vacía en Fase 0 - crear al primer worker real).

### "Encontré un bug o hice una corrección importante"
→ Si el modelo mental cambió o algo se va a repetir → agregar entrada a `learnings.md` + ajustar la capa correspondiente (policy / skill / decision) via PR.
→ Si es un fix puntual sin patrón → commit normal, no toca `.brain/`.

---

## Carpetas del brain

- `decisions/` - inmutables con fecha (`YYYY-MM-DD-<slug>.md`). Reemplazos via `replaced_by`, historial intacto.
- `policies/` - reglas mutables que aplican siempre. Cada policy tiene **Por qué** + **Cómo aplicar**.
- `skills/` - procesos ejecutables navegables. Cada skill tiene inputs, checklist, y "cuándo NO usar".
- `people/` - owners y approval boundaries.
- `learnings.md` - append-only. Correcciones revisadas con fecha + lección extraída + link a la capa afectada.
- (`workers/`, `projects/`) - se crean cuando llega su primer archivo. No existen vacías.

---

## Reglas duras del brain

1. **Usa siempre la información más reciente aprobada.** Fecha en frontmatter es autoridad.
2. **Cuando dos fuentes contradicen, sigue el orden de fuentes** de arriba.
3. **Si la respuesta no está aquí, dilo.** No inventes. No conviertas una suposición en conocimiento de la empresa.
4. **`decisions/` NUNCA se edita.** Se crea nuevo con `replaced_by`.
5. **Toda corrección al brain va por PR.** Nunca commit directo a main sin review - un typo en `policies/` afecta a todos los agentes futuros.
6. **No agregues carpetas vacías.** `workers/` y `projects/` nacen con su primer archivo.

---

## Interacción con skills instaladas

Las skills en `.claude/skills/centinelia-*` (repo) y `~/.claude/skills/centinelia-*` (local) siguen siendo los **triggers**. Su contenido eventualmente se adelgaza a un pointer al brain. En Fase 0 no se tocan.

## Interacción con auto-memory

Auto-memory local (`~/.claude/projects/C--Users-Nazre/memory/`) sigue siendo scratch personal + drafts + contexto de sesión. Cuando algo sobrevive 2+ sesiones y aplica a Centinelia (no es personal), promoverlo al brain via PR. `MEMORY.md` local se limpia gradualmente marcando entradas ya migradas.
