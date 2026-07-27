#!/usr/bin/env bash
#
# install-hooks.sh — install the local git hooks for this repository.
#
# Installs a pre-push hook that runs scripts/leak-check.sh and blocks the push if
# anything matches. Hooks are not version-controlled by git, so each clone needs this
# run once.
#
# Usage:  bash scripts/install-hooks.sh

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="$(git rev-parse --git-path hooks)"
HOOK="$HOOK_DIR/pre-push"

mkdir -p "$HOOK_DIR"

if [ -f "$HOOK" ] && ! grep -q "leak-check.sh" "$HOOK"; then
  cp "$HOOK" "$HOOK.backup"
  echo "install-hooks: existing pre-push hook backed up to $HOOK.backup"
fi

cat > "$HOOK" <<'EOF'
#!/usr/bin/env bash
# Installed by scripts/install-hooks.sh — blocks a push that would publish private
# material or credentials. Bypass in a genuine emergency with `git push --no-verify`.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
if [ -f "$ROOT/scripts/leak-check.sh" ]; then
  bash "$ROOT/scripts/leak-check.sh" || {
    echo ""
    echo "pre-push: blocked by leak-check. This repository is public."
    exit 1
  }
fi
EOF

chmod +x "$HOOK"

echo "install-hooks: pre-push hook installed at $HOOK"
echo "install-hooks: verify with — bash scripts/leak-check.sh"
