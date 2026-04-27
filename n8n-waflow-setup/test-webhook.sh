#!/bin/bash

# WAFlow n8n — Test Webhook Script
# This script tests the WhatsApp webhook receiver

echo "=========================================="
echo "Testing WhatsApp Webhook Receiver"
echo "=========================================="
echo ""

# Test 1: Simple message
echo "Test 1: Sending a simple message..."
echo ""

TIMESTAMP=$(date +%s)
RESPONSE=$(curl -s -X POST http://localhost:5678/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"messages\": [{
            \"from\": \"1234567890\",
            \"id\": \"msg_$(date +%s)_1\",
            \"timestamp\": \"$TIMESTAMP\",
            \"type\": \"text\",
            \"text\": {
              \"body\": \"Hello! What are your business hours?\"
            }
          }]
        }
      }]
    }]
  }")

echo "Response: $RESPONSE"
echo ""

# Test 2: Booking request
echo "Test 2: Sending a booking request..."
echo ""

TIMESTAMP=$(date +%s)
curl -s -X POST http://localhost:5678/webhook/whatsapp/2 \
  -H "Content-Type: application/json" \
  -d "{
    \"entry\": [{
      \"changes\": [{
        \"value\": {
          \"messages\": [{
            \"from\": \"9876543210\",
            \"id\": \"msg_$(date +%s)_2\",
            \"timestamp\": \"$TIMESTAMP\",
            \"type\": \"text\",
            \"text\": {
              \"body\": \"I'd like to book an appointment please\"
            }
          }]
        }
      }]
    }]
  }"

echo "Response: $RESPONSE"
echo ""

# Test 3: Check database
echo "Test 3: Checking database for stored messages..."
echo ""

docker-compose exec mysql mysql -u waflow -pwaflow123 waflow_n8n -e \
  "SELECT id, phone, content, direction, created_at FROM conversations ORDER BY created_at DESC LIMIT 5;"

echo ""
echo "=========================================="
echo "✅ Webhook tests sent!"
echo "=========================================="
echo ""
echo "If you see messages in the database above, the webhook is working!"
echo ""
echo "Next:"
echo "  1. Check n8n logs for workflow execution: docker-compose logs -f n8n"
echo "  2. Visit http://localhost:5678 to see workflow results"
echo "  3. Create templates at: bot_config -> templates"
echo ""
