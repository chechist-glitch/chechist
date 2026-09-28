#!/bin/bash
# Prepara el entorno de HyperFrames en las sesiones de Claude Code en la web:
# ffmpeg, el Chrome headless para renderizar y las skills de HyperFrames.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  (apt-get install -y ffmpeg >/dev/null 2>&1 \
    || (apt-get update >/dev/null 2>&1 && apt-get install -y ffmpeg >/dev/null 2>&1))
fi

npx --yes hyperframes@0.8.82 browser ensure >/dev/null 2>&1
npx --yes hyperframes@0.8.82 skills update >/dev/null 2>&1 || true
