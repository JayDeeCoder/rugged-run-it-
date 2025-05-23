FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies first
RUN npm ci

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build || npx tsc --target ES2022 --module commonjs --outDir dist --rootDir . *.ts

# Remove dev dependencies after build (optional)
RUN npm prune --production

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["node", "dist/chatServer.js"]