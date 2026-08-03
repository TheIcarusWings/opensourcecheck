// Multi-scheme signing for OpenSourceCheck attestations.
// An attestation may be signed with any of three key types the Bitcoin/OSS world already uses:
//   - nostr-schnorr : BIP-340 schnorr / secp256k1, identity = npub          (pure JS, @noble)
//   - ssh-ed25519   : OpenSSH signatures (`ssh-keygen -Y`), identity = principal
//   - pgp           : OpenPGP detached signature (`gpg`), identity = fingerprint
// All three bind the SAME payload: "osc-attestation/v0\n" + canonical(unsigned). Nostr signs
// sha256(payload); ssh/gpg sign the payload directly (they hash internally).
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SIG_CONTEXT, payloadBytes, signAttestation as signNostr, verifyAttestationSig as verifyNostr } from "./nostr.mjs";

export const NAMESPACE = SIG_CONTEXT; // ssh signature namespace

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "osc-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Normalize an auditor key entry to a {type, ...} shape (type may be inferred from fields).
export function keyType(k) {
  if (k.type) return k.type;
  if (k.npub) return "nostr";
  if (k.ssh_key) return "ssh";
  if (k.public_key || k.fingerprint) return "pgp";
  return "unknown";
}

// ---------------- SSH (ssh-ed25519) ----------------
export function signSSH(unsigned, keyPath, principal) {
  if (!principal) throw new Error("ssh signing needs --principal <identity> (must match your registered ssh key)");
  const payload = payloadBytes(unsigned);
  return withTmpDir((dir) => {
    const p = join(dir, "payload");
    writeFileSync(p, payload);
    execFileSync("ssh-keygen", ["-Y", "sign", "-n", NAMESPACE, "-f", keyPath, p], { stdio: ["ignore", "ignore", "inherit"] });
    return { alg: "ssh-ed25519", principal, value: readFileSync(p + ".sig", "utf8") };
  });
}

function verifySSH(att, keys) {
  const { signature, ...unsigned } = att;
  const match = keys.filter((k) => keyType(k) === "ssh").find((k) => k.principal === signature.principal);
  if (!match) return { ok: false, reason: `ssh principal ${signature.principal} not registered for this auditor` };
  if (!/BEGIN SSH SIGNATURE/.test(signature.value || "")) return { ok: false, reason: "value is not an armored SSH signature" };
  const payload = payloadBytes(unsigned);
  return withTmpDir((dir) => {
    const allowed = join(dir, "allowed_signers");
    writeFileSync(allowed, `${signature.principal} namespaces="${NAMESPACE}" ${match.ssh_key}\n`);
    const sig = join(dir, "payload.sig");
    writeFileSync(sig, signature.value);
    writeFileSync(join(dir, "payload"), payload);
    try {
      execFileSync("ssh-keygen", ["-Y", "verify", "-f", allowed, "-I", signature.principal, "-n", NAMESPACE, "-s", sig],
        { input: payload, stdio: ["pipe", "ignore", "pipe"] });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "ssh-keygen verify failed: " + (e.stderr ? e.stderr.toString().trim() : e.message) };
    }
  });
}

// ---------------- PGP (gpg) ----------------
function gpgFingerprint(keyId) {
  const out = execFileSync("gpg", ["--with-colons", "--fingerprint", keyId], { encoding: "utf8" });
  const line = out.split("\n").find((l) => l.startsWith("fpr:"));
  if (!line) throw new Error(`could not resolve fingerprint for gpg key ${keyId}`);
  return line.split(":")[9];
}

export function signPGP(unsigned, keyId) {
  const fpr = keyId ? gpgFingerprint(keyId) : gpgFingerprint("--default");
  const payload = payloadBytes(unsigned);
  return withTmpDir((dir) => {
    const p = join(dir, "payload");
    writeFileSync(p, payload);
    const args = ["--armor", "--detach-sign", "--output", "-"];
    if (keyId) args.unshift("--local-user", keyId);
    const value = execFileSync("gpg", args.concat(p), { encoding: "utf8" });
    return { alg: "pgp", principal: fpr, value };
  });
}

function verifyPGP(att, keys) {
  const { signature, ...unsigned } = att;
  const match = keys.filter((k) => keyType(k) === "pgp")
    .find((k) => (k.fingerprint || "").toUpperCase().endsWith(signature.principal.toUpperCase()) ||
                 signature.principal.toUpperCase().endsWith((k.fingerprint || "").toUpperCase()));
  if (!match || !match.public_key) return { ok: false, reason: `pgp fingerprint ${signature.principal} not registered (with public_key) for this auditor` };
  if (!/BEGIN PGP SIGNATURE/.test(signature.value || "")) return { ok: false, reason: "value is not an armored PGP signature" };
  const payload = payloadBytes(unsigned);
  return withTmpDir((dir) => {
    const home = join(dir, "gnupg");
    writeFileSync(join(dir, "pub.asc"), match.public_key);
    writeFileSync(join(dir, "payload"), payload);
    writeFileSync(join(dir, "sig.asc"), signature.value);
    const env = { ...process.env, GNUPGHOME: home };
    try {
      execFileSync("mkdir", ["-p", home]);
      execFileSync("chmod", ["700", home]);
      execFileSync("gpg", ["--batch", "--import", join(dir, "pub.asc")], { env, stdio: ["ignore", "ignore", "pipe"] });
      const out = execFileSync("gpg", ["--batch", "--status-fd", "1", "--verify", join(dir, "sig.asc"), join(dir, "payload")],
        { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const valid = out.split("\n").find((l) => l.includes("VALIDSIG"));
      if (!valid) return { ok: false, reason: "gpg reported no VALIDSIG" };
      const fpr = valid.trim().split(/\s+/).find((t) => /^[0-9A-F]{40}$/i.test(t));
      const reg = (match.fingerprint || "").toUpperCase();
      if (fpr && reg && fpr.toUpperCase() !== reg) return { ok: false, reason: `signing key ${fpr} != registered ${reg}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "gpg verify failed: " + (e.stderr ? e.stderr.toString().trim() : e.message) };
    }
  });
}

// ---------------- unified dispatch ----------------
// Returns just the signature block; the caller assembles {...unsigned, signature}.
export function signAttestation(unsigned, opts) {
  switch (opts.scheme) {
    case "nostr": return signNostr(unsigned, opts.secret).signature;
    case "ssh": return signSSH(unsigned, opts.sshKey, opts.principal);
    case "pgp": return signPGP(unsigned, opts.gpgKey);
    default: throw new Error("unknown signing scheme " + opts.scheme);
  }
}

// keys = the registered `keys` array from auditors/<id>.json
export function verifyAttestation(att, keys) {
  const alg = att.signature?.alg;
  if (alg === "nostr-schnorr") {
    const npubs = keys.filter((k) => keyType(k) === "nostr").map((k) => k.npub);
    if (!npubs.includes(att.signature.principal)) return { ok: false, reason: `npub ${att.signature.principal} not registered for this auditor` };
    return verifyNostr(att);
  }
  if (alg === "ssh-ed25519") return verifySSH(att, keys);
  if (alg === "pgp") return verifyPGP(att, keys);
  return { ok: false, reason: `unknown signature.alg ${alg}` };
}
