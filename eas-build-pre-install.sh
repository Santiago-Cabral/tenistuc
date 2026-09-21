#!/usr/bin/env bash
set -euo pipefail

if [ -n "${GOOGLE_SERVICES_FILE:-}" ] && [ -f "${GOOGLE_SERVICES_FILE}" ]; then
  cp "${GOOGLE_SERVICES_FILE}" ./google-services.json
  echo "✅ google-services.json copiado desde ${GOOGLE_SERVICES_FILE}"
else
  echo "⚠️ GOOGLE_SERVICES_FILE no seteado o archivo no existe"
fi