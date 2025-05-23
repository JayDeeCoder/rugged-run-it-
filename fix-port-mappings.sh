#!/bin/bash
# fix-port-mappings.sh - Fix missing port mappings

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🔧 Checking and fixing port mappings...${NC}"

# Backup current docker-compose.yml
cp docker-compose.yml docker-compose.yml.backup

# Check if ports are properly configured
if ! grep -q "ports:" docker-compose.yml; then
    echo -e "${RED}❌ No port mappings found in docker-compose.yml${NC}"
    echo -e "${YELLOW}📝 Adding port mappings...${NC}"
    
    # This is a complex fix, let's create a corrected version
    cat > docker-compose-fixed.yml << 'EOF'
services:
  # Game server
  game-server:
    build: ./game-server
    container_name: game-server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - SOLANA_RPC_URL=${SOLANA_RPC_URL:-}
      - HOUSE_WALLET_ADDRESS=${HOUSE_WALLET_ADDRESS:-}
      - FRONTEND_URL=${FRONTEND_URL:-}
      - GAME_PORT=3001
    networks:
      - app-network
    restart: unless-stopped

  # Chat server
  chat-server:
    build: ./Server
    container_name: chat-server
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL:-}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-}
      - CHAT_PORT=3002
    networks:
      - app-network
    restart: unless-stopped

  # Redis
  redis:
    image: redis:alpine
    container_name: redis
    networks:
      - app-network
    restart: unless-stopped

  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - chat-server
      - game-server
    networks:
      - app-network
    restart: unless-stopped

networks:
  app-network:
    driver: bridge
EOF

    echo -e "${GREEN}✅ Created docker-compose-fixed.yml with proper port mappings${NC}"
    echo -e "${YELLOW}🔄 Replace your current docker-compose.yml? (y/N):${NC}"
    read -r replace
    if [[ $replace =~ ^[Yy]$ ]]; then
        mv docker-compose-fixed.yml docker-compose.yml
        echo -e "${GREEN}✅ docker-compose.yml updated${NC}"
    fi
else
    echo -e "${GREEN}✅ Port mappings found in docker-compose.yml${NC}"
    grep -A 2 "ports:" docker-compose.yml
fi

echo -e "${YELLOW}🚀 Restart containers with proper ports:${NC}"
echo "docker-compose down && docker-compose up -d"