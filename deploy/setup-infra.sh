#!/bin/bash
# ===== AWS ECS Infrastructure Setup — Stan Edition CFO Dashboard =====
# Creates: VPC, Subnets, IGW, Route Tables, Security Groups, ALB, Target Group,
#          ECR Repository, ECS Cluster, Task Definition, ECS Service
#
# Usage: AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=yyy ./deploy/setup-infra.sh
# Or:    export AWS_ACCESS_KEY_ID=xxx && export AWS_SECRET_ACCESS_KEY=yyy && ./deploy/setup-infra.sh

set -euo pipefail

# ===== CONFIGURATION =====
REGION="${AWS_REGION:-ap-south-1}"
PROJECT="aia-stan"
ENV_NAME="prod"
PREFIX="${PROJECT}-${ENV_NAME}"

# Networking
VPC_CIDR="10.0.0.0/16"
PUBLIC_SUBNET_1_CIDR="10.0.1.0/24"
PUBLIC_SUBNET_2_CIDR="10.0.2.0/24"

# Container
CONTAINER_PORT=3000
IMAGE_NAME="${PREFIX}-dashboard"
TASK_CPU=256       # 0.25 vCPU (Fargate minimum)
TASK_MEMORY=512    # 512 MB
DESIRED_COUNT=1    # Single instance to start (scale later)

# Database URL — will be set as ECS environment variable
DATABASE_URL="${DATABASE_URL:-}"

echo "============================================"
echo "  AWS ECS Deployment — ${PREFIX}"
echo "  Region: ${REGION}"
echo "============================================"
echo ""

# ===== VERIFY AWS CLI =====
if ! command -v aws &> /dev/null; then
  echo "❌ AWS CLI not installed. Install: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
  exit 1
fi

# Verify credentials
echo "→ Verifying AWS credentials..."
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text --region "$REGION" 2>/dev/null) || {
  echo "❌ AWS credentials invalid or expired. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."
  exit 1
}
echo "  ✓ Account: ${ACCOUNT_ID}"

# Get AZs
AZ1=$(aws ec2 describe-availability-zones --region "$REGION" --query 'AvailabilityZones[0].ZoneName' --output text)
AZ2=$(aws ec2 describe-availability-zones --region "$REGION" --query 'AvailabilityZones[1].ZoneName' --output text)
echo "  ✓ AZs: ${AZ1}, ${AZ2}"
echo ""

# ===== 1. VPC =====
echo "→ [1/10] Creating VPC..."
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block "$VPC_CIDR" \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${PREFIX}-vpc}]" \
  --query 'Vpc.VpcId' --output text --region "$REGION")
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support --region "$REGION"
aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames --region "$REGION"
echo "  ✓ VPC: ${VPC_ID}"

# ===== 2. SUBNETS =====
echo "→ [2/10] Creating subnets..."
SUBNET_1=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --cidr-block "$PUBLIC_SUBNET_1_CIDR" --availability-zone "$AZ1" \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PREFIX}-public-1}]" \
  --query 'Subnet.SubnetId' --output text --region "$REGION")
SUBNET_2=$(aws ec2 create-subnet \
  --vpc-id "$VPC_ID" --cidr-block "$PUBLIC_SUBNET_2_CIDR" --availability-zone "$AZ2" \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${PREFIX}-public-2}]" \
  --query 'Subnet.SubnetId' --output text --region "$REGION")
# Enable auto-assign public IPs (needed for Fargate with public subnets)
aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_1" --map-public-ip-on-launch --region "$REGION"
aws ec2 modify-subnet-attribute --subnet-id "$SUBNET_2" --map-public-ip-on-launch --region "$REGION"
echo "  ✓ Subnets: ${SUBNET_1}, ${SUBNET_2}"

# ===== 3. INTERNET GATEWAY =====
echo "→ [3/10] Creating Internet Gateway..."
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${PREFIX}-igw}]" \
  --query 'InternetGateway.InternetGatewayId' --output text --region "$REGION")
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$REGION"
echo "  ✓ IGW: ${IGW_ID}"

# ===== 4. ROUTE TABLE =====
echo "→ [4/10] Creating route table..."
RTB_ID=$(aws ec2 create-route-table \
  --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${PREFIX}-public-rt}]" \
  --query 'RouteTable.RouteTableId' --output text --region "$REGION")
aws ec2 create-route --route-table-id "$RTB_ID" --destination-cidr-block "0.0.0.0/0" --gateway-id "$IGW_ID" --region "$REGION" > /dev/null
aws ec2 associate-route-table --route-table-id "$RTB_ID" --subnet-id "$SUBNET_1" --region "$REGION" > /dev/null
aws ec2 associate-route-table --route-table-id "$RTB_ID" --subnet-id "$SUBNET_2" --region "$REGION" > /dev/null
echo "  ✓ Route table: ${RTB_ID}"

# ===== 5. SECURITY GROUPS =====
echo "→ [5/10] Creating security groups..."

# ALB Security Group — allows HTTP from anywhere
ALB_SG=$(aws ec2 create-security-group \
  --group-name "${PREFIX}-alb-sg" --description "ALB - allow HTTP/HTTPS from internet" \
  --vpc-id "$VPC_ID" --query 'GroupId' --output text --region "$REGION")
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 80 --cidr "0.0.0.0/0" --region "$REGION" > /dev/null
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 443 --cidr "0.0.0.0/0" --region "$REGION" > /dev/null
aws ec2 create-tags --resources "$ALB_SG" --tags "Key=Name,Value=${PREFIX}-alb-sg" --region "$REGION"

# ECS Security Group — allows traffic only from ALB
ECS_SG=$(aws ec2 create-security-group \
  --group-name "${PREFIX}-ecs-sg" --description "ECS tasks - allow from ALB only" \
  --vpc-id "$VPC_ID" --query 'GroupId' --output text --region "$REGION")
aws ec2 authorize-security-group-ingress --group-id "$ECS_SG" --protocol tcp --port "$CONTAINER_PORT" --source-group "$ALB_SG" --region "$REGION" > /dev/null
aws ec2 create-tags --resources "$ECS_SG" --tags "Key=Name,Value=${PREFIX}-ecs-sg" --region "$REGION"

echo "  ✓ ALB SG: ${ALB_SG}"
echo "  ✓ ECS SG: ${ECS_SG}"

# ===== 6. APPLICATION LOAD BALANCER =====
echo "→ [6/10] Creating ALB + Target Group..."

ALB_ARN=$(aws elbv2 create-load-balancer \
  --name "${PREFIX}-alb" --type application --scheme internet-facing \
  --subnets "$SUBNET_1" "$SUBNET_2" --security-groups "$ALB_SG" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text --region "$REGION")

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --query 'LoadBalancers[0].DNSName' --output text --region "$REGION")

# Target Group (IP type for Fargate)
TG_ARN=$(aws elbv2 create-target-group \
  --name "${PREFIX}-tg" --protocol HTTP --port "$CONTAINER_PORT" \
  --vpc-id "$VPC_ID" --target-type ip \
  --health-check-protocol HTTP --health-check-path "/health" \
  --health-check-interval-seconds 30 --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region "$REGION")

# Listener — HTTP on port 80
aws elbv2 create-listener \
  --load-balancer-arn "$ALB_ARN" --protocol HTTP --port 80 \
  --default-actions "Type=forward,TargetGroupArn=${TG_ARN}" \
  --region "$REGION" > /dev/null

echo "  ✓ ALB: ${ALB_DNS}"
echo "  ✓ Target Group: ${TG_ARN}"

# ===== 7. ECR REPOSITORY =====
echo "→ [7/10] Creating ECR repository..."
ECR_URI=$(aws ecr create-repository \
  --repository-name "$IMAGE_NAME" \
  --image-scanning-configuration scanOnPush=true \
  --query 'repository.repositoryUri' --output text --region "$REGION" 2>/dev/null) || \
ECR_URI=$(aws ecr describe-repositories \
  --repository-names "$IMAGE_NAME" \
  --query 'repositories[0].repositoryUri' --output text --region "$REGION")
echo "  ✓ ECR: ${ECR_URI}"

# ===== 8. IAM ROLES =====
echo "→ [8/10] Creating IAM roles..."

# ECS Task Execution Role (for pulling images + logging)
cat > /tmp/ecs-trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "ecs-tasks.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

EXEC_ROLE_ARN=$(aws iam create-role \
  --role-name "aia-ecs-execution-role" \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
  --query 'Role.Arn' --output text 2>/dev/null) || \
EXEC_ROLE_ARN=$(aws iam get-role --role-name "aia-ecs-execution-role" --query 'Role.Arn' --output text)

aws iam attach-role-policy --role-name "aia-ecs-execution-role" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy" 2>/dev/null || true

# Task Role (for app to access AWS services if needed)
TASK_ROLE_ARN=$(aws iam create-role \
  --role-name "aia-ecs-task-role" \
  --assume-role-policy-document file:///tmp/ecs-trust-policy.json \
  --query 'Role.Arn' --output text 2>/dev/null) || \
TASK_ROLE_ARN=$(aws iam get-role --role-name "aia-ecs-task-role" --query 'Role.Arn' --output text)

echo "  ✓ Execution Role: ${EXEC_ROLE_ARN}"
echo "  ✓ Task Role: ${TASK_ROLE_ARN}"

# ===== 9. CLOUDWATCH LOG GROUP =====
echo "→ [9/10] Creating CloudWatch log group..."
aws logs create-log-group --log-group-name "/ecs/${PREFIX}" --region "$REGION" 2>/dev/null || true
echo "  ✓ Log group: /ecs/${PREFIX}"

# ===== 10. ECS CLUSTER + TASK + SERVICE =====
echo "→ [10/10] Creating ECS cluster, task definition, and service..."

# Cluster
CLUSTER_ARN=$(aws ecs create-cluster \
  --cluster-name "${PREFIX}-cluster" \
  --query 'cluster.clusterArn' --output text --region "$REGION")
echo "  ✓ Cluster: ${PREFIX}-cluster"

# Wait for IAM role propagation
echo "  ⏳ Waiting for IAM role propagation (15s)..."
sleep 15

# Task Definition
cat > /tmp/task-def.json << EOF
{
  "family": "${PREFIX}-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${TASK_CPU}",
  "memory": "${TASK_MEMORY}",
  "executionRoleArn": "${EXEC_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "containerDefinitions": [
    {
      "name": "${PREFIX}-container",
      "image": "${ECR_URI}:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": ${CONTAINER_PORT},
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "${CONTAINER_PORT}" },
        { "name": "DATABASE_URL", "value": "${DATABASE_URL}" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/${PREFIX}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:${CONTAINER_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 10
      }
    }
  ]
}
EOF

TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def.json \
  --query 'taskDefinition.taskDefinitionArn' --output text --region "$REGION")
echo "  ✓ Task Definition: ${TASK_DEF_ARN}"

# Service
aws ecs create-service \
  --cluster "${PREFIX}-cluster" \
  --service-name "${PREFIX}-service" \
  --task-definition "${PREFIX}-task" \
  --desired-count "$DESIRED_COUNT" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_1},${SUBNET_2}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=${TG_ARN},containerName=${PREFIX}-container,containerPort=${CONTAINER_PORT}" \
  --region "$REGION" > /dev/null
echo "  ✓ Service: ${PREFIX}-service"

# ===== SAVE CONFIG =====
CONFIG_FILE="deploy/infra-config.env"
cat > "$CONFIG_FILE" << EOF
# Generated by setup-infra.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
AWS_REGION=${REGION}
AWS_ACCOUNT_ID=${ACCOUNT_ID}
VPC_ID=${VPC_ID}
SUBNET_1=${SUBNET_1}
SUBNET_2=${SUBNET_2}
ALB_ARN=${ALB_ARN}
ALB_DNS=${ALB_DNS}
TG_ARN=${TG_ARN}
ALB_SG=${ALB_SG}
ECS_SG=${ECS_SG}
ECR_URI=${ECR_URI}
CLUSTER_NAME=${PREFIX}-cluster
SERVICE_NAME=${PREFIX}-service
TASK_FAMILY=${PREFIX}-task
CONTAINER_NAME=${PREFIX}-container
EXEC_ROLE_ARN=${EXEC_ROLE_ARN}
TASK_ROLE_ARN=${TASK_ROLE_ARN}
CONTAINER_PORT=${CONTAINER_PORT}
EOF

echo ""
echo "============================================"
echo "  ✅ Infrastructure created successfully!"
echo "============================================"
echo ""
echo "  ALB URL:  http://${ALB_DNS}"
echo "  ECR Repo: ${ECR_URI}"
echo "  Cluster:  ${PREFIX}-cluster"
echo "  Service:  ${PREFIX}-service"
echo ""
echo "  Config saved to: ${CONFIG_FILE}"
echo ""
echo "  Next step: Run ./deploy/deploy.sh to build and push the Docker image"
echo ""
echo "  Cloudflare setup:"
echo "  → Add CNAME: stan.aiaccountant.com → ${ALB_DNS}"
echo "  → Or update your Worker upstream to: http://${ALB_DNS}"
echo ""
