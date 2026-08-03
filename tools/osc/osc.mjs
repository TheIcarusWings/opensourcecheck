#!/usr/bin/env node
// osc — the OpenSourceCheck attestation tool.
// Signs and verifies attestations with a Nostr key (BIP-340 schnorr / secp256k1 — the
// Bitcoin/Nostr curve). Identity is your npub. Verification is fully offline and trusts
// no server. Requires Node >= 18 and one `npm install` (@noble/curves, @scure/base).
//
// Commands:
//   osc new-run                          scaffold a blank attestation to stdout
//   osc canonicalize <file>              print the canonical bytes that get signed
//   osc digest <file>                    print the sha256 digest that gets schnorr-signed
//   osc hash <file>                      print sha256 of a file (transcript_sha256 / body_sha256)
//   osc keygen                           generate a fresh Nostr keypair (nsec + npub)
//   osc sign <file> [--nsec N | --key F] sign in place with a Nostr secret (nsec/hex, or a file / $OSC_NSEC)
//   osc verify <file>                    verify one attestation (structure + signature)
//   osc verify --all                     verify every attestation under attestations/

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bech32 } from "@scure/base";
import {
  canonicalize, SIG_ALG,
  npubToHex, hexToNpub, decodeSecret, pubkeyHexFromSecret,
  signAttestation, verifyAttestationSig,
} from "../lib/nostr.mjs";

const SCHEMA_ID = "osc-attestation/v0";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

// ---------- structural validation (no external schema validator needed) ----------
const SEVERITIES = ["critical", "high", "medium", "low", "info", "none-found"];
const STATUSES = ["validated", "false-positive", "disputed", "unreviewed", "withheld-pending-disclosure"];
const VERDICTS = ["findings-validated", "clean-run", "inconclusive"];

function validateStructure(a) {
  const errs = [];
  const req = (cond, msg) => { if (!cond) errs.push(msg); };
  if (!a || typeof a !== "object") return ["attestation must be an object"];

  req(a.schema === SCHEMA_ID, `schema must be "${SCHEMA_ID}"`);
  req(/^OSC-[0-9]{4}-[0-9]{4,}$/.test(a.id || ""), "id must match OSC-YYYY-NNNN");

  const t = a.target || {};
  req(typeof t.repo === "string" && /^https?:\/\//.test(t.repo), "target.repo must be an http(s) URL");
  req(/^[0-9a-f]{40}$/.test(t.commit || ""), "target.commit must be a full 40-char SHA-1 (never a branch)");

  const r = a.run || {};
  req(/^\d{4}-\d{2}-\d{2}$/.test(r.date || ""), "run.date must be YYYY-MM-DD");
  req(typeof r.model === "string" && r.model.length > 0, "run.model is required (exact model id)");
  req(typeof r.harness === "string" && r.harness.length > 0, "run.harness is required");
  req(typeof r.prompts_ref === "string" && r.prompts_ref.length > 0, "run.prompts_ref is required");
  req(typeof r.scope === "string" && r.scope.length > 0, "run.scope is required");
  if (r.transcript_sha256 !== undefined)
    req(/^[0-9a-f]{64}$/.test(r.transcript_sha256), "run.transcript_sha256 must be 64 hex chars");

  req(Array.isArray(a.findings) && a.findings.length >= 1, "findings must be a non-empty array (use severity none-found for a clean run)");
  (a.findings || []).forEach((f, i) => {
    req(/^OSC-[0-9]{4}-[0-9]{4,}-F[0-9]+$/.test(f.ref || ""), `findings[${i}].ref malformed`);
    req(SEVERITIES.includes(f.severity), `findings[${i}].severity invalid`);
    req(STATUSES.includes(f.status), `findings[${i}].status invalid`);
    req(typeof f.summary === "string" && f.summary.length > 0, `findings[${i}].summary required`);
    if (f.status === "validated" || f.status === "false-positive")
      req(typeof f.validator === "string" && f.validator.length > 0, `findings[${i}] status ${f.status} requires a validator`);
    if (f.status === "withheld-pending-disclosure")
      req(/^[0-9a-f]{64}$/.test(f.body_sha256 || ""), `findings[${i}] withheld finding requires body_sha256`);
    if (f.severity === "none-found")
      req(a.verdict === "clean-run", `finding severity none-found requires verdict clean-run`);
  });

  req(VERDICTS.includes(a.verdict), "verdict invalid");
  if (a.verdict === "clean-run")
    req((a.findings || []).every((f) => f.severity === "none-found" || f.severity === "info"),
      "clean-run must not carry findings above info severity");

  const au = a.auditor || {};
  req(/^[a-z0-9][a-z0-9-]*$/.test(au.id || ""), "auditor.id must be a lowercase slug");
  req(typeof au.name === "string" && au.name.length > 0, "auditor.name required");

  const s = a.signature || {};
  req(s.alg === SIG_ALG, `signature.alg must be ${SIG_ALG}`);
  req(/^npub1[a-z0-9]{58,}$/.test(s.principal || ""), "signature.principal must be an npub");
  req(/^[0-9a-f]{128}$/.test(s.value || ""), "signature.value must be a 128-hex schnorr signature");

  return errs;
}

// ---------- auditor registry ----------
function loadAuditorNpubs(auditorId) {
  const p = join(REPO_ROOT, "auditors", auditorId + ".json");
  const auditor = JSON.parse(readFileSync(p, "utf8"));
  return (auditor.keys || []).map((k) => k.npub);
}

function verifyFile(path) {
  const att = JSON.parse(readFileSync(path, "utf8"));
  const structErrs = validateStructure(att);
  if (structErrs.length) return { path, ok: false, errors: structErrs };

  // principal must be registered for this auditor
  let registered;
  try { registered = loadAuditorNpubs(att.auditor.id); }
  catch { return { path, ok: false, errors: [`auditor ${att.auditor.id} has no auditors/${att.auditor.id}.json`] }; }
  if (!registered.includes(att.signature.principal))
    return { path, ok: false, errors: [`principal ${att.signature.principal} not registered for auditor ${att.auditor.id}`] };

  const sig = verifyAttestationSig(att);
  return sig.ok ? { path, ok: true, errors: [] } : { path, ok: false, errors: [sig.reason] };
}

function walkAttestations() {
  const root = join(REPO_ROOT, "attestations");
  const out = [];
  const rec = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) rec(p);
      else if (name.endsWith(".json")) out.push(p);
    }
  };
  try { rec(root); } catch { /* none yet */ }
  return out;
}

// ---------- scaffold ----------
function scaffold() {
  return {
    schema: SCHEMA_ID,
    id: "OSC-2026-0000",
    target: { repo: "https://github.com/ORG/REPO", commit: "0".repeat(40), release_tag: "" },
    run: {
      date: "2026-01-01",
      model: "claude-opus-4-8",
      harness: "claude-code",
      prompts_ref: "prompts/deep-audit-v1.md",
      transcript_sha256: "",
      scope: "Describe exactly what was and was NOT reviewed.",
    },
    findings: [
      { ref: "OSC-2026-0000-F1", severity: "none-found", status: "unreviewed", summary: "Nothing found in scope." },
    ],
    verdict: "clean-run",
    auditor: { id: "your-slug", name: "Your Name", npub: "npub1..." },
    signature: { alg: SIG_ALG, principal: "npub1...", value: "<run: osc sign>" },
  };
}

// ---------- arg parsing ----------
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) flags[args[i].slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    else positional.push(args[i]);
  }
  return { flags, positional };
}

function resolveSecret(flags) {
  if (flags.nsec && flags.nsec !== true) return decodeSecret(flags.nsec);
  if (flags.key && flags.key !== true) return decodeSecret(readFileSync(flags.key, "utf8"));
  if (process.env.OSC_NSEC) return decodeSecret(process.env.OSC_NSEC);
  throw new Error("no secret: pass --nsec <nsec1…>, --key <file>, or set $OSC_NSEC");
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);

  switch (cmd) {
    case "new-run":
      process.stdout.write(JSON.stringify(scaffold(), null, 2) + "\n");
      break;

    case "canonicalize": {
      const { signature, ...unsigned } = JSON.parse(readFileSync(positional[0], "utf8"));
      process.stdout.write(canonicalize(unsigned) + "\n");
      break;
    }

    case "digest": {
      const { signature, ...unsigned } = JSON.parse(readFileSync(positional[0], "utf8"));
      process.stdout.write(sha256Hex(Buffer.from("osc-attestation/v0\n" + canonicalize(unsigned), "utf8")) + "\n");
      break;
    }

    case "hash":
      process.stdout.write(sha256Hex(readFileSync(positional[0])) + "\n");
      break;

    case "keygen": {
      let sk = randomBytes(32);
      // ensure a valid schnorr secret (astronomically unlikely to loop)
      let pubHex;
      try { pubHex = pubkeyHexFromSecret(sk); } catch { sk = randomBytes(32); pubHex = pubkeyHexFromSecret(sk); }
      console.log("npub:", hexToNpub(pubHex));
      console.log("nsec:", bech32.encode("nsec", bech32.toWords(sk), 1000), "  (keep this secret — anyone with it can sign as you)");
      break;
    }

    case "sign": {
      const file = positional[0];
      if (!file) { console.error("usage: osc sign <file> [--nsec <nsec1…> | --key <file>]"); process.exit(2); }
      const att = JSON.parse(readFileSync(file, "utf8"));
      const { signature, ...unsigned } = att;
      const sk = resolveSecret(flags);
      const signed = signAttestation(unsigned, sk);
      writeFileSync(file, JSON.stringify(signed, null, 2) + "\n");
      console.error(`signed ${file} as ${signed.signature.principal}`);
      break;
    }

    case "verify": {
      const targets = flags.all ? walkAttestations() : positional;
      if (!targets.length) { console.error("nothing to verify (pass a file or --all)"); process.exit(2); }
      let failed = 0;
      for (const t of targets) {
        const r = verifyFile(t);
        if (r.ok) console.log(`ok   ${t}`);
        else { failed++; console.log(`FAIL ${t}`); r.errors.forEach((e) => console.log(`       - ${e}`)); }
      }
      console.error(`\n${targets.length - failed}/${targets.length} verified`);
      process.exit(failed ? 1 : 0);
      break;
    }

    default:
      console.error("osc — OpenSourceCheck attestation tool\n" +
        "commands: new-run | canonicalize <f> | digest <f> | hash <f> | keygen | sign <f> [--nsec|--key] | verify <f> | verify --all");
      process.exit(cmd ? 2 : 0);
  }
}

main();
