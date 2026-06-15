#!/usr/bin/env bash
# ── Config-driven deploy to GCP Cloud Run ──────────────────────────────────────
#
# Usage:  ./scripts/deploy.sh
#
# Reads project, GCP, and service config from config.js automatically.
# Only prompts for secrets (DB password, admin password, SMTP).
#
# Prerequisites:
#   - gcloud CLI authenticated with the target project
#   - Cloud SQL instance created (run setup.sh first)
#   - Docker / Cloud Build enabled in the GCP project
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Read config from config.js ─────────────────────────────────────────────────
PROJECT_ID=$(node -e "const c=require('./config');console.log(c.gcp.projectId)")
REGION=$(node -e "const c=require('./config');console.log(c.gcp.region)")
SERVICE_NAME=$(node -e "const c=require('./config');console.log(c.gcp.serviceName)")
CLOUD_SQL_INSTANCE=$(node -e "const c=require('./config');console.log(c.gcp.cloudSqlInstance||'')")
DB_NAME=$(node -e "const c=require('./config');console.log(c.database.name)")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploy: $SERVICE_NAME"
echo "  Project: $PROJECT_ID  |  Region: $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -z "$CLOUD_SQL_INSTANCE" ]; then
  echo "ERROR: gcp.cloudSqlInstance is not set in config.js"
  echo "Run ./scripts/setup.sh first, then copy the instance connection name into config.js"
  exit 1
fi

# ── Prompt for secrets (skip if already set as env vars) ──────────────────────
if [ -z "${DB_PASSWORD:-}" ]; then
  read -rsp "DB password (postgres user): " DB_PASSWORD; echo ""
fi
if [ -z "${ADMIN_PASSWORD:-}" ]; then
  read -rsp "Admin panel password:        " ADMIN_PASSWORD; echo ""
fi

# ── Build DATABASE_URL (Cloud SQL socket) ──────────────────────────────────────
ENC_PASSWORD=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1],safe=''))" "$DB_PASSWORD")
DATABASE_URL="postgres://postgres:${ENC_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_INSTANCE}"

echo ""
echo "Submitting Cloud Build..."
gcloud builds submit \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions=\
"_SERVICE_NAME=$SERVICE_NAME,\
_REGION=$REGION,\
_CLOUD_SQL_INSTANCE=$CLOUD_SQL_INSTANCE,\
_DATABASE_URL=$DATABASE_URL,\
_ADMIN_PASSWORD=$ADMIN_PASSWORD" \
  .

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "(run 'gcloud run services describe $SERVICE_NAME' to get URL)")
echo "  Deployed: $SERVICE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
