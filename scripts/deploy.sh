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
EMAIL_FROM=$(node -e "const c=require('./config');console.log((process.env.EMAIL_FROM||c.email.from))")
NOTIFY_EMAIL=$(node -e "const c=require('./config');const e=c.email.notifyEmails||[];console.log(process.env.NOTIFY_EMAIL||e[0]||'')")
NOTIFY_EMAIL_2=$(node -e "const c=require('./config');const e=c.email.notifyEmails||[];console.log(process.env.NOTIFY_EMAIL_2||e[1]||'')")

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

# ── Prompt for secrets ─────────────────────────────────────────────────────────
read -rsp "DB password (postgres user): " DB_PASSWORD; echo ""
read -rsp "Admin panel password:        " ADMIN_PASSWORD; echo ""

read -rp  "SMTP host (leave blank to skip email): " SMTP_HOST
SMTP_PORT="587"; SMTP_SECURE="false"; SMTP_USER=""; SMTP_PASS=""
if [ -n "$SMTP_HOST" ]; then
  read -rp  "SMTP port [587]: " _port; SMTP_PORT="${_port:-587}"
  read -rsp "SMTP user: " SMTP_USER; echo ""
  read -rsp "SMTP pass: " SMTP_PASS; echo ""
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
_ADMIN_PASSWORD=$ADMIN_PASSWORD,\
_SMTP_HOST=$SMTP_HOST,\
_SMTP_PORT=$SMTP_PORT,\
_SMTP_SECURE=$SMTP_SECURE,\
_SMTP_USER=$SMTP_USER,\
_SMTP_PASS=$SMTP_PASS,\
_EMAIL_FROM=$EMAIL_FROM,\
_NOTIFY_EMAIL=$NOTIFY_EMAIL,\
_NOTIFY_EMAIL_2=$NOTIFY_EMAIL_2" \
  .

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "(run 'gcloud run services describe $SERVICE_NAME' to get URL)")
echo "  Deployed: $SERVICE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
