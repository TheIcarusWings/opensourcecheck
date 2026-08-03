# Nostr distribution layer

Nostr is OpenSourceCheck's **distribution** layer, not its source of truth. The canonical
registry is the git repo; Nostr mirrors merged attestations so people can follow audits in a
censorship-resistant, natively-signed feed. If a relay drops an event, nothing is lost — it
can be regenerated from git.

Why Nostr fits: every event is secp256k1-signed (the same curve as Bitcoin), which is
culturally and technically native to this audience, and the label/long-form NIPs map cleanly
onto our attestation model.

## What gets published

`build-events.mjs` turns each attestation into two **unsigned** event templates:

- **NIP-23 long-form (kind 30023)** — the human-readable audit report (Markdown). Addressable
  via a `d` tag equal to the lowercased attestation id, so re-publishing an updated record
  replaces the old one.
- **NIP-32 label (kind 1985)** — a machine-readable verdict + top-severity attached to the
  target repo (`r` tag) under the `org.opensourcecheck.verdict` and `org.opensourcecheck.severity`
  namespaces, with an `a` tag pointing back at the long-form report. Clients can subscribe to
  a project's label feed to see every registry verdict on it, and build a cross-auditor web of
  trust from labels by different pubkeys on the same target.

Both carry `osc-id` and `osc-commit` tags so any event can be traced back to the exact git
record and commit it describes.

## Usage

```sh
node tools/nostr/build-events.mjs        # writes unsigned templates to tools/nostr/out/
```

Then sign and publish with any Nostr tool and the bot's key (kept out of this repo):

```sh
# example with `nak` (https://github.com/fiatjaf/nak)
nak event --sec "$OSC_BOT_KEY" tools/nostr/out/OSC-2026-0001.nip23.json \
  wss://relay.damus.io wss://nos.lol wss://relay.primal.net
```

Before publishing the NIP-32 label, replace the `<bot-pubkey>` placeholder in the `a` tag with
the bot's actual public key hex.

## Notes

- `created_at` is derived from the attestation's audit date (midnight UTC), not a clock read,
  so builds are reproducible.
- The relevant NIP-34 (git-over-nostr) repo-announcement address can be added as an `a` tag on
  the long-form event where a target project publishes one.
- Generated output under `out/` is git-ignored.
