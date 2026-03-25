# ===== Stan Edition CFO Dashboard — Docker Image =====
# Lightweight Node.js container for AWS ECS Fargate

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install dependencies (production only)
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Install Express (needed for server.js — not in original package.json)
RUN npm install express

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Health check for ECS
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the Express server
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]
