---
name: no-emdash
description: Find and remove em dashes (—) from prose, rewriting them into commas, colons or sentence breaks that read naturally. Use when asked to remove em dashes, strip em dashes, "no em dashes", clean up dashes, or before publishing a post, README or announcement. Knows which files in this repo are cryptographically signed and must never be edited without re-signing.
---

# Removing em dashes

The user does not want em dashes in written output. This applies to prose they will publish
(posts, README, docs) and to anything you write for them.

## The rule that matters most

**Do not write em dashes in the first place.** This skill exists to clean up a backlog and to
handle files, but the real fix is not producing them. When drafting, reach for a comma, a colon,
a full stop, or parentheses instead.

Common rewrites:

| Instead of | Write |
| --- | --- |
| `the results — when they exist — are scattered` | `the results, when they exist, are scattered` |
| `one thing is clear — attackers read public code` | `one thing is clear: attackers read public code` |
| `it found nothing — Coldcard proved that` | `it found nothing. Coldcard proved that` |
| `three sources — MCU, DS28S60, ATECC608B — feed it` | `three sources (MCU, DS28S60, ATECC608B) feed it` |

Pick by function. A parenthetical becomes commas or brackets. An explanation becomes a colon. A
hard turn becomes a full stop. Do not mechanically substitute one character everywhere; that
produces comma splices and sentences that run on.

En dashes (–) in number ranges (`lines 45–68`, `2024–2026`) are **not** em dashes and should be
left alone.

## STOP: signed content in this repository

This repo is a registry of cryptographically signed attestations. Editing certain files breaks
signatures and makes records fail verification.

**Never edit these to remove em dashes unless the user explicitly asks and accepts re-signing:**

- `transcripts/*.md` — each is SHA-256 hashed into a signed attestation. Editing one changes its
  hash, so the attestation's `transcript_sha256` no longer matches and the record must be
  re-hashed and re-signed by the auditor's key.
- `attestations/**/*.json` — the signature covers the canonical JSON. Any character changed,
  including inside a `summary` or `scope` string, invalidates it.

If the user does want these cleaned, the sequence is: edit, re-hash every affected transcript,
update `transcript_sha256`, reset each signature to `PENDING___sign`, have the user re-sign with
their key, then `node tools/osc/osc.mjs verify --all` must read N/N before committing.

**Safe to edit freely:** `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSING.md`,
`PLAN.md`, `policy/*.md`, `prompts/*.md`, `docs/**`, `.claude/**`, and source comments in
`tools/` and `site/`.

`site/dist/**` is generated output. Never edit it; change `site/build.mjs` and rebuild.

## How to run it

`scripts/find.sh` lists every em dash with its file, line and surrounding text, and separates
signed files from safe ones:

```sh
bash .claude/skills/no-emdash/scripts/find.sh            # whole repo
bash .claude/skills/no-emdash/scripts/find.sh README.md  # one path
```

There is deliberately no automatic rewriter. Choosing between a comma, a colon and a full stop
is a judgement about meaning, and a blind substitution reliably produces worse prose than the
em dash it replaced. Read each hit, decide, and use Edit.

## Procedure

1. Run `find.sh` on the requested scope (default: the safe files listed above).
2. If any hit is in `transcripts/` or `attestations/`, stop and tell the user it is signed
   content, what re-signing would involve, and let them decide.
3. Rewrite each remaining hit in context, choosing the punctuation that fits the sentence.
4. Re-run `find.sh` to confirm zero remaining in scope.
5. If you touched `site/build.mjs`, run `node site/build.mjs`. If you touched anything in the
   registry, run `node tools/osc/osc.mjs verify --all` and confirm the count is unchanged.
