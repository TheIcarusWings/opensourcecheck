# Shared requirement: enumerate every path before concluding

*Included by all `*-audit-v2.md` packs. Do not edit once a v2 pack referencing it has been used
in a published attestation; publish a new version instead.*

---

## Why this section exists

The most common way an AI code audit is wrong is not hallucination. It is finding **one**
implementation of a concern, reading it correctly, and generalising to the whole product without
checking whether other implementations exist.

The finding is accurate. The conclusion is false. And it is written confidently, which makes it
worse than saying nothing.

This has happened twice in this registry, both times caught only because a second model audited
the same target independently:

**Keystone3.** An auditor read `wrapped_psbt.rs`, found genuinely correct change-output
verification, and concluded the firmware handles transaction authorisation correctly. It missed
`transactions/legacy/`, a second live dispatch arm where `is_mine` is set from an
attacker-controlled string with no derivation at all. A HIGH severity issue lived there. One
search would have caught it:

```sh
grep -rn "impl TxChecker for" rust/ --include="*.rs"    # -> WrappedPsbt AND TxData
```

**Bitkey.** An auditor read `bip32_sign_with_policy`, saw it takes a 32-byte digest, and
concluded the hardware does not parse transactions at all, marking the entire change-output
checklist "not applicable". False: `firmware/lib/psbt/src/psbt.c` exists and
`wallet_change_output_belongs_to_policy` re-derives the expected script.

Same pattern both times: found a path, read it well, assumed it was *the* path.

## What you must do

### 1. Phrase the concern as a question about the product

"Where does seed entropy come from?" not "what does `GenerateEntropy` do?"
"How is an output decided to be change?" not "what does `parse_my_output` do?"

### 2. Enumerate candidates before reading any of them

Run the searches below for the languages present. You are looking for **plurality**.

**Rust** — traits with 2 to 6 implementors are the strongest signal. Ignore boilerplate
(`Display`, `From`, `Serialize`); look at names containing check, verif, sign, parse, valid,
auth, policy, tx:

```sh
grep -rh "^ *impl .* for " --include="*.rs" . \
  | sed -E 's/.*impl (<[^>]*> )?([A-Za-z0-9_]+)(<[^>]*>)? for ([A-Za-z0-9_]+).*/\2 <- \4/' \
  | sort | uniq -c | sort -rn
grep -rn "#\[cfg(" --include="*.rs" . | grep -iE "feature|target_"
```

**C / firmware** — the same symbol defined in several files means per-platform or fallback
implementations. Build-time selection is the Coldcard failure shape:

```sh
grep -rn "<FUNC>(" --include="*.c" . | awk -F: '{print $1}' | sort -u
grep -rn "#ifdef\|#if defined" --include="*.c" --include="*.h" . | grep -iE "USE_|HAVE_|ENABLE_"
grep -rn "<CONCERN>" --include="*.mk" --include=Makefile --include=meson.build --include=CMakeLists.txt .
find . -type d \( -name "stm32*" -o -name "efr32*" -o -name posix -o -name unix -o -name "sim*" \)
```

Weak symbols and linker overrides are invisible to grep. If a function is declared in a header
but defined in several places, check which object the build links. That is precisely how the
Coldcard bug worked: the board file failed to define `rng_get`, so the linker silently took
MicroPython's software-PRNG version.

**Python** — subclasses, duck-typed alternatives, and try/except import fallbacks:

```sh
grep -rn "class .*(<BASE>)" --include="*.py" .
grep -rn -A3 "^try:" --include="*.py" . | grep import
```

**Any language** — find the *callers*, not just the definition. If a function receives an
already-processed input (a digest, a parsed struct, a validated flag), whatever produced that
input is part of the same concern and must be enumerated too. That is the Bitkey mistake.

### 3. Build a coverage table

| Path | Location | Status |
| --- | --- | --- |
| PSBT | `transactions/psbt/wrapped_psbt.rs` | examined |
| legacy protobuf | `transactions/legacy/tx_data.rs` | NOT examined |

Every path is **examined**, **not examined**, or **proven unreachable**. "It looks old" is not
proof of unreachability; show no callers, or exclusion by the build.

### 4. Write the scope from the table, never broader

A scope saying "the transaction-authorization class" claims every path. A scope saying "the PSBT
path; the legacy path at `transactions/legacy/` was NOT examined" claims exactly what you did.

**If you did not enumerate, you may not write a general scope. Write the narrow one.**

### 5. Before writing "no defect found" or "not applicable", answer this

> How many implementations of this concern exist, and did I read all of them?

If you cannot answer with a number and a list, you are not finished. Marking a whole checklist
"not applicable" is a strong claim about the entire product and requires the same enumeration as
a finding does.

## Smells that mean another path exists

- Directories named `legacy/`, `v1/`, `old/`, `compat/`, `deprecated/`
- Per-platform directories: `stm32/`, `efr32/`, `unix/`, `posix/`, `sim/`
- `#ifdef`, `#[cfg(...)]`, or `feature =` around what you are reading
- A trait, interface, or abstract base class: rarely exactly one implementor
- A build file selecting different sources per target
- A function taking already-processed input
- The words fallback, legacy, compat, or unsupported nearby

## Honesty rule

A stated gap beats a confident generalisation. "I could not resolve `seed_t` from a blobless
clone, so I make no claim about seed length" is a good record: it is checkable and someone can
close it. A guess dressed as a finding is not recoverable, because nobody knows to check it.
