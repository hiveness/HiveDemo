#!/bin/bash

# HIVE Unified Startup Script
echo "Starting HIVE AI Operating System..."

# Function to catch Ctrl+C and kill background processes
cleanup() {
  echo ""
  echo "Shutting down services..."
  # Kill all child processes of this script
  pkill -P $$ 2>/dev/null
  # Kill any remaining tsx processes just in case
  pkill -f tsx 2>/dev/null
  exit
}

trap cleanup SIGINT

# Kill any existing processes on port 3000
echo "Cleaning up port 3000..."
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# Create logs directory and touch files
mkdir -p logs
touch logs/api.log logs/pm.log logs/dev.log logs/orchestrator.log logs/trigger-engine.log logs/bot.log

# Start all backend services in background
echo "Spinning up services (check logs/ for details)..."

# API
npm run dev:api > logs/api.log 2>&1 &
API_PID=$!

# Agents & Engine
npm run dev:pm > logs/pm.log 2>&1 &
npm run dev:dev > logs/dev.log 2>&1 &
npm run dev:orchestrator > logs/orchestrator.log 2>&1 &
npm run dev:trigger-engine > logs/trigger-engine.log 2>&1 &
npm run dev:bot > logs/bot.log 2>&1 &

# Wait for API to be ready
echo "Waiting for API to start on port 3000..."
MAX_RETRIES=30
COUNT=0
while ! nc -z localhost 3000; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX_RETRIES ]; then
    echo "Error: API failed to start after 30 seconds."
    echo "Last logs from api.log:"
    tail -n 10 logs/api.log
    cleanup
  fi
done

echo "API is online!"
echo "HIVE is online!"
echo "----------------------------------------"

# Run the CLI
npm run cli

# Cleanup when CLI exits
cleanup
