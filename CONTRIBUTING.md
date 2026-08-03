# Contributing to OpenSourceCheck

OpenSourceCheck (OSC) is a public registry of LLM-assisted security-review attestations.
This document covers how to submit an attestation, how to register as an auditor, what CI
enforces, what "reproducible" means here, the anti-slop rule, and your disclosure duty if
you find something real. Read [PLAN.md](./PLAN.md) for the full rationale if you haven't.

## Submitting an attestation

### 1. Scaffold a new run

The `osc` CLI has one audited crypto dependency (`@noble/curves`, `@scure/base` — used for
Nostr signing and verification). SSH and PGP signing/verification instead shell out to the
standard `ssh-keygen` and `gpg` tools, so make sure whichever you plan to use is installed.
Install the npm dependency once at the repo root before running any `osc` command:

```bash
npm ci
node tools/osc/osc.mjs new-run > my-run.json
```

This prints a blank attestation matching `schema/attestation.schema.json` (schema
`osc-attestation/v0`).

### 2. Fill in `target`

```jsonc
"target": {
  "repo": "https://github.com/ORG/REPO",
  "commit": "a1b2c3...  (full 40-hex SHA-1)",
  "subpath": "shared/",        // optional: narrows scope to a path
  "release_tag": "v5.6.0"      // optional: human anchor
}
```

`target.commit` **must be a full 40-character git SHA-1 — never a branch name.** A branch
moves; an audit of `main` is meaningless a week later. CI rejects anything that doesn't
match `^[0-9a-f]{40}$`.

### 3. Fill in `run`

```jsonc
"run": {
  "date": "2026-08-04",                       // UTC, YYYY-MM-DD
  "model": "claude-opus-4-8",                  // exact model id, NEVER a marketing name
  "harness": "claude-code v3.1",                // tool + version that drove the model
  "prompts_ref": "prompts/deep-audit-v1.md",    // required: path to the exact prompts used
  "transcript_sha256": "…",                     // sha256 of the full transcript
  "transcript_uri": "transcripts/OSC-2026-00NN.md", // optional if transcript is small enough to commit directly
  "scope": "What was and was NOT reviewed.",    // required — unscoped audits aren't interpretable
  "duration_minutes": 45,
  "cost_estimate_usd": 12,
  "runs_count": 1
}
```

- `prompts_ref` is required and must point to a prompt pack **committed under `prompts/`**
  in this repo, so anyone can re-run the same audit.
- Transcripts belong either directly under `transcripts/` (referenced via `transcript_uri`
  as a repo-relative path) or at an external location (`https://`, `ipfs://`, `magnet:`)
  referenced by `transcript_uri`, with `transcript_sha256` set to the hash of that
  transcript either way. Get the hash with:

  ```bash
  node tools/osc/osc.mjs hash transcripts/OSC-2026-00NN.md
  ```

### 4. Fill in `findings` and `verdict`

Each finding needs a `ref` matching `OSC-YYYY-NNNN-Fn` where the `OSC-YYYY-NNNN` prefix
matches the attestation's own `id` (e.g. attestation `OSC-2026-0003` → findings
`OSC-2026-0003-F1`, `OSC-2026-0003-F2`, ...). Required fields per finding: `ref`,
`severity` (`critical|high|medium|low|info|none-found`), `status`
(`validated|false-positive|disputed|unreviewed|withheld-pending-disclosure`), `summary`.

A run that found nothing must still contain exactly one finding, with
`severity: "none-found"`, and the attestation's `verdict` must be `"clean-run"`. `findings`
can never be an empty array — that's how the schema and `osc.mjs`'s structural validator
enforce that a clean run is recorded explicitly rather than omitted.

`verdict` is one of `findings-validated`, `clean-run`, `inconclusive`.

### 5. Fill in `auditor` and sign

```jsonc
"auditor": { "id": "your-slug", "name": "Your Name", "contact": "you@example.com" }
```

`auditor.id` must match a file you create at `auditors/<your-slug>.json` (see below). Sign
the attestation with whichever key type you register there — **Nostr, SSH, or PGP, your
choice**. All three bind the same canonicalized payload (RFC 8785 JCS, `signature` field
excluded): `"osc-attestation/v0\n" + canonical-json`. Nostr signs the sha256 digest of that
payload; SSH and PGP sign the payload directly (they hash internally).

**Nostr.** If you don't have a key yet, generate one:

```bash
npm ci
node tools/osc/osc.mjs keygen
```

This prints a fresh `npub` (public, register it in your auditor file) and `nsec` (secret,
keep it private). Then sign:

```bash
node tools/osc/osc.mjs sign my-run.json --nsec nsec1...
```

(or `--key <file containing the nsec>`, or set `$OSC_NSEC`). This writes the signed
`signature` block — `alg: "nostr-schnorr"`, `principal: "<your npub>"`, `value: "<128-hex
schnorr signature>"` — back into the file in place. There is no `--principal` flag for
Nostr: the npub is derived from the key you sign with, and it must be one of the `npub`s you
register in your auditor file (see next section).

**SSH.** Sign with an existing SSH key via `ssh-keygen -Y sign`:

```bash
node tools/osc/osc.mjs sign my-run.json --ssh-key ~/.ssh/id_ed25519 --principal you@example.com
```

`--principal` is an identity string of your choosing (an email works well) — it must match
the `principal` you register for this key in your auditor file exactly. This writes `alg:
"ssh-ed25519"`, your `principal`, and an armored SSHSIG block as `value`.

**PGP.** Sign with `gpg`:

```bash
node tools/osc/osc.mjs sign my-run.json --pgp [--gpg-key <keyid>]
```

`--gpg-key` selects a specific key (`gpg --local-user <keyid>`); omit it to sign with your
default key. This writes `alg: "pgp"`, `principal: "<your 40-hex key fingerprint>"`, and an
armored PGP signature block as `value`.

Whichever scheme you use, the resulting key — npub, or SSH principal + `ssh_key`, or PGP
fingerprint + `public_key` — must be registered in your auditor file; see the next section.

You can inspect exactly what gets signed with:

```bash
node tools/osc/osc.mjs canonicalize my-run.json
node tools/osc/osc.mjs digest my-run.json        # the sha256 Nostr signs (ssh/pgp sign the payload directly)
```

### 6. Place the file and open a PR

Save the signed file as `attestations/<org>/<repo>/OSC-YYYY-NNNN.json` (e.g.
`attestations/coldcard/firmware/OSC-2026-0003.json`), matching the `id` field. Then open a
PR. CI runs `osc verify --all`, full JSON Schema validation, and the registry invariant
checks automatically (see below).

## Registering as an auditor

Create `auditors/<slug>.json`. Shape, following the demo file at
`auditors/opensourcecheck-demo.json` (and the blank template at `auditors/TEMPLATE.json`):

```jsonc
{
  "id": "your-slug",
  "name": "Your Name",
  "contact": "you@example.com",
  "keys": [
    { "type": "nostr", "npub": "npub1... your Nostr public key (NIP-19)" },
    { "type": "ssh", "principal": "you@example.com", "ssh_key": "ssh-ed25519 AAAA... (contents of ~/.ssh/id_ed25519.pub)" },
    { "type": "pgp", "fingerprint": "0123456789ABCDEF0123456789ABCDEF01234567", "public_key": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----\n" }
  ]
}
```

`keys` is an array; keep only the entry type(s) you'll actually sign with (see
`auditors/TEMPLATE.json`) — you don't need all three. `type` is optional and inferred from
the fields present (`npub` → nostr, `ssh_key` → ssh, `public_key`/`fingerprint` → pgp), but
writing it explicitly is clearer. You can register several entries — multiple of the same
type for key rotation, or one of each type to support more than one signing scheme:

- **nostr** — `{ "type": "nostr", "npub": "npub1..." }`: a public Nostr identity (NIP-19),
  never a private key (`nsec`).
- **ssh** — `{ "type": "ssh", "principal": "you@example.com", "ssh_key": "ssh-ed25519 AAAA..." }`:
  `ssh_key` is the key type + base64 only (the contents of e.g. `~/.ssh/id_ed25519.pub`);
  `principal` is the identity string you pass to `--principal` when signing, and must match
  exactly.
- **pgp** — `{ "type": "pgp", "fingerprint": "…40 hex chars…", "public_key": "-----BEGIN PGP PUBLIC KEY BLOCK----- …" }`:
  `fingerprint` is your key's 40-hex fingerprint; `public_key` is the full armored public-key
  block (verification imports it into a scratch keyring rather than relying on a public
  keyserver being reachable).

The Nostr key is also the identity you publish under when the attestation is distributed
(layer 3) — one identity across layers, if you use it. Whichever scheme(s) you register,
publish the same key material somewhere public so anyone can cross-check your identity out
of band — a Nostr profile or NIP-05 (nostr), `github.com/<user>.keys` (ssh), or a keyserver
(pgp). This is a lightweight way to catch a mismatched or substituted key.

## What CI enforces

On every PR touching `attestations/`, `auditors/`, `schema/`, or `tools/`,
`.github/workflows/validate.yml` runs three checks in order:

1. **`node tools/osc/osc.mjs verify --all`** — structural checks (matching `validateStructure`
   in `tools/osc/osc.mjs`) plus signature verification against the auditor's registered key
   of the matching type. The signature may be `nostr-schnorr`, `ssh-ed25519`, or `pgp`, each
   verified against the auditor's registered key of that type: Nostr is verified in pure JS
   (BIP-340 schnorr / secp256k1, via `@noble/curves` / `@scure/base`); SSH and PGP are
   verified by shelling out to the standard `ssh-keygen` and `gpg` tools. CI runs `npm ci`
   first to install the Nostr crypto dependency — verification itself is still fully offline
   and trusts no server, whichever scheme was used.
2. **`ajv-cli` against `schema/attestation.schema.json`** — full JSON Schema validation
   (draft 2020-12).
3. **`node tools/ci/invariants.mjs`** — registry-wide invariants that a single-file schema
   check can't catch:
   - attestation `id`s are unique across the whole registry;
   - every attestation's `auditor.id` has a matching `auditors/<id>.json`;
   - `run.prompts_ref` resolves to a file that exists in-repo;
   - an in-repo `run.transcript_uri` resolves to a file that exists (external `https?://`,
     `ipfs://`, `magnet:` URIs are exempt from this check but still expected to be reachable);
   - `target.commit` is a real 40-hex SHA-1, never a branch name;
   - finding `ref`s are globally unique and each one is prefixed by its own attestation's
     `id` (`OSC-YYYY-NNNN-Fn` must start with `OSC-YYYY-NNNN`);
   - a `severity: "none-found"` finding requires `verdict: "clean-run"`.

## Reproducibility expectations

LLM output is non-deterministic, so "reproducible" here means *re-runnable and comparable*,
not bit-identical. To make that possible:

- Pin the **exact model id** (`run.model`), never a marketing name — "claude-opus-4-8", not
  "Claude".
- Pin the **exact harness version** (`run.harness`) — e.g. "claude-code v3.1", not just
  "claude-code".
- **Commit your prompts** under `prompts/` and reference them via `prompts_ref`, so someone
  else can point the same prompts at the same commit.
- **Publish the transcript** (or its hash plus an external reference) so the run's actual
  output is auditable, not just its conclusion.
- Prefer running **N independent times** and setting `run.runs_count` — since a single run
  can miss something a second run catches (or vice versa), repetition strengthens the
  signal. Disagreement across models or across runs of the same model is welcome signal,
  not noise — render it, don't suppress it.

## The anti-slop rule

Raw model output is never published as a validated finding. Every finding starts life at
`status: "unreviewed"` — that's what `osc new-run` scaffolds by default. Only a named human
may move a finding to `status: "validated"` or `status: "false-positive"`, and doing so
requires `validator` (who) and `validator_notes` (how it was reproduced or refuted) — the
schema requires `validator` for both of those statuses.

This gate exists because of what happened to curl: in early 2026 curl ended its bug bounty
program after roughly 20% of submissions turned out to be fabricated AI-generated reports,
and its confirmed-vulnerability rate fell below 5%. A registry that ingests raw LLM output
unfiltered becomes exactly that kind of slop amplifier. OSC's value is in the human
validation step — an attestation without a named validator behind its `validated` claims is
not trustworthy, and CI's structural checks won't let one through.

## Disclosure duty

If your run surfaces a finding of severity `medium` or higher in **actively-used, live
software**, you have a disclosure duty before you publish the finding body:

1. Set that finding's `status` to `"withheld-pending-disclosure"` and set `body_sha256` to
   the SHA-256 of the full finding text (get it with `node tools/osc/osc.mjs hash <file>`
   over a file containing just the body). This publishes the fact that something was found,
   with provable priority and timestamp, without leaking exploitable detail.
2. Report the finding to the target project's own security contact, if you haven't already.
3. Follow [policy/DISCLOSURE.md](./policy/DISCLOSURE.md) for embargo timelines and when the
   body can be un-redacted and published in full.

`clean-run` and `low`/`info` findings can be published immediately — the withholding rule
applies specifically to medium-and-above findings in live software.

## Code of conduct / neutrality

- OSC is **model-vendor neutral**. Record whatever model was actually used —
  `claude-*`, `gpt-*`, `gemini-*`, local models — with equal treatment. Cross-model
  disagreement on the same target is signal worth surfacing, not something to hide.
- Be **specific and factual** in findings. State what was checked, what was found, and how
  it was reproduced — no speculation dressed up as certainty.
- **No exploitation instructions.** A finding documents a bug for triage and fix, not a
  how-to for using it. This is especially strict for anything still under
  `withheld-pending-disclosure`.
