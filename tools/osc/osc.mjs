#!/usr/bin/env node
// osc — the OpenSourceCheck attestation tool.
// Zero runtime dependencies: needs only Node >= 18 and OpenSSH (`ssh-keygen`).
// Commands:
//   osc new-run                 scaffold a blank attestation to stdout
//   osc canonicalize <file>     print the RFC 8785 canonical bytes that get signed
//   osc sign <file> --key K [--principal P]   sign in place with an ssh key
//   osc verify <file>           verify one attestation (structure + signature)
//   osc verify --all            verify every attestation under attestations/
//   osc hash <file>             print sha256 of a file (for transcript_sha256 / body_sha256)
//
// The registry is a plain git repo; this tool trusts no server. Verification is fully
// offline given the auditor public keys registered under auditors/.

import { readFileSync, writeFileSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const NAMESPACE = "opensourcecheck-attestation/v0";
const SCHEMA_ID = "osc-attestation/v0";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------- RFC 8785 (JCS) canonicalization ----------
// Deterministic JSON: object keys sorted lexicographically by UTF-16 code unit,
// no insignificant whitespace. Sufficient for our value space (strings, small
// numbers, booleans, nested objects/arrays; no NaN/Infinity/huge floats).
function canonicalize(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
  }
  throw new Error("Cannot canonicalize value of type " + typeof value);
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// ---------- structural validation (no external schema validator needed) ----------
const SEVERITIES = ["critical", "high", "medium", "low", "info", "none-found"];
const STATUSES = ["validated", "false-positive", "disputed", "unreviewed", "withheld-pending-disclosure"];
const VERDICTS = ["findings-validated", "clean-run", "inconclusive"];

function validateStructure(a) {
  const errs = [];
  const req = (cond, msg) => { if (!cond) errs.push(msg); };

  req(a && typeof a === "object", "attestation must be an object");
  if (!a || typeof a !== "object") return errs;

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
  req(s.alg === "ssh-ed25519", "signature.alg must be ssh-ed25519");
  req(typeof s.principal === "string" && s.principal.length > 0, "signature.principal required");
  req(typeof s.value === "string" && s.value.includes("SSH SIGNATURE"), "signature.value must be an armored SSH signature");

  return errs;
}

// ---------- ssh signing / verification ----------
function tmpFile(prefix, data) {
  const dir = mkdtempSync(join(tmpdir(), "osc-"));
  const p = join(dir, prefix);
  writeFileSync(p, data);
  return p;
}

function signAttestation(att, keyPath, principal) {
  const { signature, ...unsigned } = att;
  const bytes = canonicalize(unsigned);
  const payloadPath = tmpFile("payload", bytes);
  execFileSync("ssh-keygen", ["-Y", "sign", "-n", NAMESPACE, "-f", keyPath, payloadPath], { stdio: ["ignore", "ignore", "inherit"] });
  const sig = readFileSync(payloadPath + ".sig", "utf8");
  return {
    ...unsigned,
    signature: { alg: "ssh-ed25519", principal, namespace: NAMESPACE, value: sig },
  };
}

function loadAuditorKeys(auditorId) {
  const p = join(REPO_ROOT, "auditors", auditorId + ".json");
  const auditor = JSON.parse(readFileSync(p, "utf8"));
  return auditor.keys || [];
}

function verifySignature(att) {
  const { signature, ...unsigned } = att;
  if (!signature) return { ok: false, reason: "no signature" };
  const bytes = canonicalize(unsigned);

  const keys = loadAuditorKeys(att.auditor.id);
  const match = keys.find((k) => k.principal === signature.principal);
  if (!match) return { ok: false, reason: `principal ${signature.principal} not registered for auditor ${att.auditor.id}` };

  const allowed = `${signature.principal} namespaces="${NAMESPACE}" ${match.ssh_key}\n`;
  const allowedPath = tmpFile("allowed_signers", allowed);
  const sigPath = tmpFile("payload.sig", signature.value);
  const payloadPath = sigPath.replace(/\.sig$/, "");
  writeFileSync(payloadPath, bytes);
  try {
    execFileSync("ssh-keygen", ["-Y", "verify", "-f", allowedPath, "-I", signature.principal, "-n", NAMESPACE, "-s", sigPath],
      { input: bytes, stdio: ["pipe", "ignore", "pipe"] });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "ssh-keygen verify failed: " + (e.stderr ? e.stderr.toString().trim() : e.message) };
  }
}

function verifyFile(path) {
  const att = JSON.parse(readFileSync(path, "utf8"));
  const structErrs = validateStructure(att);
  if (structErrs.length) return { path, ok: false, errors: structErrs };
  const sig = verifySignature(att);
  if (!sig.ok) return { path, ok: false, errors: [sig.reason] };
  return { path, ok: true, errors: [] };
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
  try { rec(root); } catch { /* no attestations yet */ }
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
      harness: "claude-code v3.1",
      prompts_ref: "prompts/deep-audit-v1.md",
      transcript_sha256: "",
      scope: "Describe exactly what was and was NOT reviewed.",
    },
    findings: [
      { ref: "OSC-2026-0000-F1", severity: "none-found", status: "unreviewed", summary: "Nothing found in scope." },
    ],
    verdict: "clean-run",
    auditor: { id: "your-slug", name: "Your Name", npub: "" },
    signature: { alg: "ssh-ed25519", principal: "you@example.com", namespace: NAMESPACE, value: "<run: osc sign>" },
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

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);

  switch (cmd) {
    case "new-run":
      process.stdout.write(JSON.stringify(scaffold(), null, 2) + "\n");
      break;

    case "canonicalize": {
      const att = JSON.parse(readFileSync(positional[0], "utf8"));
      const { signature, ...unsigned } = att;
      process.stdout.write(canonicalize(unsigned) + "\n");
      break;
    }

    case "hash":
      process.stdout.write(sha256Hex(readFileSync(positional[0])) + "\n");
      break;

    case "sign": {
      const file = positional[0];
      if (!file || !flags.key) { console.error("usage: osc sign <file> --key <ssh_key> [--principal <id>]"); process.exit(2); }
      const att = JSON.parse(readFileSync(file, "utf8"));
      const principal = flags.principal || att.signature?.principal || att.auditor?.contact;
      if (!principal) { console.error("no principal: pass --principal or set signature.principal"); process.exit(2); }
      const signed = signAttestation(att, flags.key, principal);
      writeFileSync(file, JSON.stringify(signed, null, 2) + "\n");
      console.error(`signed ${file} as ${principal}`);
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
        "commands: new-run | canonicalize <f> | hash <f> | sign <f> --key K | verify <f> | verify --all");
      process.exit(cmd ? 2 : 0);
  }
}

main();
