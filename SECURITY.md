# Security policy

This repository is a registry of security audits, so it attracts two different kinds of report.
They go to different places.

## Reporting a vulnerability in software audited here

**Do not report it to us first.** Report it to the project that owns the code, through their own
security channel. They can fix it; we cannot.

Once you have reported it upstream, you are welcome to publish the record here as an
attestation. Findings of severity `medium` or above in live, funds-holding software are
published in redacted form — auditor, target, commit, date and severity public, with the finding
body withheld behind a SHA-256 commitment until a fix ships. See
[policy/DISCLOSURE.md](./policy/DISCLOSURE.md).

## Reporting a vulnerability in OpenSourceCheck itself

This means the `osc` CLI, the attestation schema, the signature verification, the CI validation,
or the site generator. The signature and verification paths matter most: a flaw there could let
someone forge an attestation or make a tampered record verify.

**Contact:** `opensourcecheck@proton.me`

Encrypt if the report is sensitive. Our key is published in
[`auditors/theicaruswings.json`](./auditors/theicaruswings.json) and can be cross-checked
against the Nostr identity listed there.

Please include the commit you tested against and, where possible, a reproduction. We will
acknowledge within 7 days.

## Reporting a problem with an attestation

If you believe a published attestation is wrong — a finding that is a false positive, a scope
claim broader than what was examined, or a record whose signature does not verify — open a
public issue. This is not sensitive and the correction should be visible.

Attestations are never silently deleted or edited. Corrections are made as new commits or new
attestations with the history intact, because the audit trail is the product. A disputed finding
can be marked `disputed` or `false-positive` by a named validator; both remain in the record.

## What we will not do

- We will not publish an exploitable finding in live software before the project has had a
  reasonable chance to fix it.
- We will not publish exploitation instructions or working exploit code. Findings state the
  flaw, its location, and the conditions to reproduce it.
- We will not remove a record because someone finds it inconvenient. If it is wrong, it gets
  corrected in the open.
