#!/usr/bin/env bash
# Enumerate candidate implementations of a concern before auditing it.
#   bash enumerate.sh <repo-path> <concern>
# e.g. bash enumerate.sh /tmp/diy/keystone3-firmware change
set -uo pipefail
REPO="${1:?usage: enumerate.sh <repo-path> <concern>}"
C="${2:?usage: enumerate.sh <repo-path> <concern>}"
cd "$REPO" || exit 1
X=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=target --exclude-dir=build)

hdr(){ printf '\n== %s ==\n' "$1"; }

hdr "Traits with 2-6 implementors (dangerous plurality; security-relevant names first)"
grep -rh "^ *impl .* for " "${X[@]}" --include="*.rs" . 2>/dev/null \
  | sed -E 's/.*impl (<[^>]*> )?([A-Za-z0-9_]+)(<[^>]*>)? for ([A-Za-z0-9_]+).*/\2 <- \4/' \
  | grep -vE "^(Display|Debug|From|Into|TryFrom|TryInto|Default|Clone|Copy|Drop|Deref|Iterator|Serialize|Deserialize|PartialEq|Eq|Hash|Ord|PartialOrd|Free|FromStr|TypeUrl|SerializeJson|InferViewType|Error|AsRef|Borrow|Encodable|Decodable|BorshSerialize|BorshDeserialize) " \
  | sort \
  | awk '{c[$1]=c[$1]" "$3; n[$1]++}
         END{for(t in n) if(n[t]>=2 && n[t]<=6){
               p = (tolower(t) ~ /check|verif|sign|parse|valid|auth|policy|tx|kee|rng|rand/) ? "*" : " ";
               printf "%s  %-24s %d impls:%s\n", p, t, n[t], c[t]}}' \
  | sort -r | head -16
echo "   (* = name suggests security relevance. Read every starred trait before concluding.)"

hdr "Alternative-sounding directories"
find . -type d \( -name legacy -o -name compat -o -name old -o -name "v[0-9]" -o -name deprecated \
  -o -name "stm32*" -o -name "efr32*" -o -name unix -o -name posix -o -name "sim*" \) \
  -not -path './.git/*' -not -path './target/*' 2>/dev/null | head -15

hdr "Conditional compilation around the concern"
grep -rn "#ifdef\|#if defined\|#\[cfg(" "${X[@]}" --include="*.c" --include="*.h" --include="*.rs" . 2>/dev/null \
  | grep -iE "USE_|HAVE_|ENABLE_|feature" | head -12

hdr "Build files mentioning '$C'"
grep -rn "$C" "${X[@]}" --include="*.mk" --include="Makefile*" --include="meson.build" --include="CMakeLists.txt" . 2>/dev/null | head -10

hdr "Python try/except import fallbacks"
grep -rn -A2 "^try:" "${X[@]}" --include="*.py" . 2>/dev/null | grep "import" | head -8

hdr "Same-named definitions in multiple C files (per-platform / fallback)"
grep -rn "^[a-z_]\+ \+[a-z_]*${C}[a-z_]*(" "${X[@]}" --include="*.c" . 2>/dev/null | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -10

printf '\n-- Now build the coverage table. Every path is examined, not examined, or proven unreachable. --\n'
printf -- '-- Write the attestation scope from that table, naming the not-examined paths. --\n'
