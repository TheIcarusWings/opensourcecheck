# OpenSourceCheck

**OpenSourceCheck (OSC)** is a public, git-native registry of LLM-assisted security-review
runs of open-source projects, Bitcoin-first. Every entry is a **signed, human-validated,
reproducible** attestation: which model reviewed which repo, at which commit, with which
prompts, and what came back. It exists because of an asymmetry made painfully concrete on
July 30, 2026, when attackers drained roughly $89M from Coldcard-generated wallets by
exploiting a five-year-old software-PRNG seed bug in open-source firmware — a bug Coinkite
believes an attacker found with AI assistance, while Coinkite's own AI audit weeks earlier
found nothing. Attackers already run frontier LLMs against Bitcoin codebases in private.
Defenders' AI audit results, when they exist at all, are scattered, unsigned, and
unreproducible. OSC closes that gap by giving every LLM-assisted review a durable, verifiable
public record.

> OSC records what was *checked* and what came back. It never asserts code is "safe."
> A clean AI run can and does miss real bugs (Coldcard proved it).

## What one attestation is

One attestation is one audit run, fully specified:

> Model **M** vN, driven by harness **H**, given exact prompts **P** with transcript hash
> **T**, reviewed repo **R** at exact commit **C** on date **D** → it reported findings
> **F** → human validator **X** triaged each finding to a verdict → the whole record is
> signed by **X**.

`none-found` / `clean-run` is a first-class result, not a lesser one. The single most useful
attestation in the registry is often "model X ran over scope S and found nothing" — that is
exactly the kind of record that would have made Coinkite's pre-hack audit auditable after
the fact.

## Verify it yourself

Verification is fully offline and trusts no server. It checks the JSON structure of each
attestation and validates its signature against the auditor's registered key, whichever of
the three schemes the signer used: Nostr signatures (BIP-340 schnorr / secp256k1) are
checked in pure JS via the installed `@noble/curves` / `@scure/base`; SSH (`ssh-ed25519`)
and PGP signatures are checked by shelling out to the standard `ssh-keygen` and `gpg` tools.
No network calls and no trusted third party, either way.

```bash
git clone https://github.com/TheIcarusWings/opensourcecheck.git
cd opensourcecheck
npm ci
node tools/osc/osc.mjs verify --all
```

To verify a single attestation:

```bash
node tools/osc/osc.mjs verify attestations/coldcard/firmware/OSC-2026-0001.json
```

## Submit an attestation

```bash
npm ci
node tools/osc/osc.mjs keygen                  # first time only: generate npub + nsec
node tools/osc/osc.mjs new-run > my.json
# edit my.json: target repo/commit, run details, findings, verdict, auditor id
node tools/osc/osc.mjs sign my.json --nsec nsec1...
```

Sign with whichever key you already have — Nostr (above) is the default, but SSH and PGP
work too:

```bash
node tools/osc/osc.mjs sign my.json --ssh-key ~/.ssh/id_ed25519 --principal you@example.com
node tools/osc/osc.mjs sign my.json --pgp [--gpg-key <keyid>]
```

Register your key by adding `auditors/<you>.json`, then open a PR. Full step-by-step
instructions, field-by-field, are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## How trust works

OSC is a web of trust, not a gatekeeper. Anyone can submit an attestation, and CI enforces
only *form*: schema validity, a real signature, a real (non-branch) commit. It does not rank
findings or decide what's true. Weight comes from an auditor's track record — validated
findings, false-positive rate, disputes — visible in their history. An auditor's identity —
an npub (Nostr), an SSH principal, or a PGP fingerprint, depending on which key they signed
with — is cross-checked out of band: via their Nostr profile or a NIP-05,
`github.com/<user>.keys`, or a keyserver, not a centralized key directory. Maintainers merge
PRs and enforce the disclosure policy; they do not rank code safety. See
[policy/GOVERNANCE.md](./policy/GOVERNANCE.md) and [policy/DISCLOSURE.md](./policy/DISCLOSURE.md).

## Responsible disclosure

A registry of findings in live Bitcoin software is a target-acquisition feed if run
carelessly. Findings of severity `medium` or higher in actively-used software are published
as `withheld-pending-disclosure`: the attestation itself (auditor, target, date, severity)
is public, but the finding body is redacted and only a `body_sha256` hash-commitment is
published, proving priority without leaking the details, until the fix ships. See
[policy/DISCLOSURE.md](./policy/DISCLOSURE.md).

## Repository layout

```
opensourcecheck/
├── schema/attestation.schema.json      # JSON Schema, versioned (osc-attestation/v0)
├── attestations/<org>/<repo>/OSC-YYYY-NNNN.json  # one file per audit run
├── prompts/                            # versioned, named audit prompt packs
├── transcripts/                        # full run transcripts (or refs for large ones)
├── auditors/                           # one file per auditor: keys (nostr/ssh/pgp), contact
├── tools/osc/                          # the osc CLI
├── tools/lib/                          # shared signing primitives (nostr.mjs, schemes.mjs)
├── tools/ci/                           # registry-wide CI invariant checks
├── policy/                             # GOVERNANCE.md, DISCLOSURE.md
├── site/                               # static viewer (Layer 2)
└── .github/workflows/validate.yml      # schema + signature + invariant checks on every PR
```

## Architecture (4 layers)

1. **Git registry (canonical)** — this repo is the source of truth; everything else is a
   view onto it.
2. **Static site viewer (readable)** — a static build from the repo JSON for people who
   don't want to read raw files.
3. **Nostr bot (distribution)** — publishes each merged attestation and notifies watchers
   of a target repo.
4. **Community (audit club + "Checked" badge)** — recurring audit sessions and a badge
   projects can display that deliberately says *checked*, never *safe*.

Each layer works without the ones above it — the registry is fully useful as a plain git
repo even if the site, bot, and community program never ship.

## Status

Early. Schema v0, the `osc` CLI, CI validation, and two seed attestations (Coldcard
firmware, BDK) have landed. See [PLAN.md](./PLAN.md) for the full rationale and roadmap.

**Note:** the key in `auditors/opensourcecheck-demo.json` is a throwaway demo key used only
to produce reproducible seed attestations and CI self-tests. Its private half is
intentionally committed under `tools/osc/test/`. Anyone can forge this identity — never
trust its verdicts.

## License

Schema and tools (`schema/`, `tools/`) are MIT/CC0. Attestation content is CC-BY —
attribution matters for auditor reputation.
