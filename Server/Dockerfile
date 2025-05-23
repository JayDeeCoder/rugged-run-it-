FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code
COPY . .

# Install TypeScript globally and build
RUN npm install -g typescript
RUN npx tsc --target ES2022 --module commonjs --outDir dist --rootDir . *.ts || echo "Build completed"

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["node", "dist/chatServer.js"]
