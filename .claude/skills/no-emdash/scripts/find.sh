#!/usr/bin/env bash
# List every em dash, separating cryptographically signed files from safe ones.
#   bash .claude/skills/no-emdash/scripts/find.sh [path ...]
# Exits 0 always; this is a report, not a gate.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

TARGETS=("$@")
[ ${#TARGETS[@]} -eq 0 ] && TARGETS=(.)

# Generated or vendored: never edit by hand.
EXCLUDE='^\./(node_modules|\.git|site/dist)/'
# Signed: editing breaks attestation signatures.
SIGNED='^\./(transcripts/|attestations/)'

hits=$(grep -rIn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
        -- '—' "${TARGETS[@]}" 2>/dev/null | grep -Ev "$EXCLUDE" || true)

[ -z "$hits" ] && { echo "No em dashes found in: ${TARGETS[*]}"; exit 0; }

signed=$(echo "$hits" | grep -E "$SIGNED" || true)
safe=$(echo "$hits"   | grep -Ev "$SIGNED" || true)

if [ -n "$safe" ]; then
  echo "SAFE TO EDIT  ($(echo "$safe" | wc -l | tr -d ' ') occurrences)"
  echo "$safe" | sed 's/^/  /'
  echo
fi

if [ -n "$signed" ]; then
  echo "!! SIGNED CONTENT  ($(echo "$signed" | wc -l | tr -d ' ') occurrences in $(echo "$signed" | cut -d: -f1 | sort -u | wc -l | tr -d ' ') files)"
  echo "   Editing these invalidates attestation signatures. They must be re-hashed and"
  echo "   re-signed with the auditor's key, then 'osc verify --all' must pass, before commit."
  echo "   Do not touch them unless the user has explicitly agreed to that."
  echo "$signed" | cut -d: -f1 | sort | uniq -c | sed 's/^/   /'
fi
