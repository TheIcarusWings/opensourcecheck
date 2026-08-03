#!/usr/bin/env node
// Build UNSIGNED Nostr events from the registry, for the OpenSourceCheck distribution bot.
// Zero dependencies. Emits, per attestation:
//   - a NIP-23 long-form event (kind 30023) — the human-readable audit report
//   - a NIP-32 label event   (kind 1985)  — a machine-readable verdict attached to the target
// Output goes to tools/nostr/out/*.json as unsigned event templates. Sign + publish them
// with any Nostr client/key (e.g. `nak event --sec <key> ...` or nostr-tools). The bot's
// key and relay list are deliberately NOT in this repo — distribution is derivative of the
// canonical git registry, so nothing is lost if a relay drops an event.
//
//   node tools/nostr/build-events.mjs
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { npubToHex } from "../lib/nostr.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "tools", "nostr", "out");
const NS = "org.opensourcecheck";                       // NIP-32 label namespace
const SITE = "https://opensourcecheck.org";

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (n.endsWith(".json")) out.push(p);
  }
  return out;
}

const SEV_ORDER = ["critical", "high", "medium", "low", "info", "none-found"];
function topSeverity(a) {
  const real = a.findings.filter((f) => f.severity !== "none-found");
  if (!real.length) return "none-found";
  return real.sort((x, y) => SEV_ORDER.indexOf(x.severity) - SEV_ORDER.indexOf(y.severity))[0].severity;
}

// created_at is derived deterministically from the audit date (midnight UTC), never a clock read,
// so re-running the builder is reproducible.
const createdAt = (date) => Math.floor(Date.parse(date + "T00:00:00Z") / 1000);

function reportMarkdown(a) {
  const lines = [];
  lines.push(`# ${a.id} — audit of ${a.target.repo}`);
  lines.push("");
  lines.push(`**Verdict:** ${a.verdict} · **Top severity:** ${topSeverity(a)} · **Model:** ${a.run.model} · **Date:** ${a.run.date}`);
  lines.push("");
  lines.push(`> This is a record of what was *checked*, not a safety certificate. A clean AI run can miss real bugs.`);
  lines.push("");
  lines.push(`- **Repo:** ${a.target.repo}`);
  lines.push(`- **Commit:** \`${a.target.commit}\`${a.target.subpath ? ` (\`${a.target.subpath}\`)` : ""}`);
  lines.push(`- **Harness:** ${a.run.harness}`);
  lines.push(`- **Prompts:** ${a.run.prompts_ref}`);
  if (a.run.runs_count) lines.push(`- **Independent runs:** ${a.run.runs_count}`);
  lines.push(`- **Auditor:** ${a.auditor.name} (${a.auditor.id})`);
  lines.push("");
  lines.push(`**Scope.** ${a.run.scope}`);
  lines.push("");
  lines.push(`## Findings`);
  for (const f of a.findings) {
    lines.push(`### ${f.ref} — ${f.severity} (${f.status})`);
    lines.push(f.summary);
    if (f.location) lines.push(`\n\`${f.location}\`${f.cwe ? ` · ${f.cwe}` : ""}`);
    if (f.validator) lines.push(`\nValidated by **${f.validator}**${f.validator_notes ? ` — ${f.validator_notes}` : ""}`);
    lines.push("");
  }
  lines.push(`---`);
  lines.push(`Verify this attestation offline: \`node tools/osc/osc.mjs verify --all\`. Full record: ${SITE}/a/${a.id}.html`);
  return lines.join("\n");
}

function events(a) {
  const created_at = createdAt(a.run.date);
  const dTag = a.id.toLowerCase();
  const sev = topSeverity(a);
  // If the attestation was signed by a Nostr key, the same npub is the natural publisher.
  // For ssh/pgp-signed attestations there is no npub in the signature; fall back to the
  // auditor's declared npub if any, else a placeholder for the publishing bot to fill in.
  const signerNpub = a.auditor?.npub || (a.signature?.principal?.startsWith("npub1") ? a.signature.principal : null);
  const signerHex = signerNpub ? npubToHex(signerNpub) : "<bot-pubkey>";

  // NIP-23 long-form report
  const longform = {
    kind: 30023,
    created_at,
    content: reportMarkdown(a),
    tags: [
      ["d", dTag],
      ["title", `${a.id} — audit of ${a.target.repo}`],
      ["summary", `${a.verdict} · ${sev} · ${a.run.model} · ${a.run.date}`],
      ["t", "opensourcecheck"],
      ["t", "security-audit"],
      ["r", a.target.repo],
      ["osc-commit", a.target.commit],
    ],
  };

  // NIP-32 label: attach verdict + severity to the target repo (r-tag) under our namespace
  const label = {
    kind: 1985,
    created_at,
    content: "",
    tags: [
      ["L", `${NS}.verdict`],
      ["l", a.verdict, `${NS}.verdict`],
      ["L", `${NS}.severity`],
      ["l", sev, `${NS}.severity`],
      ["r", a.target.repo],                                 // labeled target
      ["a", `30023:${signerHex}:${dTag}`],                  // points at the long-form report
      ["osc-id", a.id],
      ["osc-commit", a.target.commit],
    ],
  };

  return { longform, label };
}

mkdirSync(OUT, { recursive: true });
const all = walk(join(ROOT, "attestations")).map((p) => JSON.parse(readFileSync(p, "utf8")));
let n = 0;
for (const a of all) {
  const { longform, label } = events(a);
  writeFileSync(join(OUT, `${a.id}.nip23.json`), JSON.stringify(longform, null, 2) + "\n");
  writeFileSync(join(OUT, `${a.id}.nip32.json`), JSON.stringify(label, null, 2) + "\n");
  n++;
}
console.log(`Wrote ${n * 2} unsigned Nostr event template(s) → tools/nostr/out/ (${n} attestation(s)).`);
console.log(`Sign with the bot key and publish, e.g.:  nak event --sec $OSC_BOT_KEY <file> wss://relay.damus.io wss://nos.lol`);
