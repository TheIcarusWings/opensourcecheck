# Enumeration recipes by language

Run these BEFORE reading any implementation. You are looking for plurality.
Substitute `<CONCERN>` with the thing you care about: `change`, `entropy`, `rng`, `nonce`, `seed`.

## Rust

```sh
# Trait implementors: the single most productive search. A trait with one impl is unusual.
grep -rn "impl .*Checker for\|impl .*Signer for\|impl .*Verifier for" --include=*.rs .
grep -rn "impl <TRAIT> for" --include=*.rs .

# Conditional compilation selecting a different implementation
grep -rn "#\[cfg(" --include=*.rs . | grep -iE "feature|target_|not\("

# Enum dispatch: one variant per path
grep -rn "match .*{" --include=*.rs . | grep -i "<CONCERN>"

# Modules that sound like alternatives
find . -type d \( -name legacy -o -name compat -o -name v1 -o -name old \) -not -path '*/target/*'
```

## C / C++ / embedded firmware

```sh
# Same symbol defined in more than one file = per-platform or fallback implementations
grep -rn "^[a-z_]* *<FUNC>(" --include=*.c . | awk -F: '{print $1}' | sort -u

# A header with several implementers
grep -rln "$(basename <HEADER>.h)" --include=*.c .

# Build-time selection, the Coldcard failure shape
grep -rn "<CONCERN>" --include=*.mk --include=Makefile --include=meson.build --include=CMakeLists.txt .

# Conditional compilation
grep -rn "#ifdef\|#if defined" --include=*.c --include=*.h . | grep -iE "USE_|HAVE_|ENABLE_"

# Per-platform source directories
find . -type d \( -name stm32* -o -name efr32* -o -name unix -o -name posix -o -name sim* \)
```

Weak-symbol and linker overrides are invisible to grep. If a function is declared in a header
but defined in several places, check which object the build actually links. That is exactly how
the Coldcard bug worked: the board file failed to define `rng_get`, so the linker silently took
MicroPython's software-PRNG version.

## Python

```sh
# Subclasses and duck-typed alternatives
grep -rn "class .*(<BASE>)" --include=*.py .
grep -rn "def <METHOD>" --include=*.py .        # same method name in several classes

# Runtime dispatch
grep -rn "getattr(\|importlib\|registry\[\|handlers\[" --include=*.py .

# Try/except import fallbacks: the embit pattern
grep -rn -A3 "^try:" --include=*.py . | grep -B1 "^.*import"
```

## Any language: find the callers, not just the definition

The definition tells you what a function does. The **call sites** tell you whether it is the
only one used, and what happens upstream.

```sh
grep -rn "<FUNC>(" . | grep -v "define\|declaration"   # every call site
```

If a function receives an already-processed input (a hash, a parsed struct, a validated flag),
whatever produced that input is part of the same concern and must be enumerated too. That is the
Bitkey mistake: `bip32_sign_with_policy` takes a digest, and the code that built the digest from
a PSBT was a whole separate path.

## Recording the result

Before writing any conclusion, produce this table:

| Path | Location | Status |
| --- | --- | --- |
| PSBT | `transactions/psbt/wrapped_psbt.rs` | examined |
| legacy protobuf | `transactions/legacy/tx_data.rs` | NOT examined |

Then write the scope from the table, naming the not-examined rows explicitly.
