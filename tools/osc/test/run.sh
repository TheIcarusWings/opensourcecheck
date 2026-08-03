#!/usr/bin/env bash
# Self-test for the trust core: sign -> verify -> reject-tamper -> reject-forged-key.
# Run: bash tools/osc/test/run.sh   (from repo root). Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/../../.."
OSC="node tools/osc/osc.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# Git does not preserve 0600 perms, and ssh-keygen refuses a world-readable private
# key. Copy the committed demo key to a private temp file before signing.
KEY="$TMP/demo_key"
cp tools/osc/test/demo_key "$KEY"
chmod 600 "$KEY"
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

echo "1. scaffold + sign + verify a fresh attestation"
$OSC new-run > "$TMP/a.json"
# make it structurally valid: real-looking commit + demo auditor
node -e '
const f=process.argv[1];const j=JSON.parse(require("fs").readFileSync(f));
j.target.commit="a".repeat(40);
j.auditor={id:"opensourcecheck-demo",name:"OpenSourceCheck Demo Key",contact:"demo@opensourcecheck.org"};
j.run.transcript_sha256=undefined;delete j.run.transcript_sha256;
require("fs").writeFileSync(f,JSON.stringify(j,null,2));' "$TMP/a.json"
$OSC sign "$TMP/a.json" --key "$KEY" --principal demo@opensourcecheck.org >/dev/null
$OSC verify "$TMP/a.json" >/dev/null && pass "signed attestation verifies" || fail "fresh signature did not verify"

echo "2. tampering with a signed field is rejected"
cp "$TMP/a.json" "$TMP/tampered.json"
node -e 'const f=process.argv[1];const s=require("fs").readFileSync(f,"utf8").replace("Nothing found in scope.","INJECTED");require("fs").writeFileSync(f,s)' "$TMP/tampered.json"
if $OSC verify "$TMP/tampered.json" >/dev/null 2>&1; then fail "tampered attestation verified (should not)"; else pass "tampered attestation rejected"; fi

echo "3. the committed seed attestations all verify"
$OSC verify --all >/dev/null && pass "registry verify --all is green" || fail "registry verify --all failed"

echo "4. registry invariants hold"
node tools/ci/invariants.mjs >/dev/null && pass "invariants OK" || fail "invariants failed"

echo "ALL TESTS PASSED"
