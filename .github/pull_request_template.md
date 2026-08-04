<!-- Submitting an attestation? Run this checklist. Docs: CONTRIBUTING.md -->

## What this PR adds
<!-- e.g. "Attestation OSC-2026-00NN: <model> audit of <repo> at <commit>" -->

## Attestation checklist
- [ ] `node tools/osc/osc.mjs verify --all` passes locally (`npm ci` first)
- [ ] `target.commit` is a full 40-char SHA (never a branch)
- [ ] `run.scope` states exactly what was and was **not** reviewed
- [ ] The prompt pack under `prompts/` used for the run is referenced by `run.prompts_ref`
- [ ] The transcript is included under `transcripts/` (or `transcript_uri` set) and `transcript_sha256` matches
- [ ] Signed with my registered key (`auditors/<me>.json` exists and lists the signing key)
- [ ] No raw, unreviewed model output is marked `validated` — only a human validator sets that
- [ ] If any finding is severity **medium or higher in live software**, it is `withheld-pending-disclosure` with a `body_sha256`, and I have read [policy/DISCLOSURE.md](../policy/DISCLOSURE.md)

## Disclosure
- [ ] This PR contains **no** exploitation instructions or working exploit code
- [ ] Findings ≥ medium in actively-used software have been reported to the project's security contact

<!-- Remember: OSC records what was *checked*, never that code is "safe." -->
