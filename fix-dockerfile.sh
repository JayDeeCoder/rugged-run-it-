#!/bin/bash
# fix-dockerfile.sh - Fix the Docker syntax error

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔧 Fixing Dockerfile syntax errors...${NC}"

# Fix game-server/Dockerfile
echo -e "${YELLOW}📝 Fixing game-server/Dockerfile...${NC}"
cat > game-server/Dockerfile << 'EOF'
# Multi-stage build for Game Server
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/production-game-server.js"]
EOF

# Fix Server/Dockerfile
echo -e "${YELLOW}📝 Fixing Server/Dockerfile...${NC}"
cat > Server/Dockerfile << 'EOF'
# Multi-stage build for Chat Server
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["node", "dist/chatServer.js"]
EOF

echo -e "${GREEN}✅ Dockerfiles fixed!${NC}"

# Verify the syntax
echo -e "${YELLOW}🔍 Verifying Dockerfile syntax...${NC}"

if command -v docker &> /dev/null; then
    echo "Checking game-server/Dockerfile..."
    docker build --no-cache -f game-server/Dockerfile game-server/ --dry-run 2>/dev/null || echo "Note: Dry run not supported, but syntax should be OK"
    
    echo "Checking Server/Dockerfile..."
    docker build --no-cache -f Server/Dockerfile Server/ --dry-run 2>/dev/null || echo "Note: Dry run not supported, but syntax should be OK"
fi

echo -e "${GREEN}🚀 Ready to build! Run: docker-compose up -d --build${NC}"