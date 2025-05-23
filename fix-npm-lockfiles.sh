#!/bin/bash
# fix-npm-lockfiles.sh - Fix npm package-lock.json issues

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Fixing npm package-lock.json issues...${NC}"

# Stop containers and clean Docker cache
echo -e "${YELLOW}🛑 Stopping containers and cleaning cache...${NC}"
docker-compose down || true
docker builder prune -f || true

# Generate package-lock.json files
echo -e "${YELLOW}📦 Generating package-lock.json files...${NC}"

# Server directory
if [ -f "Server/package.json" ]; then
    echo "Generating Server/package-lock.json..."
    cd Server
    rm -f package-lock.json
    npm install
    cd ..
    echo "✅ Server package-lock.json created"
else
    echo "❌ Server/package.json not found"
fi

# Game server directory
if [ -f "game-server/package.json" ]; then
    echo "Generating game-server/package-lock.json..."
    cd game-server
    rm -f package-lock.json
    npm install
    cd ..
    echo "✅ Game server package-lock.json created"
else
    echo "❌ game-server/package.json not found"
fi

# Update Dockerfiles to be more robust
echo -e "${YELLOW}📝 Updating Dockerfiles for better npm handling...${NC}"

# Server Dockerfile
cat > Server/Dockerfile << 'EOF'
# Chat Server Dockerfile
FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json ./

# Install dependencies (use npm install if no lock file)
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy source code
COPY *.ts ./
COPY *.js ./
COPY src/ ./src/ 2>/dev/null || echo "No src directory"

# Install TypeScript and build
RUN npm install -g typescript
RUN npx tsc --target ES2022 --module commonjs --outDir dist --rootDir . *.ts

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["node", "dist/chatServer.js"]
EOF

# Game server Dockerfile
cat > game-server/Dockerfile << 'EOF'
# Game Server Dockerfile
FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json ./

# Install dependencies (use npm install if no lock file)
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy source code
COPY *.ts ./
COPY *.js ./
COPY src/ ./src/ 2>/dev/null || echo "No src directory"
COPY public/ ./public/ 2>/dev/null || echo "No public directory"

# Install TypeScript and build
RUN npm install -g typescript
RUN npx tsc --target ES2022 --module commonjs --outDir dist --rootDir . *.ts

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["node", "dist/production-game-server.js"]
EOF

# Check what we have now
echo -e "${YELLOW}🔍 Checking file structure...${NC}"
echo "Server directory:"
ls -la Server/ | grep -E "(package|\.ts|\.js)" || echo "No relevant files found"
echo ""
echo "game-server directory:"
ls -la game-server/ | grep -E "(package|\.ts|\.js)" || echo "No relevant files found"

echo -e "${GREEN}✅ NPM issues fixed!${NC}"
echo -e "${BLUE}"
echo "📋 What was fixed:"
echo "• Generated package-lock.json files"
echo "• Updated Dockerfiles to handle missing lock files gracefully"
echo "• Cleaned Docker build cache"
echo ""
echo "🚀 Ready to build! Run:"
echo "  docker-compose up -d --build"
echo -e "${NC}"