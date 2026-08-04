# Prompt Packs

A **prompt pack** is the exact, versioned prompt text an auditor feeds to an LLM to produce
an OpenSourceCheck attestation. It is not a description of a prompt — it is the prompt,
ready to paste into Claude, GPT, Gemini, or a local model, followed by pointing the model at
a repo (or a `subpath` within one).

Every attestation's `run.prompts_ref` field points to one file in this directory. Anyone who
wants to check, contest, or re-run an attestation reads the same file the original auditor
used and can reproduce the run.

## Why prompts are pinned and versioned

LLM output is **prompt-sensitive and non-deterministic**. Two auditors running "an entropy
audit" from memory, or from slightly different phrasings, will get different coverage and
different findings — and neither result is comparable to the other or reproducible later.
Pinning the exact prompt text removes one entire axis of variance, so that when results
differ, the difference is attributable to the model, the run, or the code — not to the
prompt.

This is why the registry does not let attestations paste ad hoc prompts inline: `prompts_ref`
must point to a file that lives in this directory, under version control, forever.

## The immutability rule

**A published prompt pack is never edited in place.** Once a pack has been referenced by any
attestation (merged or not), its content is frozen. Filenames carry the version explicitly —
`deep-audit-v1.md`, `entropy-rng-audit-v1.md` — and any change, however small (a reworded
checklist item, an added output field, a fixed typo), ships as a **new file with the version
bumped**: `deep-audit-v2.md`, `entropy-rng-audit-v2.md`, and so on. Older attestations keep
pointing at the old version forever; that is the point. Rationale: if `deep-audit-v1.md`
could change underneath existing attestations, `prompts_ref` would stop meaning anything —
"re-run this audit" would silently become "run a different audit we didn't tell you about."

If a pack needs to change, open a PR that adds the new versioned file. Do not delete or
rewrite superseded packs; they remain part of the historical record even after newer
versions exist.

## Non-determinism and repeat runs

Because LLM output varies run to run even with an identical prompt, a single run is weak
evidence on its own — especially for a `none-found` / `clean-run` result. **Run the same
prompt pack against the same target commit multiple independent times** and record how many
in `run.runs_count`. Disagreement between runs (one surfaces a finding another misses) is
itself signal worth recording, not noise to average away — see `OSC-2026-0002` for an
example of a `clean-run` attestation built from three independent runs.

## Model-agnostic by design

Prompt packs contain no model-specific tuning, system-prompt tricks, or vendor API syntax —
they are plain instructions any capable frontier or local model can follow. This is
deliberate: the registry compares models by running the *same* pack against the *same*
target, not by rewarding whichever pack was hand-tuned to one vendor's quirks. The specific
model used for a given run (exact model ID, never a marketing name) and the harness that
drove it (e.g. `claude-code v3.1`, `manual-chat`, a custom script) are recorded in the
attestation's `run.model` and `run.harness` fields — not in the prompt pack.

## Index of available packs

| Pack | Use for | Referenced by |
|---|---|---|
| [`deep-audit-v1.md`](./deep-audit-v1.md) | General-purpose deep security audit of a repo or module — memory safety, parsing, crypto misuse, key handling, serialization, arithmetic, concurrency, supply chain, build config, consensus-critical logic | `OSC-2026-0002` (BDK) |
| [`entropy-rng-audit-v1.md`](./entropy-rng-audit-v1.md) | Focused review of randomness and seed-generation paths — entropy sources, TRNG-vs-PRNG selection, build flags that can silently weaken RNG, nonce generation in signing | `OSC-2026-0001` (Coldcard firmware) |

Both packs instruct the model to output findings that map directly onto the attestation
schema's `findings[]` array (`schema/attestation.schema.json`), to explicitly emit a
`none-found` result when nothing is in scope to report, and to never fabricate a finding.
Raw model output from either pack is `status: unreviewed` until a named human validator
reproduces and triages it — see the root [README.md](../README.md) and
[policy/DISCLOSURE.md](../policy/DISCLOSURE.md).

## tx-authorization-audit-v1.md

Audits the **transaction authorization** loss-of-funds class: change-output verification,
input-amount proof and fee sanity (the historical SegWit fee attack), what-you-see-is-what-you-sign,
key-material exposure, receive-address and descriptor handling, hostile-input parser robustness,
and firmware update integrity.

Use this for wallets and signers that construct or sign transactions. It does not apply to
libraries with no transaction logic (a BIP-39 word-list implementation, a curve binding); the
pack requires the model to say so explicitly rather than inventing findings.

## v2 packs (use these for new audits)

`entropy-rng-audit-v2.md` and `tx-authorization-audit-v2.md` are the current packs. Each is
its v1 predecessor plus a mandatory **section 0: enumerate every path before concluding**, whose
canonical text lives in `_path-coverage.md`.

That section exists because of two real errors in this registry, both caught only when a second
model audited the same target: an auditor read one implementation of a concern, read it
correctly, and generalised to the whole product. Section 0 requires enumerating candidate
implementations first, classifying each as examined / not examined / proven unreachable, and
writing the attestation scope from that table so it names what was *not* covered.

**v1 packs are not deprecated and must not be edited.** Attestations OSC-2026-0001 through 0032
reference them, and their reproducibility depends on the exact text used at the time. Use v2 for
new work.
