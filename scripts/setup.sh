#!/usr/bin/env bash
# ── One-time GCP project setup ─────────────────────────────────────────────────
#
# Usage:  ./scripts/setup.sh
#
# What this does:
#   1. Sets gcloud to the project in config.js
#   2. Enables required GCP APIs
#   3. Creates a Cloud SQL (Postgres 15) instance
#   4. Creates the database
#   5. Sets Cloud Run IAM + Cloud SQL client permissions
#   6. Prints the INSTANCE_CONNECTION_NAME to put in config.js
#
# Run this ONCE per project, then update config.js with the instance name.
# After that, use deploy.sh for all subsequent deploys.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Read config ────────────────────────────────────────────────────────────────
PROJECT_ID=$(node -e "const c=require('./config');console.log(c.gcp.projectId)")
REGION=$(node -e "const c=require('./config');console.log(c.gcp.region)")
SLUG=$(node -e "const c=require('./config');console.log(c.project.slug)")
DB_NAME=$(node -e "const c=require('./config');console.log(c.database.name)")
PROJECT_NAME=$(node -e "const c=require('./config');console.log(c.project.name)")

SQL_INSTANCE="${SLUG}-db"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  One-time setup: $PROJECT_NAME"
echo "  GCP Project:    $PROJECT_ID"
echo "  Region:         $REGION"
echo "  Cloud SQL:      $SQL_INSTANCE"
echo "  Database:       $DB_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -rsp "Postgres password for 'postgres' user: " DB_PASSWORD; echo ""
echo ""

# ── 1. Set gcloud project ──────────────────────────────────────────────────────
echo "[1/6] Setting gcloud project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# ── 2. Enable APIs ─────────────────────────────────────────────────────────────
echo "[2/6] Enabling required APIs (this may take a minute)..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project="$PROJECT_ID"
echo "      APIs enabled."

# ── 3. Create Cloud SQL instance ───────────────────────────────────────────────
echo "[3/6] Creating Cloud SQL instance '$SQL_INSTANCE' (Postgres 15)..."
echo "      This takes 3-5 minutes..."

if gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
  echo "      Instance already exists — skipping creation."
else
  gcloud sql instances create "$SQL_INSTANCE" \
    --project="$PROJECT_ID" \
    --database-version=POSTGRES_15 \
    --region="$REGION" \
    --tier=db-f1-micro \
    --storage-auto-increase \
    --no-assign-ip \
    --root-password="$DB_PASSWORD"
  echo "      Instance created."
fi

# ── 4. Create database ─────────────────────────────────────────────────────────
echo "[4/6] Creating database '$DB_NAME'..."
if gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
  echo "      Database already exists — skipping."
else
  gcloud sql databases create "$DB_NAME" \
    --instance="$SQL_INSTANCE" \
    --project="$PROJECT_ID"
  echo "      Database created."
fi

# ── 5. IAM permissions ─────────────────────────────────────────────────────────
echo "[5/6] Setting up IAM permissions for Cloud Run..."

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for SA in "$CLOUD_RUN_SA" "$CLOUD_BUILD_SA"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" \
    --role="roles/cloudsql.client" \
    --quiet 2>/dev/null || true
done

# Cloud Build needs to deploy Cloud Run
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin" \
  --quiet 2>/dev/null || true

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet 2>/dev/null || true

echo "      IAM configured."

# ── 6. Print instance connection name ──────────────────────────────────────────
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe "$SQL_INSTANCE" \
  --project="$PROJECT_ID" \
  --format="value(connectionName)")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "[6/6] Setup complete!"
echo ""
echo "  NEXT STEP: Update config.js with the Cloud SQL instance:"
echo ""
echo "  gcp: {"
echo "    cloudSqlInstance: '${INSTANCE_CONNECTION_NAME}',"
echo "  }"
echo ""
echo "  Then run:  ./scripts/deploy.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
