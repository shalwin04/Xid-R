# Xid-R Control Plane Backend
# Multi-stage build for production deployment

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Stage 2: Production
FROM node:22-alpine AS production

WORKDIR /app

# Add non-root user
RUN addgroup -g 1001 -S xidr && \
    adduser -S xidr -u 1001 -G xidr

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run as non-root user
USER xidr

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "dist/src/index.js"]
