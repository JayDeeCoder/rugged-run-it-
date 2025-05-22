#!/bin/bash
# migrate-game-server.sh - Move existing game server to proper structure

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🔄 Migrating your game server to proper structure...${NC}"

# Find the production-game-server.ts file
GAME_SERVER_FILE=$(find . -name "production-game-server.ts" -not -path "./game-server/*" | head -1)

if [ -z "$GAME_SERVER_FILE" ]; then
    echo -e "${RED}❌ Could not find production-game-server.ts${NC}"
    echo -e "${YELLOW}Please make sure production-game-server.ts exists in your project${NC}"
    exit 1
fi

echo -e "${YELLOW}📁 Found game server at: $GAME_SERVER_FILE${NC}"

# Create game-server directory if it doesn't exist
mkdir -p game-server

# Move or copy the file
if [ "$GAME_SERVER_FILE" != "./game-server/production-game-server.ts" ]; then
    echo -e "${YELLOW}📦 Moving game server to game-server/ directory...${NC}"
    cp "$GAME_SERVER_FILE" game-server/production-game-server.ts
    
    # Ask if user wants to remove the old file
    read -p "Remove the original file at $GAME_SERVER_FILE? (y/N): " remove_original
    if [[ $remove_original =~ ^[Yy]$ ]]; then
        rm "$GAME_SERVER_FILE"
        echo -e "${GREEN}✅ Removed original file${NC}"
    fi
else
    echo -e "${GREEN}✅ Game server already in correct location${NC}"
fi

# Copy any related files that might exist
echo -e "${YELLOW}🔍 Looking for related files...${NC}"

# Look for package.json in the same directory as the original game server
ORIGINAL_DIR=$(dirname "$GAME_SERVER_FILE")
if [ -f "$ORIGINAL_DIR/package.json" ] && [ "$ORIGINAL_DIR" != "./game-server" ]; then
    echo -e "${YELLOW}📦 Found package.json in $ORIGINAL_DIR${NC}"
    read -p "Copy package.json to game-server/? (Y/n): " copy_package
    if [[ ! $copy_package =~ ^[Nn]$ ]]; then
        cp "$ORIGINAL_DIR/package.json" game-server/package.json
        echo -e "${GREEN}✅ Copied package.json${NC}"
    fi
fi

# Look for any .env files
if [ -f "$ORIGINAL_DIR/.env" ] && [ "$ORIGINAL_DIR" != "." ]; then
    echo -e "${YELLOW}📄 Found .env in $ORIGINAL_DIR${NC}"
    echo -e "${YELLOW}Note: Environment variables should be in the root .env file${NC}"
fi

# Check if there are any other TypeScript files
OTHER_TS_FILES=$(find "$ORIGINAL_DIR" -name "*.ts" -not -name "production-game-server.ts" 2>/dev/null | head -5)
if [ ! -z "$OTHER_TS_FILES" ]; then
    echo -e "${YELLOW}🔍 Found other TypeScript files in $ORIGINAL_DIR:${NC}"
    echo "$OTHER_TS_FILES"
    read -p "Copy all .ts files to game-server/? (y/N): " copy_ts
    if [[ $copy_ts =~ ^[Yy]$ ]]; then
        cp "$ORIGINAL_DIR"/*.ts game-server/ 2>/dev/null || true
        echo -e "${GREEN}✅ Copied TypeScript files${NC}"
    fi
fi

echo -e "${GREEN}✅ Migration complete!${NC}"
echo -e "${YELLOW}"
echo "📋 Your game server structure:"
echo "game-server/"
echo "├── production-game-server.ts"
echo "├── package.json (if copied/created)"
echo "├── tsconfig.json (will be created by setup)"
echo "└── Dockerfile (will be created by setup)"
echo ""
echo "🚀 Next steps:"
echo "1. Run: ./setup.sh"
echo "2. Follow the setup instructions"
echo -e "${NC}"