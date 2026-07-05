#!/bin/sh
set -e

# Define default database paths
DEFAULT_DB_DIR="/app/db"
DEFAULT_DB_PATH="$DEFAULT_DB_DIR/custom.db"
TEMPLATE_DB_PATH="/app/db.template/custom.db"

# Determine database path from DATABASE_URL
if [ -n "$DATABASE_URL" ]; then
    # Extract path from file: prefix if present
    case "$DATABASE_URL" in
        file:*)
            DB_PATH=$(echo "$DATABASE_URL" | sed 's/^file://')
            ;;
        *)
            DB_PATH="$DATABASE_URL"
            ;;
    esac
else
    DB_PATH="$DEFAULT_DB_PATH"
    export DATABASE_URL="file:$DEFAULT_DB_PATH"
fi

# Ensure the database directory exists
DB_DIR=$(dirname "$DB_PATH")
if [ ! -d "$DB_DIR" ]; then
    echo "📁 Creating database directory: $DB_DIR"
    mkdir -p "$DB_DIR"
fi

# Initialize database if file does not exist
if [ ! -f "$DB_PATH" ]; then
    echo "🗄️ Database file not found at $DB_PATH"
    if [ -f "$TEMPLATE_DB_PATH" ]; then
        echo "🗄️ Initializing database from build template..."
        cp "$TEMPLATE_DB_PATH" "$DB_PATH"
        chmod 666 "$DB_PATH"
        # Also copy WAL/journal files if they exist in the template
        if [ -f "${TEMPLATE_DB_PATH}-wal" ]; then
            cp "${TEMPLATE_DB_PATH}-wal" "${DB_PATH}-wal"
            chmod 666 "${DB_PATH}-wal"
        fi
        if [ -f "${TEMPLATE_DB_PATH}-shm" ]; then
            cp "${TEMPLATE_DB_PATH}-shm" "${DB_PATH}-shm"
            chmod 666 "${DB_PATH}-shm"
        fi
        echo "✅ Database initialized from template"
    else
        echo "⚠️ No template database found. App will start with an empty database or require prisma migrations."
    fi
else
    echo "🗄️ Using existing database at $DB_PATH"
fi

# Next.js standalone environment variables
export NODE_ENV=production
export PORT="${PORT:-3000}"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"

echo "🚀 Starting Next.js standalone server..."
# Start Next.js in the background
bun /app/standalone/server.js &
NEXT_PID=$!

# Wait a moment to check if it started successfully
sleep 1
if ! kill -0 "$NEXT_PID" 2>/dev/null; then
    echo "❌ Next.js standalone server failed to start!"
    exit 1
fi
echo "✅ Next.js standalone server started (PID: $NEXT_PID, Port: $PORT)"

# Handle graceful shutdown signals
cleanup() {
    echo "🛑 Stopping Next.js server..."
    kill -TERM "$NEXT_PID" 2>/dev/null
    wait "$NEXT_PID" 2>/dev/null
    echo "✅ Cleaned up processes"
    exit 0
}
trap cleanup SIGTERM SIGINT

# Start Caddy in the foreground as the main process
echo "🚀 Starting Caddy reverse proxy..."
exec caddy run --config /app/Caddyfile --adapter caddyfile
