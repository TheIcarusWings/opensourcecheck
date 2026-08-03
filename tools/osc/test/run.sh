#!/usr/bin/env bash
# Self-test for the trust core: sign -> verify -> reject-tamper. Nostr (schnorr) signatures.
# Run: bash tools/osc/test/run.sh   (from repo root). Exits non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")/../../.."
OSC="node tools/osc/osc.mjs"
NSEC="tools/osc/test/demo.nsec"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; exit 1; }

echo "1. scaffold + sign + verify a fresh attestation"
$OSC new-run > "$TMP/a.json"
node -e '
const f=process.argv[1];const j=JSON.parse(require("fs").readFileSync(f));
j.target.commit="a".repeat(40);
j.auditor={id:"opensourcecheck-demo",name:"OpenSourceCheck Demo Key"};
delete j.run.transcript_sha256;
require("fs").writeFileSync(f,JSON.stringify(j,null,2));' "$TMP/a.json"
$OSC sign "$TMP/a.json" --key "$NSEC" >/dev/null 2>&1
$OSC verify "$TMP/a.json" >/dev/null && pass "signed attestation verifies" || fail "fresh signature did not verify"

echo "2. tampering with a signed field is rejected"
cp "$TMP/a.json" "$TMP/tampered.json"
node -e 'const f=process.argv[1];const s=require("fs").readFileSync(f,"utf8").replace("Nothing found in scope.","INJECTED");require("fs").writeFileSync(f,s)' "$TMP/tampered.json"
if $OSC verify "$TMP/tampered.json" >/dev/null 2>&1; then fail "tampered attestation verified (should not)"; else pass "tampered attestation rejected"; fi

echo "3. a signature from an unregistered key is rejected"
cp "$TMP/a.json" "$TMP/foreign.json"
FOREIGN_NSEC="$($OSC keygen | awk '/^nsec:/{print $2}')"
$OSC sign "$TMP/foreign.json" --nsec "$FOREIGN_NSEC" >/dev/null 2>&1
if $OSC verify "$TMP/foreign.json" >/dev/null 2>&1; then fail "foreign-key signature verified (should not)"; else pass "unregistered-key signature rejected"; fi

echo "4. the committed seed attestations all verify"
$OSC verify --all >/dev/null && pass "registry verify --all is green" || fail "registry verify --all failed"

echo "5. registry invariants hold"
node tools/ci/invariants.mjs >/dev/null && pass "invariants OK" || fail "invariants failed"

echo "ALL TESTS PASSED"
