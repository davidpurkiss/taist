#!/bin/bash

# Taist Tracing Verification Script
# This script demonstrates and verifies the tracing functionality

echo "================================"
echo "TAIST TRACING VERIFICATION"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "taist.js" ]; then
    echo "❌ Error: Please run this script from the Taist root directory"
    exit 1
fi

echo "1. Testing Integration Service Tracing..."
echo "   Running instrumented service tests..."
echo ""

# Run the traced test
node examples/integration-service/test-traced.js 2>&1 | head -50

echo ""
echo "================================"
echo "2. Checking TOON Format Output"
echo "================================"
echo ""

# Show just the TOON format preview
node examples/integration-service/test-traced.js 2>&1 | grep -A 5 "TOON FORMAT OUTPUT PREVIEW"

echo ""
echo "================================"
echo "3. Express Service Example"
echo "================================"
echo ""
echo "To test the Express service monitoring:"
echo ""
echo "Terminal 1:"
echo "  cd examples/express-service"
echo "  npm install express"
echo "  TAIST_ENABLED=true node server.js"
echo ""
echo "Terminal 2:"
echo "  cd examples/express-service"
echo "  node test-api.js"
echo ""
echo "Or visit in your browser:"
echo "  http://localhost:3000/trace/insights - JSON insights"
echo "  http://localhost:3000/trace/output?format=toon - TOON output"
echo ""
echo "================================"
echo "4. Using in Your Own Service"
echo "================================"
echo ""
echo "Add to your service:"
echo "  import 'taist/instrument';"
echo ""
echo "Run with tracing:"
echo "  TAIST_ENABLED=true node your-service.js"
echo ""
echo "Monitor output:"
echo "  TAIST_FORMAT=toon TAIST_OUTPUT_INTERVAL=10000 node your-service.js"
echo ""
echo "================================"
echo "✅ Verification Complete"
echo "================================"