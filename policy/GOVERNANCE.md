# Governance

*Policy v0 — governs the OpenSourceCheck (OSC) registry: the schema at
[`../schema/attestation.schema.json`](../schema/attestation.schema.json), the attestation data
under [`../attestations/`](../attestations/), and the disclosure rules in
[`./DISCLOSURE.md`](./DISCLOSURE.md).*

## 1. Mission and the neutrality principle

OpenSourceCheck is a git-native public registry of signed, human-validated LLM security-audit
attestations for open-source software, Bitcoin-first. Each attestation is a record of one audit
run: which model, driven by which harness and prompts, reviewed which repo at which commit, on
what date, in what scope, with what findings a named human then triaged.

**OSC records what was checked. It does not certify safety.** A `clean-run` verdict means a
model looked at a defined scope and reported nothing — it is not, and must never be rendered or
read as, "this code is safe." The Coldcard incident is the reason this line is bright: Coinkite's
own AI audit found nothing weeks before an attacker (likely with AI assistance of their own)
found a critical entropy bug that had sat in the codebase for five years. An absence of findings
is a data point, not a guarantee, and every surface that renders attestation data must carry that
disclaimer.

**OSC is multi-model by design and takes no position on which model is "best."** The schema
records whatever model was actually used — `claude-*`, `gpt-*`, `gemini-*`, local models, all
equally first-class. Cross-model disagreement on the same target is treated as signal to be
displayed, not noise to be resolved by the registry itself. Nothing in OSC's design, governance,
or funding may create an incentive to favor one model vendor's results over another's.

## 2. Roles

### Maintainers

3–5 people, drawn from different organizations and different countries, so that no single
employer or jurisdiction controls the registry. Maintainers:

- review and merge attestation PRs,
- enforce that submissions conform to the schema and to [`./DISCLOSURE.md`](./DISCLOSURE.md),
- steward the CI validation pipeline (schema checks, signature checks, commit-exists checks) and
  the demo signing key used for illustrative/seed attestations,
- relay withheld findings to affected projects when an auditor hasn't already (per
  `DISCLOSURE.md` §3).

Maintainers explicitly **do not**: rank or certify the safety of any audited codebase, decide
which model is more trustworthy, or gatekeep who is allowed to submit an audit. Their authority
is over *form* (does this PR meet the schema and the disclosure policy) and *process* (is this
finding being disclosed responsibly) — never over the substance of a technical verdict.

### Auditors

Anyone with a registered signing key can be an auditor. Registration is a file under
`auditors/<id>.json` recording the auditor's id, name, and keys, matching the `auditor` object
required by the schema. There is no approval gate to become an auditor beyond registering a key
— submission is open by design (see §4, "web of trust, not gatekeeping").

### Validators

Named humans — who may be the auditor themselves or an independent third party — who triage raw
model output into a `status`: `validated`, `false-positive`, or `disputed`. This is the anti-slop
gate. The schema requires a `validator` identifier for any finding marked `validated` or
`false-positive`; until a human does that triage, a finding's status stays `unreviewed` and is
treated accordingly by anything that consumes the registry.

This gate exists because of what happened to curl: in January 2026, curl ended its bug bounty
program after roughly 20% of submissions turned out to be fabricated AI-generated reports and
its confirmed-vulnerability rate fell below 5%. A registry that ingests raw LLM output as-is
becomes exactly that kind of slop amplifier. OSC's answer is structural, not aspirational: raw
output is never published as a validated finding — it sits as `unreviewed` until a named human
with a reputation on the line signs off.

## 3. Web-of-trust reputation

No central authority ranks auditors, and no maintainer decides who is "good." Instead:

- Auditor pages (rendered from the registry's own history) surface track record: number of
  `validated` findings, false-positive rate, disputes raised against the auditor's work, and
  clean-run history.
- Consumers of the registry — human readers, downstream tools, eventually the site's default
  view — weight results by that track record, the same way `cargo-crev`'s web of trust works: no
  one is required to trust an auditor by default, but everyone can see the receipts.
- **Anyone can fork the registry.** It is a plain git repository; nothing about it depends on a
  specific host, server, or maintainer set continuing to operate it. If the maintainers were to
  start behaving badly — suppressing legitimate findings, favoring a vendor, refusing good-faith
  PRs — the entire dataset, history and signatures intact, can be cloned and continued elsewhere
  under new maintainers. **Exit rights are the ultimate check on maintainer power**, not a vote
  or a complaint process.

## 4. Decision-making

- **Routine merges** (new attestations that pass CI's schema/signature/commit checks and comply
  with `DISCLOSURE.md`) proceed under **lazy consensus**: a maintainer merges without requiring
  unanimous sign-off, and objections are handled after the fact if raised within a reasonable
  window.
- **Schema changes and policy changes** (edits to `schema/attestation.schema.json`,
  `DISCLOSURE.md`, or this document) require a documented proposal — an OSC Improvement Proposal
  (OSCIP), following the pattern of BIPs/mode of similar processes: written rationale,
  backward-compatibility impact, and open comment — followed by a **maintainer supermajority**
  (a strict majority of more than half of seated maintainers, rounding as needed for odd/even
  counts) before merge.
- **Conflicts of interest.** A maintainer recuses from merging or reviewing any attestation about
  a project they are affiliated with, or any attestation submitted under their own auditor key.
  Another maintainer handles that PR instead.

## 5. Funding and independence

OSC accepts donations and grants to fund infrastructure costs and a maintainer stipend —
**never** to influence verdicts. Plausible funding sources, consistent with the space this
registry sits in:

- **OpenSats, the Human Rights Foundation, and Spiral** — established funders of Bitcoin
  open-source infrastructure, a natural fit for a Bitcoin-first attestation registry.
- **Alpha-Omega** (the Linux Foundation initiative) — which announced funding in 2026 explicitly
  aimed at the "AI-generated findings overwhelm maintainers" problem, i.e. exactly the
  triage/validation work OSC's validator role performs.

Rules that apply regardless of source:

- Funds may pay for infrastructure (hosting, CI, tooling) and maintainer stipends only.
- **Funders never get a say in which findings are validated, which auditors are trusted, or how
  a dispute is resolved.** No funding agreement may include any right of review, comment, or
  veto over attestation content.
- All funding sources are disclosed publicly (in the repository, alongside this document or the
  project README), so anyone can check the incentive picture for themselves.

## 6. Maintainers: adding, removing, key rotation

- **Adding a maintainer** follows the OSCIP process in §4: a proposal naming the candidate, their
  organization/country (for the diversity requirement in §2), and rationale, approved by
  supermajority of existing maintainers.
- **Removing a maintainer** — for inactivity, policy violation, or by their own resignation —
  follows the same supermajority process, except a maintainer may resign unilaterally at any
  time.
- **Key rotation.** Maintainers and auditors alike are expected to rotate signing keys if a key
  is suspected compromised. A rotation is itself recorded (updated `auditors/<id>.json` entry or
  equivalent maintainer key record) so that the history of which key was valid when remains
  auditable — old attestations still verify against the key that was valid at signing time.

## 7. If the project is abandoned

Because the registry is signed, plain-text git data with no server-side dependency, **it remains
independently verifiable offline forever**, with or without active maintainers. Anyone holding a
clone of the repository can run the `osc verify` tooling against the schema and signatures and
get the same answer a live maintainer team would have given. Abandonment degrades the registry's
*currency* (no new attestations get reviewed and merged) but never its *integrity* — nothing
about verifying past records depends on anyone still being around. This is also why §3's exit
right matters: a fork can pick up maintenance without losing a single byte of prior history.

## 8. Licensing

- **Schema and tools** (`schema/`, `tools/`) — MIT or CC0. Maximally reusable; other registries
  or tools should be free to adopt the format without friction.
- **Attestation content** (everything under `attestations/`, `prompts/`, `transcripts/`) —
  CC-BY. Attribution is required on reuse because attribution is the substrate the web-of-trust
  reputation model in §3 runs on: an auditor's track record only means something if their work
  stays credited to them wherever it's used.

## 9. Amending this document

Amendments to `GOVERNANCE.md` follow the same OSCIP + maintainer-supermajority process defined
in §4 for policy changes: a written proposal describing the change and its rationale, an open
comment period, then a supermajority vote among seated maintainers. No maintainer or group of
maintainers may amend this document unilaterally, and no funder (per §5) may propose or veto an
amendment.
