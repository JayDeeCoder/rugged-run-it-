# Multi-stage build for production optimization

# Stage 1: Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY Server/package*.json ./Server/

# Install all dependencies (including dev dependencies for building)
RUN npm ci
RUN cd Server && npm ci

# Copy source code
COPY . .

# Build the Next.js application
RUN npm run build

# Build the server
RUN cd Server && npm run build

# Stage 2: Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY Server/package*.json ./Server/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force
RUN cd Server && npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/Server/dist ./Server/dist

# Copy other necessary files
COPY next.config.ts ./
COPY Server/production-game-server.js ./Server/

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Expose ports
EXPOSE 3000 3001

# Start the application
CMD ["npm", "start"]