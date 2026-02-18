#!/bin/bash

# HIVE Unified Startup Script
echo "🐝 Starting HIVE AI Operating System..."

# Function to catch Ctrl+C and kill background processes
cleanup() {
  echo -e "\n🛑 Shutting down..."
  kill $(jobs -p)
  exit
}

trap cleanup SIGINT

# Create logs directory and touch files so tail -f doesn't fail
mkdir -p logs
touch logs/api.log logs/pm.log logs/dev.log logs/orchestrator.log logs/trigger-engine.log logs/bot.log

# Start all backend services in background
echo "📦 Spinning up services (logging to logs/)..."
npm run dev:api > logs/api.log 2>&1 &
npm run dev:pm > logs/pm.log 2>&1 &
npm run dev:dev > logs/dev.log 2>&1 &
npm run dev:orchestrator > logs/orchestrator.log 2>&1 &
npm run dev:trigger-engine > logs/trigger-engine.log 2>&1 &
npm run dev:bot > logs/bot.log 2>&1 &

# Wait for API to be ready
echo "⏳ Waiting for API to start on port 3000..."
for i in {1..30}; do
  if nc -z localhost 3000; then
    echo "✅ API is online!"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    echo "❌ API failed to start. Check logs/api.log"
    exit 1
  fi
done

echo "✅ HIVE is online!"
echo "----------------------------------------"

# Run the CLI
npm run cli
