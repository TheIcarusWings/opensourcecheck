---
name: audit-path-coverage
description: Enumerate every code path that could implement a security-relevant concern before concluding anything about it. Use when auditing code, writing an attestation scope, or about to claim a project handles something correctly. Prevents the single-path generalisation error, where one implementation is found and mistaken for the only one. Triggers on security audit, attestation, "does X verify Y", scope statement, "no defect found".
---

# Enumerate every path before you conclude

The most common way an AI code audit is wrong is not hallucination. It is finding **one**
implementation of a concern, reading it correctly, and then generalising to the whole product
without checking whether other implementations exist.

The finding is accurate. The conclusion is false. And it is confidently written, which makes it
worse than saying nothing.

## Two real failures from this registry

**Keystone3 (OSC-2026-0008).** Read `wrapped_psbt.rs`, found genuinely correct change-output
verification, concluded the firmware handles transaction authorisation correctly. Missed
`transactions/legacy/`, a second live dispatch arm where `is_mine` is set from an
attacker-controlled string with no derivation at all. An independent model found a HIGH
severity vulnerability there.

One search would have caught it:

```sh
grep -rn "impl TxChecker for" rust/    # -> WrappedPsbt AND TxData
```

**Bitkey (OSC-2026-0028, corrected before publication).** Read `bip32_sign_with_policy`, saw it
takes a 32-byte digest, concluded the hardware does not parse transactions at all and that
change verification was *not applicable*. False. `firmware/lib/psbt/src/psbt.c` exists and
`wallet_change_output_belongs_to_policy` re-derives the expected script.

One search would have caught it:

```sh
grep -rn "change\|psbt" firmware/lib/ --include=*.h | grep -i "policy\|verif"
```

Both times the pattern was identical: found a path, read it well, assumed it was the path.

## The procedure

### 1. State the concern as a question, not a location

Write down what you are trying to establish, phrased so it is about the *product*, not a file:

- "Where does seed entropy come from?" not "what does GenerateEntropy do?"
- "How is an output decided to be change?" not "what does parse_my_output do?"

### 2. Enumerate candidate implementations before reading any of them

Run the searches in `references/enumeration.md` for the language in question. You are looking
for **plurality**: two trait impls, two platform directories, a legacy and a modern path, a
build flag selecting between sources.

Write the list down. If the list has one entry, prove it has one entry rather than assuming.

### 3. Classify every candidate

For each path found, record one of:

- **examined** — you read it and can cite `file:line`
- **not examined** — you did not read it, and the scope must say so by name
- **not reachable** — you verified it is dead code, and can show why (no callers, excluded by
  the build). "It looks old" is not evidence.

### 4. Write the scope to match the list, never broader

This is where the error becomes public. A scope saying "the transaction-authorization class"
claims every path. A scope saying "the PSBT path in `transactions/psbt/`; the legacy path in
`transactions/legacy/` was NOT examined" claims exactly what you did.

**If you did not enumerate, you may not write a general scope.** Write the narrow one.

### 5. Before writing "no defect found", answer this out loud

> How many implementations of this concern exist in the codebase, and did I read all of them?

If you cannot answer with a number and a list, you are not finished.

## Smells that mean another path exists

Seeing any of these means stop and search again:

- A directory named `legacy/`, `v1/`, `old/`, `compat/`, `deprecated/`
- Per-platform directories: `stm32/`, `efr32/`, `unix/`, `posix/`, `sim/`
- `#ifdef` / `#[cfg(...)]` / `feature =` around the thing you are reading
- A trait, interface, or abstract base class: there is rarely exactly one implementor
- A build file (meson, cmake, Makefile) that selects different sources per target
- A function that takes an already-processed input (a digest, a parsed struct): something
  upstream produced it, and that upstream is also in scope
- The words "fallback", "legacy", "compat", or "unsupported" anywhere nearby

## What good looks like

The Trezor entropy audit (OSC-2026-0025) got this right by accident of thoroughness: it
followed `random.bytes(32, True)` through the MicroPython binding into `rng_fill_buffer_strong`
and found the `USE_OPTIGA` / `USE_TROPIC` conditionals, then recorded that the guarantee is
compile-time conditional. That is the standard: follow the call chain to where the decision is
actually made, and record the branches you did not take.

## Honesty rule

A stated gap is worth more than a confident generalisation. "I could not resolve `seed_t` from a
blobless clone, so I make no claim about seed length" is a good record. It is checkable, and
someone else can close it. A guess dressed as a finding is not recoverable, because nobody knows
to check it.
