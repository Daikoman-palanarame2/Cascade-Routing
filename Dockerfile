# ==========================================
# 1. Build Stage
# ==========================================
FROM oven/bun:1.1-slim AS builder

WORKDIR /app

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Copy package files and install dependencies
COPY package.json bun.lock* package-lock.json* ./
RUN bun install

# Copy Prisma schema and generate Prisma client
COPY prisma ./prisma/
RUN bun run db:generate

# Copy the rest of the application code
COPY . .

# Initialize/update SQLite schema on the build database template
# (So the SQLite file is generated/updated with the latest schema during build time)
ENV DATABASE_URL="file:/app/db/custom.db"
RUN mkdir -p /app/db && \
    if [ -f "db/custom.db" ]; then cp db/custom.db /app/db/custom.db; fi && \
    bun run db:push

# Build the Next.js standalone application
RUN bun run build

# ==========================================
# 2. Runner Stage
# ==========================================
FROM oven/bun:1.1-slim AS runner

# Install system dependencies (openssl is required by Prisma client, curl for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Caddy from the official image
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy

WORKDIR /app

# Copy the standalone Next.js build
COPY --from=builder /app/.next/standalone /app/standalone

# Copy Caddy configuration
COPY Caddyfile /app/Caddyfile

# Copy the SQLite database template built in the builder stage
COPY --from=builder /app/db /app/db.template

# Copy the entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose Next.js default port and Caddy reverse proxy port
EXPOSE 3000
EXPOSE 81

# Persist the database directory
VOLUME ["/app/db"]

# Run the entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]
