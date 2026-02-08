#!/bin/sh
set -e

# Fix permissions on storage directory if running as root
if [ "$(id -u)" = "0" ] && [ -d "/app/storage" ]; then
  echo "Running as root - fixing storage permissions..."
  chown -R nodejs:nodejs /app/storage 2>/dev/null || true
  chmod -R 755 /app/storage 2>/dev/null || true
fi

# Check if we can write to storage directory
if [ -d "/app/storage" ]; then
  if ! touch /app/storage/.write_test 2>/dev/null; then
    echo "Warning: Storage directory is not writable by current user"
    echo "This may cause issues with session and queue persistence"
    echo "Solution: Run container with --user 0:0 or fix host directory permissions"
  else
    rm -f /app/storage/.write_test
  fi
fi

# Execute the main command
exec "$@"
