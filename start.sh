#!/bin/bash

# HIVE Unified Startup Script
echo "Starting HIVE AI Operating System..."

# Function to catch Ctrl+C and kill background processes
cleanup() {
  echo ""
  echo "Shutting down services..."
  # Kill all child processes of this script
  pkill -P $$ 2>/dev/null
  # Kill any remaining tsx or node processes related to hive
  pkill -f "tsx apps/" 2>/dev/null
  pkill -f "node --require" 2>/dev/null
  exit
}

trap cleanup SIGINT

# Kill any existing processes on ports 3000-3003
echo "Cleaning up ports 3000, 3001, 3002, 3003..."
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
lsof -ti :3002 | xargs kill -9 2>/dev/null || true
lsof -ti :3003 | xargs kill -9 2>/dev/null || true

# Kill any existing tsx or node processes related to hive to avoid conflicts (e.g. Bot 409)
echo "Cleaning up background worker processes..."
pkill -f "tsx apps/" 2>/dev/null || true
pkill -f "node --require" 2>/dev/null || true
# Wait a second for processes to release resources
sleep 1

# Create logs directory and touch files
mkdir -p logs
touch logs/api.log logs/pm.log logs/dev.log logs/orchestrator.log logs/trigger-engine.log logs/bot.log logs/frontend.log

# Start all backend services in background
echo "Spinning up services (check logs/ for details)..."

# Global environment overrides
export HIVE_API_URL="http://localhost:3001"
export HIVE_SERVICE_URL="http://localhost:3001"
export API_KEY="test"

# 1. API (explicitly on 3001)
PORT=3001 npm run dev:api > logs/api.log 2>&1 &

# 2. Agents (workers)
npm run dev:pm > logs/pm.log 2>&1 &
npm run dev:dev > logs/dev.log 2>&1 &

# 3. Engine & Orchestrator (unique ports for health checks)
PORT=3002 npm run dev:orchestrator > logs/orchestrator.log 2>&1 &
PORT=3003 npm run dev:trigger-engine > logs/trigger-engine.log 2>&1 &
npm run dev:bot > logs/bot.log 2>&1 &

# 4. Frontend (explicitly on 3000)
echo "Starting Frontend on http://localhost:3000..."
PORT=3000 npm run dev:frontend > logs/frontend.log 2>&1 &

# Wait for API to be ready on port 3001
echo "Waiting for API to start on port 3001..."
MAX_RETRIES=30
COUNT=0
while ! nc -z localhost 3001; do
  sleep 1
  COUNT=$((COUNT + 1))
  if [ $COUNT -ge $MAX_RETRIES ]; then
    echo "Error: API failed to start after 30 seconds."
    cleanup
  fi
done

# Verify API health
echo "Verifying API health..."
if curl -s http://localhost:3001/health | grep -q "ok"; then
  echo "----------------------------------------"
  echo "API is online on port 3001"
  echo "Frontend is online at http://localhost:3000"
  echo "HIVE is online"
  echo "----------------------------------------"
else
  echo "Warning: API responded but health check failed."
fi

# Run the CLI
npm run cli

# Cleanup when CLI exits
cleanup
