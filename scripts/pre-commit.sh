#!/usr/bin/env bash
# Pre-commit hook: secret scanning, typecheck, and tests
echo "Running pre-commit checks..."

# Scan for secrets
echo "→ Scanning for secrets..."
"$(dirname "$0")/betterleaks.sh" pre-commit || {
  echo "❌ Secrets detected! Remove them before committing."
  exit 1
}

# Typecheck server
echo "→ Typechecking server..."
(cd server && npm run typecheck) || {
  echo "❌ TypeScript type errors. Fix before committing."
  exit 1
}

# Run server tests
echo "→ Running server tests..."
(cd server && npm test) || {
  echo "❌ Tests failed. Fix before committing."
  exit 1
}

echo "✓ All pre-commit checks passed!"
