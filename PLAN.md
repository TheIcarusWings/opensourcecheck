# OpenSourceCheck — A Public Registry of LLM Security Audits for Bitcoin Open Source

*Plan v0.1 — August 2026*

## 1. Why now (context)

On July 30, 2026 attackers drained ~1,400 BTC (~$89M+) from Coldcard-generated wallets.
The root cause was a 2021 build flag error (`MICROPY_HW_ENABLE_RNG=0`) that silently routed
seed generation through a software PRNG, leaving Mk2/Mk3 seeds with ~40 bits of effective
entropy instead of 128. The bug sat in **open source, reproducible-build firmware for five
years**. Coinkite's stated belief: the attacker found it with AI-assisted review, while
Coinkite's own AI audit weeks earlier found nothing. NVK's warning to developers:

> "If your firmware is open-source or has ever been public, assume it's already being read
> by attackers and defenders alike."

The asymmetry is the problem: attackers run frontier LLMs against Bitcoin codebases in
private; defenders' AI audit results are scattered, unpublished, unsigned, and
unreproducible. There is **no public place to answer**: *"Which projects have been checked,
by which model, with what prompts, and what was found?"*

Research confirms this is a genuine gap (as of Aug 2026):

- **No public LLM-audit registry exists** for any ecosystem. Google Big Sleep, CodeMender,
  OSS-Fuzz-AI, and XBOW all publish results as blog posts/CVEs — unsigned, unstructured,
  non-reproducible.
- Closest structural prior art: **cargo-crev** (Ed25519-signed reviews distributed via git
  repos, web-of-trust), **cargo-vet** (audits.toml checked into repos, org-level federated
  trust), **sigstore/in-toto** (DSSE-signed attestations + Rekor transparency log),
  **WalletScrutiny** (Bitcoin wallet verdicts — but centralized, unsigned, no AI dimension).
- **The failure mode to avoid**: curl ended its bug bounty in Jan 2026 because ~20% of
  submissions were fabricated AI reports and its confirmed-vuln rate fell below 5%. A
  registry that ingests raw LLM output becomes a slop amplifier. The value is in
  **signed, human-validated, reproducible attestations** — the opposite of slop.
- Funding climate is favorable: the Linux Foundation / Alpha-Omega announced $12.5M in
  March 2026 (Anthropic, Google, Microsoft, OpenAI among funders) specifically for the
  "AI-generated findings overwhelm maintainers" problem. OpenSats/HRF fund Bitcoin
  infrastructure of exactly this kind.

## 2. Options assessment

| Option | Strengths | Weaknesses | Verdict |
|---|---|---|---|
| **GitHub repo (attestation registry)** | Zero infra cost; PR review = built-in validation gate; git history = free audit log; familiar to every Bitcoin dev; forkable (exit rights) | Discovery is poor; GitHub is a centralized chokepoint; not consumer-readable | ✅ **Core — the canonical data layer** |
| **Nostr account + bot** | Censorship-resistant distribution; signing is native (every event is secp256k1-signed — same curve as Bitcoin); NIP-32 labels + NIP-34 git events fit the data model; reaches the Bitcoin-adjacent audience directly | Terrible as a *system of record* (relay retention is unreliable); no review gate before publishing; hard to query historically | ✅ **Distribution layer, not the source of truth** |
| **Full-fledged product (hosted platform)** | Best UX, dashboards, API | Highest cost; creates a trusted third party ("who audits the auditor?"); slow to ship; premature before the data format is proven | ⚠️ **Later — a static site viewer first, platform only if adoption demands it** |
| **Buzz community only** | Cheap, fast momentum post-Coldcard | Momentum without an artifact evaporates; produces threads, not verifiable records | ✅ **Growth engine wrapped around the registry, never a substitute for it** |

**Recommendation: a layered hybrid, shipped in order of cost.**
Git-native signed attestation registry (canonical) → static website viewer (readable) →
Nostr bot (distribution + notifications) → community program (working groups, badge,
audit-a-thons). Each layer works without the ones above it. This mirrors what has actually
survived in this space: crev's git-transport model + sigstore's signed-attestation model +
WalletScrutiny's verdict UX — combined, with the AI dimension none of them have.

## 3. What the registry records (and what it must never claim)

**One attestation = one audit run**: *"Model M, version V, driven by harness H with prompts
P, reviewed repo R at commit C on date D; it reported findings F; human validator X
triaged them to verdict Y; signed, X."*

The registry answers "**what has been checked and what came back**" — it must never issue
"this code is safe." The Coldcard lesson cuts both ways: Coinkite's own AI audit missed the
bug weeks before an attacker (possibly with AI) found it. An absence of findings is a data
point, not a guarantee. Every rendered page carries this disclaimer prominently.

### Attestation schema (v0, JSON, one file per run)

```jsonc
{
  "schema": "osc-attestation/v0",
  "target": {
    "repo": "https://github.com/Coldcard/firmware",
    "commit": "abc123...",                  // exact commit audited — never a branch name
    "subpath": "shared/",                   // optional scope narrowing
    "release_tag": "v5.6.0"                 // optional human anchor
  },
  "run": {
    "date": "2026-08-03",
    "model": "claude-fable-5",              // exact model ID, never a marketing name
    "harness": "claude-code v3.x / custom / manual-chat",
    "prompts_ref": "prompts/deep-audit-v2.md", // exact prompts, stored in-repo
    "transcript_sha256": "…",               // full transcript hashed; file in-repo or artifact store
    "scope": "seed generation, RNG paths",  // what was and was NOT covered
    "duration_minutes": 45,
    "cost_estimate_usd": 12
  },
  "findings": [
    {
      "id": "OSC-2026-0001",
      "severity": "critical|high|medium|low|info|none-found",
      "status": "validated|false-positive|disputed|withheld-pending-disclosure",
      "summary": "PRNG fallback in seed generation when MICROPY_HW_ENABLE_RNG=0",
      "location": "extmod/…:L123",
      "validator_notes": "Reproduced against commit; confirmed by maintainer"
    }
  ],
  "verdict": "findings-validated | clean-run | inconclusive",
  "auditor": { "name": "...", "npub": "npub1…", "keys": ["ssh-ed25519 …"] },
  "signature": "…"                          // detached sig over canonical JSON
}
```

Design decisions baked into the schema:

- **Commit-pinned, never branch-pinned** — an audit of `main` is meaningless a week later.
- **Model + harness + prompts + transcript hash** — the reproducibility quartet. LLM runs
  are non-deterministic, so "reproducible" here means *re-runnable and comparable*, not
  bit-identical. Multiple independent runs on the same target strengthen (or contradict)
  each other, crev-style.
- **`none-found` is a first-class result.** The registry's most common and most useful
  entry is "model X was run over scope S and found nothing" — that's exactly the record
  that would have made Coinkite's pre-hack audit auditable after the fact.
- **`status` requires a human.** Raw model output is never published as a finding; a named,
  key-holding validator triages first. This is the anti-slop gate curl never had.
- **Signing: SSH-key signatures (`ssh-keygen -Y sign`) + optional Nostr key.** Every dev
  has an SSH key; GitHub exposes them at `github.com/<user>.keys` for out-of-band
  verification; Nostr npubs use secp256k1, culturally native to Bitcoin. Avoid PGP-only
  (adoption killer). CI verifies signatures on every PR.

### Responsible disclosure — the non-negotiable rule

A registry of vulnerabilities in *Bitcoin wallets* is a target-acquisition feed if run
naively. Hard policy from day one:

1. Findings of severity ≥ medium in actively-used software are recorded as
   `withheld-pending-disclosure`: the attestation is published (auditor, target, date,
   severity count, **finding-body hash**) but the body is withheld until fix + disclosure
   window, following the project's own security policy (Bitcoin Core-style timelines as
   default). The hash commits the auditor to the finding's content and timestamp without
   revealing it — provable priority, no leak.
2. Registry maintainers privately relay withheld findings to the project's security
   contact if the auditor hasn't already.
3. `clean-run` and `low/info` publish immediately.

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: COMMUNITY   audit-a-thons · target wishlist ·     │
│           auditor onboarding · "Checked" badge program      │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: DISTRIBUTION  Nostr bot: NIP-23 long-form per     │
│           attestation · NIP-32 labels on targets · alerts   │
│           when a watched repo gets a new attestation        │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: VIEWER  static site (opensourcecheck.org):        │
│           per-project pages, coverage map ("last checked by │
│           model X at commit Y, N commits behind HEAD"),     │
│           auditor profiles, JSON API = raw repo files       │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: REGISTRY (canonical)  GitHub monorepo:            │
│           attestations/<org>/<repo>/<commit>-<runid>.json   │
│           prompts/ · transcripts/ · schema/ · CI validation │
│           (schema + sig + commit-exists checks) · PR review │
│           by 2 maintainers · mirrored to self-hosted git    │
└─────────────────────────────────────────────────────────────┘
```

Repo layout (Layer 1):

```
opensourcecheck/
├── schema/attestation.schema.json      # JSON Schema, versioned
├── attestations/coldcard/firmware/…    # one dir per target project
├── prompts/                            # versioned, named audit prompt packs
├── transcripts/                        # full run logs (or hashes + torrent/IPFS refs for big ones)
├── auditors/                           # one file per auditor: keys, npub, contact
├── policy/DISCLOSURE.md                # the rules in §3
├── tools/                              # CLI: osc new-run, osc sign, osc verify
└── .github/workflows/validate.yml      # schema + signature + dup checks on every PR
```

The **`osc` CLI** (small, Rust or TypeScript) is the adoption lever: `osc run` scaffolds an
attestation from a Claude Code / codex-style session, `osc sign` signs it with the user's
SSH key, `osc verify` lets *anyone* validate the whole registry offline in seconds. The
"everyone can check and validate" requirement is satisfied by plain git + this CLI — no
server trust needed.

## 5. Trust & governance

- **Web of trust, not gatekeeping.** Anyone can submit an attestation; CI only enforces
  form (schema, signature, real commit). *Weight* comes from the auditor's track record —
  auditor pages show history: validated findings, false-positive rate, disputes. Consumers
  (and eventually the site's default view) filter by auditor reputation, crev-style.
- **Maintainers ≠ auditors.** 3–5 maintainers from different orgs/countries merge PRs and
  enforce disclosure policy; they don't rank code safety. Publish a governance doc before
  asking anyone prominent to participate.
- **Neutrality across models.** Record `claude-*`, `gpt-*`, `gemini-*`, local models —
  whatever was actually used. Cross-model disagreement on the same target is signal, not
  noise; render it.
- **Funding**: OpenSats / HRF / Spiral grant for a maintainer stipend; Alpha-Omega is
  explicitly funding AI-findings-triage work in 2026. Corporate donors accepted for infra
  only, never for verdict influence. Costs are tiny until Layer 2 (static hosting ~ $0).

## 6. Roadmap

**Phase 0 — Spec + seed (weeks 1–2).** Finalize schema v0 + disclosure policy. Produce
3–5 seed attestations to prove the format — the obvious flagship: **re-run the Coldcard
RNG audit against the pre-fix commit with published prompts**, showing the registry entry
that *should* have existed in June 2026 (the Reddit "Claude found it in 8 minutes" claim
makes this the perfect demo, done rigorously). Add 2–3 clean-run/finding entries on other
wallets (Sparrow, Electrum, BDK) with maintainer coordination.

**Phase 1 — Public repo + CLI (weeks 3–6).** Publish repo, CI validation, `osc` CLI with
sign/verify. Announce on X/Nostr/Delving Bitcoin riding the Coldcard news cycle, with the
seed attestations as the hook. Recruit 2 co-maintainers *before* announcing.

**Phase 2 — Static site (weeks 6–10).** Astro/Next static build from repo JSON on every
merge. Killer view: the **coverage map** — every tracked Bitcoin project × "last audited
commit vs HEAD" staleness indicator. This creates the recurring demand loop ("Coldcard's
last check is 214 commits stale — who's running the next one?").

**Phase 3 — Nostr bot (weeks 10–14).** Bot key publishes each merged attestation as
NIP-23 long-form + NIP-32 label (`org.opensourcecheck.verdict`) referencing target repo
(NIP-34 announcement where one exists) and commit. Users follow the bot or a specific
project's label feed. Nostr is derivative of the repo — if relays lose it, nothing is lost.

**Phase 4 — Community engine (ongoing).** Monthly "audit club" (modeled on Bitcoin Core PR
Review Club) picking one target, many independent model runs, compare findings live.
Target wishlist voting. "Checked via OpenSourceCheck" badge for repos that link their
attestation history — the badge deliberately says *checked*, never *safe*.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Registry becomes a vuln shopping list | §3 disclosure policy; hash-commit for withheld findings; maintainer relay to vendors |
| "Clean run" read as "safe" | `none-found` semantics + scope field + disclaimer on every surface; badge wording |
| AI-slop flood (curl scenario) | Human validator required for `validated` status; auditor reputation; CI form-gates; unvalidated raw runs live in a clearly separated tier |
| Non-determinism undermines credibility | Publish prompts + transcripts + model IDs; encourage N independent runs per target; treat disagreement as displayed signal |
| Ghost town after launch buzz | Coverage-map staleness creates recurring pull; audit club creates recurring push; grants fund a maintainer |
| GitHub dependency | Registry is a plain git repo — mirror to self-hosted git + optionally NIP-34; site builds from any mirror |
| Model-vendor bias accusations | Multi-model by design; schema is vendor-neutral; governance doc |
| Legal exposure (publishing findings) | Follow-project-policy disclosure default; findings state facts + reproduction, not exploitation guidance |

## 8. Decisions to make next

1. Name & handle check (opensourcecheck.org, GitHub org, Nostr npub, X).
2. Schema bikeshed round with 2–3 prospective auditors before freezing v0.
3. Which seed targets, and maintainer contact for coordinated seed runs.
4. License: CC0/MIT for schema+tools; attestation content CC-BY (attribution matters for reputation).
