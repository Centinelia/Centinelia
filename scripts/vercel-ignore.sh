#!/usr/bin/env bash
# Vercel ignoreCommand — decide si SKIPear el build.
#
# exit 0 = ignore (skip build)
# exit 1 = don't ignore (do build)
#
# Reglas (en orden):
#  1. Si el commit message contiene [force-build] o [env], BUILD siempre.
#     Escape hatch para forzar build sin cambiar código (ej. env vars nuevas).
#  2. Si DIFF vacío (empty commit, redeploy), BUILD.
#  3. Si algún archivo del DIFF NO está en carpetas excluded, BUILD.
#  4. Si TODOS los archivos están en excluded (docs, migrations, scripts, etc.),
#     SKIP para ahorrar Vercel Build CPU (regla project_centinelia_vercel_costs).

set -u

# 1. Escape hatch en commit message
if git log -1 --pretty=%B | grep -qE '\[force-build\]|\[env\]'; then
  exit 1
fi

# 2. DIFF entre commit anterior y HEAD
PREV="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
DIFF=$(git diff --name-only "$PREV" HEAD 2>/dev/null)

if [ -z "$DIFF" ]; then
  exit 1
fi

# 3-4. Filtrar por paths excluded
if echo "$DIFF" | grep -qvE '^(docs|\.claude|tests|sql|migrations|supabase|audit|fixtures|scripts)/|\.md$'; then
  # Hay al menos 1 archivo fuera de excluded → BUILD
  exit 1
fi

# Todo en excluded → SKIP
exit 0
