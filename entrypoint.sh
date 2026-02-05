#!/bin/bash
set -e

# Create logs directory if it doesn't exist
mkdir -p /app/logs

# Fix permissions for the logs directory
echo "Fixing permissions for logs directory..."

# Set ownership to botuser (match the approach of chgrp/chown)
chown -R botuser:botuser /app/logs

# Set directory permissions: Owner+Group get RWX (7), Others get Read+Execute (5) => 775
chmod -R 775 /app/logs

# Ensure group write permission is explicitly set (like the Laravel example)
chmod -R g+w /app/logs

# Set SGID bit on directories so new files inherit the group
find /app/logs -type d -exec chmod g+s {} +

# Execute the command passed to docker run as botuser
exec runuser -u botuser -- "$@"
