#!/usr/bin/env node
// Registry-wide invariants beyond per-file schema/signature checks.
// Fails (exit 1) if any invariant is violated.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
}

const files = walk(join(ROOT, "attestations"));
const errors = [];
const seenIds = new Map();
const seenFindingRefs = new Map();

for (const f of files) {
  let a;
  try { a = JSON.parse(readFileSync(f, "utf8")); }
  catch (e) { errors.push(`${f}: invalid JSON — ${e.message}`); continue; }

  // Unique attestation id
  if (seenIds.has(a.id)) errors.push(`duplicate id ${a.id}: ${f} and ${seenIds.get(a.id)}`);
  else seenIds.set(a.id, f);

  // Auditor must be registered
  const auditorFile = join(ROOT, "auditors", `${a.auditor?.id}.json`);
  if (!existsSync(auditorFile)) errors.push(`${f}: auditor '${a.auditor?.id}' has no auditors/${a.auditor?.id}.json`);

  // Referenced prompt pack must exist
  if (a.run?.prompts_ref && !existsSync(join(ROOT, a.run.prompts_ref)))
    errors.push(`${f}: prompts_ref '${a.run.prompts_ref}' does not exist`);

  // In-repo transcript reference must exist
  const uri = a.run?.transcript_uri;
  if (uri && !/^(https?|ipfs|magnet):/.test(uri) && !existsSync(join(ROOT, uri)))
    errors.push(`${f}: transcript_uri '${uri}' does not exist in-repo`);

  // Commit must be a real 40-hex SHA, never a branch name
  if (!/^[0-9a-f]{40}$/.test(a.target?.commit || ""))
    errors.push(`${f}: target.commit must be a 40-char SHA-1, got '${a.target?.commit}'`);

  // Globally-unique finding refs
  for (const fi of a.findings || []) {
    if (seenFindingRefs.has(fi.ref)) errors.push(`duplicate finding ref ${fi.ref}: ${f} and ${seenFindingRefs.get(fi.ref)}`);
    else seenFindingRefs.set(fi.ref, f);
    // Finding ref must be prefixed by its attestation id
    if (fi.ref && !fi.ref.startsWith(a.id + "-F")) errors.push(`${f}: finding ref ${fi.ref} does not match attestation id ${a.id}`);
  }
}

if (errors.length) {
  console.error(`Registry invariants FAILED (${errors.length}):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`Registry invariants OK — ${files.length} attestation(s), ${seenIds.size} unique id(s).`);
