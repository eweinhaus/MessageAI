#!/bin/bash

# Multi-Device UI Testing Script
# Tests MessageAI UI on various screen sizes

echo "🎨 MessageAI Multi-Device UI Testing"
echo "===================================="
echo ""

# Device UDIDs from your system
DEVICES=(
    "6353A4EA-8121-4E34-B4C9-2CF3AB6A7B4B:iPhone SE (3rd generation)"
    "0DC6C00E-DCD1-4ECC-8549-1718454DBE6B:iPhone 14"
    "6C921129-49A4-4591-B27D-2B0DFF318322:iPhone 14 Pro"
    "C3261F43-4C3E-4401-94E7-A8BFEAFF0567:iPhone 14 Pro Max"
)

# Test file
TEST_FILE="tests/e2e/ui-test-all-sizes.yaml"

# Check if Expo is running
if ! lsof -i :19000 > /dev/null 2>&1; then
    echo "⚠️  Warning: Expo dev server not running on port 19000"
    echo "Please start Expo first: npx expo start"
    echo ""
    exit 1
fi

echo "📱 Testing on ${#DEVICES[@]} device sizes..."
echo ""

for device_info in "${DEVICES[@]}"; do
    IFS=':' read -r udid device_name <<< "$device_info"
    
    echo "───────────────────────────────────────"
    echo "📱 Testing: $device_name"
    echo "UDID: $udid"
    echo "───────────────────────────────────────"
    
    # Boot the device if not booted
    xcrun simctl boot "$udid" 2>/dev/null || true
    
    # Wait for boot
    sleep 2
    
    # Create device-specific screenshot directory
    SCREENSHOT_DIR="tests/screenshots/$(echo $device_name | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"
    mkdir -p "$SCREENSHOT_DIR"
    
    # Update the YAML to use device-specific screenshot path
    sed "s|screenshots/|$SCREENSHOT_DIR/|g" "$TEST_FILE" > "/tmp/maestro-test-temp.yaml"
    
    # Run Maestro test
    echo "Running Maestro test..."
    maestro test "/tmp/maestro-test-temp.yaml" --platform ios || {
        echo "❌ Test failed on $device_name"
        continue
    }
    
    echo "✅ Test completed on $device_name"
    echo ""
    
    # Shutdown device to save resources
    xcrun simctl shutdown "$udid" 2>/dev/null || true
done

echo ""
echo "═══════════════════════════════════════"
echo "✅ Multi-device testing complete!"
echo "═══════════════════════════════════════"
echo ""
echo "📸 Screenshots saved in tests/screenshots/"
echo ""
echo "To view results:"
echo "  open tests/screenshots/"
echo ""

