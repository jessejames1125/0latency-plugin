#!/usr/bin/env bash
#
# leak-check.sh — keep material that does not belong in a public repository out of it.
#
# Scans tracked files for two classes of problem:
#   1. Credentials and private keys.
#   2. Content that should stay private (local notes, private context).
#
# Extra patterns can be supplied in a gitignored `.leak-denylist` at the repo root:
# one extended-regex pattern per line, `#` for comments, blank lines ignored.
#
# Usage:  bash scripts/leak-check.sh
# Exit:   0 = clean, 1 = something matched, 2 = could not run.

set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "leak-check: not inside a git repository" >&2
  exit 2
}

DENYLIST_FILE=".leak-denylist"

# Paths excluded from the scan. The script itself and the denylist necessarily contain
# the very patterns being searched for.
EXCLUDES=(
  ':!scripts/leak-check.sh'
  ':!.leak-denylist'
  ':!node_modules'
  ':!package-lock.json'
)

# --- Pattern set ------------------------------------------------------------------

SECRET_PATTERNS=(
  'sk-[A-Za-z0-9_-]{20,}'                       # OpenAI / Anthropic style keys
  'gh[pousr]_[A-Za-z0-9]{30,}'                  # GitHub tokens
  'xox[baprs]-[A-Za-z0-9-]{10,}'                # Slack tokens
  'AKIA[0-9A-Z]{16}'                            # AWS access key id
  '-----BEGIN (RSA |OPENSSH |EC |DSA |PGP )?PRIVATE KEY-----'
  '(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*["'"'"'][A-Za-z0-9/+_-]{16,}["'"'"']'
)

# Content that belongs in private notes, not in a public tool repository.
PRIVATE_PATTERNS=(
  'outreach'
  'prospect'
  'waitlist'
  'book a demo'
  'message ladder'
  'pain hypothesis'
  'go.to.market'
  'GTM'
  'stealth'
  'conflict of interest'
)

fail=0

report() {
  local label="$1" pattern="$2" hits="$3"
  echo ""
  echo "  [$label] pattern: $pattern"
  echo "$hits" | sed 's/^/      /'
  fail=1
}

# scan <label> <pattern> [nocase]
scan() {
  local label="$1" pattern="$2" nocase="${3:-}" hits
  if [ -n "$nocase" ]; then
    hits=$(git grep -n -I -i -E -e "$pattern" -- . "${EXCLUDES[@]}" 2>/dev/null)
  else
    hits=$(git grep -n -I -E -e "$pattern" -- . "${EXCLUDES[@]}" 2>/dev/null)
  fi
  if [ -n "$hits" ]; then
    report "$label" "$pattern" "$hits"
  fi
}

echo "leak-check: scanning tracked files..."

for p in "${SECRET_PATTERNS[@]}"; do
  scan "SECRET" "$p"
done

for p in "${PRIVATE_PATTERNS[@]}"; do
  scan "PRIVATE" "$p" nocase
done

if [ -f "$DENYLIST_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    scan "LOCAL" "$line" nocase
  done < "$DENYLIST_FILE"
else
  echo "leak-check: note — no $DENYLIST_FILE found; scanning built-in patterns only."
fi

echo ""
if [ "$fail" -ne 0 ]; then
  cat <<'EOF'
leak-check: FAILED — the matches above are in tracked files.

Remove the content, then re-run. If a match is a false positive (for example, a word used
in ordinary technical prose), either reword it or narrow the pattern in
scripts/leak-check.sh — do not disable the check.
EOF
  exit 1
fi

echo "leak-check: clean."
exit 0
