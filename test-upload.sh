#!/bin/bash

# File Service API Test Script
# Usage: ./test-upload.sh

BASE_URL="http://localhost:3000"

echo "🧪 Testing File Service API..."
echo "================================"
echo ""

# Check if server is running
echo "1. Health Check..."
curl -s "${BASE_URL}/health" | jq '.' || echo "❌ Server not responding"
echo ""
echo ""

# Test file upload
echo "2. Testing File Upload..."
echo "Creating test file..."
echo "Hello from file-service test!" > /tmp/test-file.txt

echo "Uploading file..."
UPLOAD_RESPONSE=$(curl -s -X POST "${BASE_URL}/files/upload" \
  -F "file=@/tmp/test-file.txt")

echo "Response:"
echo "$UPLOAD_RESPONSE" | jq '.'
echo ""

# Extract the filename/key from response
FILE_KEY=$(echo "$UPLOAD_RESPONSE" | jq -r '.data.key')
echo "File key: $FILE_KEY"
echo ""
echo ""

# Test file download
if [ "$FILE_KEY" != "null" ] && [ -n "$FILE_KEY" ]; then
  echo "3. Testing File Download..."
  curl -s "${BASE_URL}/files/download/${FILE_KEY}" -o /tmp/downloaded-file.txt
  
  echo "Downloaded file content:"
  cat /tmp/downloaded-file.txt
  echo ""
  echo ""
  
  echo "4. Testing Inline View (browser view)..."
  echo "URL: ${BASE_URL}/files/download/${FILE_KEY}"
  echo ""
  
  echo "5. Testing Download with attachment disposition..."
  echo "URL: ${BASE_URL}/files/download/${FILE_KEY}?download=true"
  echo ""
  
  # Test presigned URL generation
  echo "6. Testing Batch Presigned URLs..."
  PRESIGNED_RESPONSE=$(curl -s -X POST "${BASE_URL}/files/batch-presigned-urls" \
    -H "Content-Type: application/json" \
    -d "{\"keys\":[\"${FILE_KEY}\"]}")
  
  echo "Response:"
  echo "$PRESIGNED_RESPONSE" | jq '.'
  echo ""
else
  echo "❌ Upload failed, skipping download tests"
fi

echo ""
echo "✅ Tests completed!"
echo ""
echo "Cleanup..."
rm -f /tmp/test-file.txt /tmp/downloaded-file.txt
