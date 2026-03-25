#!/bin/bash
# ===== Build, Push & Deploy — Stan Edition CFO Dashboard =====
# Builds Docker image, pushes to ECR, updates ECS service
#
# Usage: ./deploy/deploy.sh
# Requires: deploy/infra-config.env (created by setup-infra.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${SCRIPT_DIR}/infra-config.env"

# Load infrastructure config
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Config file not found: ${CONFIG_FILE}"
  echo "   Run ./deploy/setup-infra.sh first."
  exit 1
fi

source "$CONFIG_FILE"

echo "============================================"
echo "  Deploy — Stan Edition CFO Dashboard"
echo "  Region: ${AWS_REGION}"
echo "  ECR:    ${ECR_URI}"
echo "============================================"
echo ""

# ===== 1. DOCKER LOGIN TO ECR =====
echo "→ [1/4] Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
echo "  ✓ ECR login successful"

# ===== 2. BUILD DOCKER IMAGE =====
echo "→ [2/4] Building Docker image..."
cd "$PROJECT_DIR"
docker build --platform linux/amd64 -t "${ECR_URI}:latest" .
echo "  ✓ Image built"

# ===== 3. PUSH TO ECR =====
echo "→ [3/4] Pushing image to ECR..."
docker push "${ECR_URI}:latest"

# Also tag with timestamp for rollback
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker tag "${ECR_URI}:latest" "${ECR_URI}:${TIMESTAMP}"
docker push "${ECR_URI}:${TIMESTAMP}"
echo "  ✓ Pushed: latest + ${TIMESTAMP}"

# ===== 4. UPDATE ECS SERVICE (force new deployment) =====
echo "→ [4/4] Updating ECS service..."
aws ecs update-service \
  --cluster "$CLUSTER_NAME" \
  --service "$SERVICE_NAME" \
  --force-new-deployment \
  --region "$AWS_REGION" > /dev/null
echo "  ✓ Deployment triggered"

echo ""
echo "============================================"
echo "  ✅ Deployment complete!"
echo "============================================"
echo ""
echo "  Image: ${ECR_URI}:${TIMESTAMP}"
echo "  ALB:   http://${ALB_DNS}"
echo ""
echo "  ECS will pull the new image and restart the container."
echo "  Monitor: aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_REGION}"
echo ""
