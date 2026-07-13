#!/usr/bin/env bash
# ── Deploy crewlee (frontend) to GCP Cloud Run ────────────────────────────────
#
# Usage:  ./scripts/deploy.sh
#
# Reads GCP config from config.js automatically.
# Auto-detects the backend (crewlee-api) Cloud Run URL for the API_URL env var.
#
# Prerequisites:
#   - gcloud CLI authenticated
#   - crewlee-api backend already deployed (run crewlee-be/scripts/deploy.sh first)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT_ID=$(node -e "const c=require('./config');console.log(c.gcp.projectId)")
REGION=$(node    -e "const c=require('./config');console.log(c.gcp.region)")
SERVICE_NAME=$(node -e "const c=require('./config');console.log(c.gcp.serviceName)")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Deploy: $SERVICE_NAME"
echo "  Project: $PROJECT_ID  |  Region: $REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Resolve backend API URL ────────────────────────────────────────────────────
if [ -z "${API_URL:-}" ]; then
  API_URL=$(gcloud run services describe crewlee-api \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="value(status.url)" 2>/dev/null || echo "")

  if [ -n "$API_URL" ]; then
    echo "  Detected backend URL: $API_URL"
  else
    read -rp "Backend API URL (e.g. https://crewlee-api-xxx-uc.a.run.app): " API_URL
  fi
fi

echo ""
echo "  API_URL: $API_URL"
echo ""
echo "Submitting Cloud Build..."

gcloud builds submit \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  --substitutions=\
"_SERVICE_NAME=$SERVICE_NAME,\
_REGION=$REGION,\
_API_URL=$API_URL" \
  .

echo ""
echo "Making service publicly accessible..."
gcloud run services add-iam-policy-binding "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --member=allUsers \
  --role=roles/run.invoker \
  --quiet 2>/dev/null || echo "  (IAM binding skipped — may already be set or requires org policy change)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
FE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "(check gcloud run services)")
echo "  Deployed: $FE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
