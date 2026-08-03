# Responsible Disclosure Policy

*Policy v0 — applies to every attestation under [`../attestations/`](../attestations/), validated
against [`../schema/attestation.schema.json`](../schema/attestation.schema.json).*

## 1. Why this policy exists

OpenSourceCheck (OSC) is a public registry of LLM-assisted security-audit attestations for
open-source, Bitcoin-first software. Most of the projects it covers hold or move real money.
That makes the registry different from an ordinary bug tracker: **a public, structured feed of
"here is exactly where the wallet bug is" is a target-acquisition feed if published naively.**
An attacker doesn't need to run their own audit if OSC has already done it for them and posted
the coordinates.

This is not a hypothetical. On July 30, 2026, attackers drained roughly 1,400 BTC (~$89M+) from
Coldcard-generated wallets by exploiting a five-year-old build-flag bug
(`MICROPY_HW_ENABLE_RNG=0`) that silently routed seed generation through a software PRNG,
cutting effective entropy from 128 bits to roughly 40. Coinkite's own AI audit, run weeks
earlier, missed it; Coinkite's stated belief is that the attacker found the same bug with
AI-assisted review. Whatever the registry publishes about *live, funds-holding* software,
attackers can and will read. This policy exists so that OSC helps defenders more than it helps
attackers.

The rule in one sentence: **findings get a public, timestamped, cryptographically-committed
record the instant they're reported — but the human-readable vulnerability body only becomes
public after the affected project has had a real chance to fix it.**

## 2. The tiering rule

Every finding in an attestation carries a `severity` (`critical | high | medium | low | info |
none-found`) and a `status` (`validated | false-positive | disputed | unreviewed |
withheld-pending-disclosure`), per the schema. Publication behavior is determined by severity
and by whether the target is actively used / holds funds:

### Publishes immediately, in full

- `severity: low` or `severity: info` — findings not exploitable enough to justify an embargo.
- `severity: none-found` (a `clean-run` verdict) — the full attestation, including `scope` and
  `run` metadata, publishes right away. A clean run is itself the useful record: it tells the
  next auditor what was already checked and by whom, and (per PLAN.md's framing of the Coldcard
  incident) an absence of findings is a data point, not a guarantee — it is never rendered as
  "safe."

### Publishes as `withheld-pending-disclosure`

- `severity: medium` or higher, in software that is actively used or holds funds.

For these findings, the **attestation itself is published immediately** — the registry does not
sit on the fact that an audit happened. What's public:

- the auditor (`auditor.id`, `auditor.name`)
- the target (`target.repo`, `target.commit`)
- the run date (`run.date`)
- the finding's `severity` and `ref`
- a `body_sha256` — the SHA-256 hash of the full, unredacted finding text

What's redacted: the `summary` field (and any `location`, `validator_notes`, or other body
content) is replaced with a placeholder such as `"[withheld pending disclosure — see
body_sha256]"`.

**Why the hash matters.** `body_sha256` is a hash commitment: the auditor commits, publicly and
immutably in git history, to the exact content of a finding *before* anyone else can see what it
is. This gives the auditor **provable priority** — if a dispute ever arises about who found what
first, or whether the finding was altered after the fact, the hash timestamp settles it — and a
**tamper-evident record**, all without leaking a single byte of exploitable detail. It is the
same trick sigstore/in-toto and academic priority-hashing use: prove you knew something on a
given date without saying what it is.

## 3. Disclosure workflow

1. **Report to the project first.** The auditor reports the finding to the target project's own
   published security contact, following that project's published security policy (e.g. a
   `SECURITY.md`, a PGP-encrypted email alias, a HackerOne program). OSC is a registry of audit
   *records*, not a replacement for a project's own vulnerability-reporting channel.
2. **Record the disclosure metadata.** The auditor sets `disclosure.reported_to` (the security
   contact used) and `disclosure.reported_date` on the finding, and proposes an
   `disclosure.embargo_until` date — the earliest date the body may be published.
3. **Maintainer relay as backstop.** If the auditor hasn't reported to the vendor for some
   reason (unclear contact, non-responsive project, time-sensitive risk), OSC maintainers will
   privately relay the withheld finding to the project's security contact on the auditor's
   behalf. The registry does not let a real, validated, medium+ finding sit unreported to the
   affected project.
4. **Set a sensible embargo, not a rigid one.** Default model:
   - **Mirror the affected project's own disclosure policy** if it publishes one — that always
     takes precedence.
   - **Where a project has no stated policy**, default to a Bitcoin Core–style timeline as a
     starting point: roughly, fix ships, then a **2-week public window** before publication for
     lower-severity findings within the withheld tier; **higher-severity findings are
     coordinated directly with the project** rather than run against a fixed clock; and
     **network-critical issues are handled ad hoc**, case by case, with whatever coordination
     the situation actually requires.
   - These are defaults meant to produce a reasonable `embargo_until`, not contractual
     deadlines. An auditor and project can agree on a longer or shorter window; document the
     reasoning in `validator_notes` once the finding is un-redacted.

## 4. Un-redaction

Once **both** of the following are true:

- the fix has shipped (released, not merely merged), **and**
- `disclosure.embargo_until` has passed,

the auditor — or, if the auditor is unavailable, an OSC maintainer acting on their behalf —
opens a PR that replaces the placeholder `summary` (and any other redacted body fields) with the
original, full finding text, and updates `status` away from `withheld-pending-disclosure` to
whatever the triage outcome is (typically `validated`).

**CI verifies the revealed text against the pre-committed hash**: it recomputes SHA-256 over the
revealed body and checks it equals the `body_sha256` that was published back when the finding
was first withheld. If the hashes don't match, the PR fails — nobody, including the auditor, can
publish a rewritten or softened version of a finding and claim it was the original. This is what
makes the priority claim in §2 actually provable rather than just asserted.

## 5. What OSC will not publish, ever

Findings state the flaw, its location, and the conditions required to reproduce it, factually
and no further. OSC does not publish, at any point in the lifecycle (including after
un-redaction):

- working exploit code,
- step-by-step exploitation instructions,
- anything whose primary utility is "how to actually take someone's funds" rather than "how to
  verify and fix the bug."

A finding that reads "seed generation falls back to a software PRNG seeded from chip UID and
timers when `MICROPY_HW_ENABLE_RNG=0`, reducing effective entropy from 128 to ~40 bits" is in
scope. A working brute-force script against real seeds is not, and will be rejected in review
regardless of embargo status.

## 6. Disputes

A project maintainer or another auditor may contest a finding by submitting a follow-up
attestation or an update that sets `status` to `disputed` or `false-positive`, with
`validator_notes` explaining why. OSC does not delete or rewrite history to resolve a dispute —
the original record stays in git history exactly as filed, and the dispute is recorded alongside
it as a separate, attributable statement. Readers see both the original claim and the rebuttal;
the web-of-trust reputation model (see [`./GOVERNANCE.md`](./GOVERNANCE.md)) lets track record,
not deletion, sort out who was right over time.

## 7. If you are a maintainer of an affected project

- **To contact OSC maintainers** — about a finding concerning your project, a disclosure
  question, or anything else — use the contact channel listed in the OSC repository's root
  `README.md` / `auditors/` directory for current maintainer contacts.
- **To request an embargo extension**, contact the maintainers (or the auditor directly, if you
  have a channel) before `embargo_until` passes, with a brief reason (e.g. fix is more involved
  than expected, coordinated multi-project disclosure). Extensions are routine when requested in
  good faith before the deadline; the finding stays `withheld-pending-disclosure` with an updated
  `disclosure.embargo_until`.
- **To submit a rebuttal**, follow the dispute process in §6 — you don't need to be the original
  auditor to open a `disputed` or `false-positive` status update, but disputes should include
  concrete technical grounds in `validator_notes`, not just disagreement.
- Under no circumstances does contacting OSC maintainers, requesting an extension, or disputing a
  finding result in a record being deleted. The registry's value depends on its history being
  append-only and tamper-evident; see [`./GOVERNANCE.md`](./GOVERNANCE.md) for how that's
  enforced structurally, not just as a promise.
