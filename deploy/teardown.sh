#!/bin/bash
# ===== Teardown AWS Infrastructure — Stan Edition =====
# Removes all resources created by setup-infra.sh
# Usage: ./deploy/teardown.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/infra-config.env"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Config not found: ${CONFIG_FILE}"
  exit 1
fi

source "$CONFIG_FILE"

echo "⚠️  This will DELETE all AWS resources for ${CLUSTER_NAME}"
read -p "Type 'yes' to confirm: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "→ Deleting ECS service..."
aws ecs update-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --desired-count 0 --region "$AWS_REGION" > /dev/null 2>&1 || true
aws ecs delete-service --cluster "$CLUSTER_NAME" --service "$SERVICE_NAME" --force --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting ECS cluster..."
aws ecs delete-cluster --cluster "$CLUSTER_NAME" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting ALB listener..."
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --query 'Listeners[0].ListenerArn' --output text --region "$AWS_REGION" 2>/dev/null) || true
if [ -n "$LISTENER_ARN" ] && [ "$LISTENER_ARN" != "None" ]; then
  aws elbv2 delete-listener --listener-arn "$LISTENER_ARN" --region "$AWS_REGION" > /dev/null 2>&1 || true
fi

echo "→ Deleting target group..."
aws elbv2 delete-target-group --target-group-arn "$TG_ARN" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting ALB..."
aws elbv2 delete-load-balancer --load-balancer-arn "$ALB_ARN" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Waiting for ALB deletion (30s)..."
sleep 30

echo "→ Deleting security groups..."
aws ec2 delete-security-group --group-id "$ECS_SG" --region "$AWS_REGION" > /dev/null 2>&1 || true
aws ec2 delete-security-group --group-id "$ALB_SG" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting subnets..."
aws ec2 delete-subnet --subnet-id "$SUBNET_1" --region "$AWS_REGION" > /dev/null 2>&1 || true
aws ec2 delete-subnet --subnet-id "$SUBNET_2" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting route table..."
RTB_ID=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=${VPC_ID}" "Name=tag:Name,Values=*public-rt*" --query 'RouteTables[0].RouteTableId' --output text --region "$AWS_REGION" 2>/dev/null) || true
if [ -n "$RTB_ID" ] && [ "$RTB_ID" != "None" ]; then
  ASSOC_IDS=$(aws ec2 describe-route-tables --route-table-ids "$RTB_ID" --query 'RouteTables[0].Associations[].RouteTableAssociationId' --output text --region "$AWS_REGION" 2>/dev/null) || true
  for ASSOC in $ASSOC_IDS; do
    aws ec2 disassociate-route-table --association-id "$ASSOC" --region "$AWS_REGION" > /dev/null 2>&1 || true
  done
  aws ec2 delete-route-table --route-table-id "$RTB_ID" --region "$AWS_REGION" > /dev/null 2>&1 || true
fi

echo "→ Detaching and deleting internet gateway..."
IGW_ID=$(aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=${VPC_ID}" --query 'InternetGateways[0].InternetGatewayId' --output text --region "$AWS_REGION" 2>/dev/null) || true
if [ -n "$IGW_ID" ] && [ "$IGW_ID" != "None" ]; then
  aws ec2 detach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$AWS_REGION" > /dev/null 2>&1 || true
  aws ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID" --region "$AWS_REGION" > /dev/null 2>&1 || true
fi

echo "→ Deleting VPC..."
aws ec2 delete-vpc --vpc-id "$VPC_ID" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting ECR repository..."
aws ecr delete-repository --repository-name "aia-stan-prod-dashboard" --force --region "$AWS_REGION" > /dev/null 2>&1 || true

echo "→ Deleting CloudWatch log group..."
aws logs delete-log-group --log-group-name "/ecs/aia-stan-prod" --region "$AWS_REGION" > /dev/null 2>&1 || true

echo ""
echo "✅ Teardown complete. IAM roles retained for reuse."
echo "   To delete IAM roles: aws iam delete-role --role-name aia-ecs-execution-role"
echo ""
