#!/bin/bash
echo "Verifying Google Tools..."

API_URL="http://localhost:3001"

# 1. Test Gmail List (expect 500 or error if not auth, but confirming route exists)
echo "\nTesting /tools/gmail/list..."
curl -X POST "$API_URL/tools/gmail/list" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{"query": "is:unread", "max_results": 1}'

# 2. Test Calendar List
echo "\nTesting /tools/calendar/list..."
curl -X POST "$API_URL/tools/calendar/list" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test" \
  -d '{"days_ahead": 3}'

echo "\n\nDone."
