#!/bin/bash
# setup.sh - Complete setup script for Rugged Run It

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "🎮 Rugged Run It - Project Setup"
echo "================================="
echo -e "${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Please run this script from the project root directory${NC}"
    exit 1
fi

# Function to prompt for input
prompt_for_input() {
    local prompt="$1"
    local var_name="$2"
    local default_value="$3"
    
    if [ -n "$default_value" ]; then
        read -p "$prompt [$default_value]: " value
        if [ -z "$value" ]; then
            value="$default_value"
        fi
    else
        read -p "$prompt: " value
        while [ -z "$value" ]; do
            echo -e "${RED}This field is required${NC}"
            read -p "$prompt: " value
        done
    fi
    
    eval "$var_name='$value'"
}

echo -e "${YELLOW}📋 Let's configure your environment...${NC}"

# Get user input for environment variables
prompt_for_input "Enter your email for SSL certificates" EMAIL
prompt_for_input "Enter your Supabase URL" SUPABASE_URL
prompt_for_input "Enter your Supabase Anon Key" SUPABASE_ANON_KEY
prompt_for_input "Enter Solana RPC URL" SOLANA_RPC_URL "https://api.mainnet-beta.solana.com"
prompt_for_input "Enter your wallet address" HOUSE_WALLET_ADDRESS
prompt_for_input "Enter your frontend URL" FRONTEND_URL "https://irugged.fun"

# Create .env file
echo -e "${YELLOW}📝 Creating .env file...${NC}"
cat > .env << EOF
# Environment Variables for rugged-run-it
# Generated on $(date)

# =====================
# Supabase Configuration
# =====================
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# =====================
# Solana Configuration
# =====================
SOLANA_RPC_URL=$SOLANA_RPC_URL

# =====================
# Game Configuration
# =====================
HOUSE_WALLET_ADDRESS=$HOUSE_WALLET_ADDRESS
FRONTEND_URL=$FRONTEND_URL

# =====================
# Application Settings
# =====================
NODE_ENV=production
CHAT_PORT=3002
GAME_PORT=3001
EOF

# Update SSL script with email
echo -e "${YELLOW}🔧 Updating SSL script with your email...${NC}"
sed -i.bak "s/your-email@example.com/$EMAIL/g" ssl-scripts/get-certificate.sh
rm ssl-scripts/get-certificate.sh.bak 2>/dev/null || true

# Create necessary directories
echo -e "${YELLOW}📁 Creating directories...${NC}"
mkdir -p nginx certbot/conf certbot/www ssl-scripts

# Make scripts executable
echo -e "${YELLOW}🔑 Making scripts executable...${NC}"
chmod +x ssl-scripts/*.sh
chmod +x setup.sh

# Install dependencies in both server directories
echo -e "${YELLOW}📦 Installing dependencies...${NC}"

# Chat server dependencies
cd Server
if [ -f "package.json" ]; then
    echo -e "${BLUE}Installing chat server dependencies...${NC}"
    npm install
else
    echo -e "${RED}⚠️  package.json not found in Server directory${NC}"
fi
cd ..

# Game server dependencies  
cd game-server
if [ -f "package.json" ]; then
    echo -e "${BLUE}Installing game server dependencies...${NC}"
    npm install
else
    echo -e "${RED}⚠️  package.json not found in game-server directory${NC}"
fi
cd ..

echo -e "${GREEN}✅ Setup complete!${NC}"
echo -e "${BLUE}"
echo "🚀 Next steps:"
echo "1. Move your production-game-server.ts to the game-server/ directory"
echo "2. Make sure your domain (irugged.fun) points to this server"
echo "3. Run: ./ssl-scripts/get-certificate.sh"
echo "4. Run: docker-compose up -d"
echo "5. Visit: https://irugged.fun"
echo ""
echo "📋 Services will be available at:"
echo "• Game Server: https://irugged.fun (main site)"
echo "• Game Socket.IO: https://irugged.fun/socket.io/"
echo "• Game API: https://irugged.fun/api/"
echo "• Chat WebSocket: https://irugged.fun/ws"
echo "• Health Checks: https://irugged.fun/health"
echo ""
echo "📋 Useful commands:"
echo "• Check logs: docker-compose logs -f"
echo "• Restart: docker-compose restart"
echo "• Stop: docker-compose down"
echo "• Check SSL: ./ssl-scripts/check-ssl.sh"
echo -e "${NC}"