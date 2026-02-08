# Use Node.js LTS (Long Term Support) version
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application code
COPY server/ ./server/
COPY public/ ./public/

# Copy entrypoint script
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh

# Set environment variables (can be overridden at runtime)
ENV PORT=5173
ENV NODE_ENV=production

# Expose the application port
EXPOSE 5173

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create storage directory with correct ownership
RUN mkdir -p /app/storage && chown -R nodejs:nodejs /app

# Note: Running as root to avoid permission issues with bind mounts
# If you want to run as non-root, ensure mounted volumes are owned by UID 1001
# USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/status', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script
ENTRYPOINT ["./entrypoint.sh"]

# Start the application
CMD ["node", "server/server.js"]
