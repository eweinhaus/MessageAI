#!/bin/bash
# Script to check for color import issues across the codebase
# Run this before committing to catch missing imports

echo "🔍 Checking for color import issues..."
echo ""

HAS_ERRORS=0

# Check 1: Files using colors.* without importing
echo "📋 Check 1: Files using 'colors.' without import..."
for file in $(grep -rl "colors\." app/ components/ services/ --include="*.js" 2>/dev/null); do
  if ! grep -q "import.*colors.*from.*constants/colors" "$file"; then
    echo "❌ MISSING IMPORT: $file"
    HAS_ERRORS=1
  fi
done

if [ $HAS_ERRORS -eq 0 ]; then
  echo "✅ All files using 'colors.' have proper imports"
fi

echo ""

# Check 2: Files using COLORS.* (uppercase - likely wrong)
echo "📋 Check 2: Files using 'COLORS.' (uppercase - likely wrong)..."
UPPERCASE_USAGE=$(grep -rn "COLORS\." app/ components/ services/ --include="*.js" 2>/dev/null | grep -v "AVATAR_COLORS" | grep -v "//")

if [ -n "$UPPERCASE_USAGE" ]; then
  echo "❌ Found uppercase COLORS usage (should be lowercase 'colors'):"
  echo "$UPPERCASE_USAGE"
  HAS_ERRORS=1
else
  echo "✅ No incorrect uppercase COLORS usage found"
fi

echo ""

# Check 3: Verify constants/colors.js exports
echo "📋 Check 3: Verifying constants/colors.js structure..."
if ! grep -q "export default {" constants/colors.js; then
  echo "❌ constants/colors.js missing default export"
  HAS_ERRORS=1
else
  echo "✅ constants/colors.js has default export"
fi

echo ""
echo "=================================="
if [ $HAS_ERRORS -eq 0 ]; then
  echo "✅ All checks passed!"
  exit 0
else
  echo "❌ Found issues - please fix before committing"
  exit 1
fi

