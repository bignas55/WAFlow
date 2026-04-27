#!/bin/bash

echo "🧪 WAFlow Configuration Validation Test Suite"
echo "=============================================="
echo ""

# Test 1: Check .env exists
echo "📋 Test 1: .env file exists?"
if [ -f .env ]; then
  echo "✅ .env file found"
  echo ""
else
  echo "❌ .env file not found"
  echo "   Run: cp .env.example .env"
  echo ""
fi

# Test 2: Check config.ts exists
echo "📋 Test 2: Configuration validation module exists?"
if [ -f server/config.ts ]; then
  echo "✅ server/config.ts found ($(wc -l < server/config.ts) lines)"
  echo ""
else
  echo "❌ server/config.ts not found"
  echo ""
fi

# Test 3: Check server/index.ts integration
echo "📋 Test 3: Configuration validation integrated into server startup?"
if grep -q "validateConfig" server/index.ts; then
  echo "✅ validateConfig() called in server/index.ts"
  echo "   Line: $(grep -n 'validateConfig()' server/index.ts | head -1)"
  echo ""
else
  echo "❌ validateConfig() not found in server/index.ts"
  echo ""
fi

# Test 4: Check required env vars
echo "📋 Test 4: Required environment variables present?"
REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET" "ENCRYPTION_KEY" "AI_API_URL" "AI_API_KEY" "AI_MODEL" "REDIS_URL")
MISSING=()

for var in "${REQUIRED_VARS[@]}"; do
  if grep -q "^$var=" .env; then
    echo "   ✅ $var"
  else
    echo "   ❌ $var (missing)"
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -eq 0 ]; then
  echo ""
  echo "✅ All required variables present"
  echo ""
else
  echo ""
  echo "❌ Missing ${#MISSING[@]} variable(s): ${MISSING[*]}"
  echo ""
fi

# Test 5: TypeScript compilation
echo "📋 Test 5: TypeScript compilation?"
if ./node_modules/.bin/tsc --noEmit server/config.ts 2>/dev/null; then
  echo "✅ server/config.ts compiles without errors"
  echo ""
else
  echo "❌ TypeScript compilation failed"
  ./node_modules/.bin/tsc --noEmit server/config.ts 2>&1 | head -10
  echo ""
fi

# Test 6: Check .gitignore
echo "📋 Test 6: Is .env properly ignored by git?"
if grep -q "^\.env$" .gitignore; then
  echo "✅ .env is in .gitignore"
  echo ""
else
  echo "⚠️  .env not explicitly in .gitignore (might be OK if ignored via pattern)"
  echo ""
fi

# Test 7: Validate key lengths
echo "📋 Test 7: JWT_SECRET and ENCRYPTION_KEY length validation?"
JWT_SECRET=$(grep "^JWT_SECRET=" .env | cut -d= -f2)
ENC_KEY=$(grep "^ENCRYPTION_KEY=" .env | cut -d= -f2)

JWT_LEN=${#JWT_SECRET}
ENC_LEN=${#ENC_KEY}

echo "   JWT_SECRET length: $JWT_LEN chars $([ "$JWT_LEN" -ge 64 ] && echo "✅" || echo "❌")"
echo "   ENCRYPTION_KEY length: $ENC_LEN chars $([ "$ENC_LEN" -eq 64 ] && echo "✅" || echo "❌")"
echo ""

# Test 8: Config module structure
echo "📋 Test 8: Configuration module exports correct functions?"
if grep -q "export function loadConfig" server/config.ts && \
   grep -q "export function validateConfig" server/config.ts && \
   grep -q "export function getConfig" server/config.ts && \
   grep -q "export const configChecklist" server/config.ts; then
  echo "✅ All required functions and exports present"
  echo "   • loadConfig()"
  echo "   • validateConfig()"
  echo "   • getConfig()"
  echo "   • configChecklist"
  echo ""
else
  echo "❌ Missing exports"
  echo ""
fi

# Summary
echo "=============================================="
echo "✅ Configuration system validation complete!"
echo ""
echo "Next steps:"
echo "  1. Verify all required env vars in .env"
echo "  2. Run: npm start (or pnpm dev)"
echo "  3. Check for: ✅ Configuration loaded successfully"
echo ""
