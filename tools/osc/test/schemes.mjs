// Round-trip test for all three signing schemes (ssh, pgp). Nostr is covered by run.sh.
// Tests the scheme crypto directly with ephemeral keys (no repo auditor files touched).
// PGP is skipped with a notice if `gpg` is unavailable.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signAttestation, verifyAttestation } from "../../lib/schemes.mjs";

const unsigned = {
  schema: "osc-attestation/v0", id: "OSC-2026-9999",
  target: { repo: "https://github.com/x/y", commit: "a".repeat(40) },
  run: { date: "2026-08-04", model: "m", harness: "h", prompts_ref: "prompts/deep-audit-v1.md", scope: "s" },
  findings: [{ ref: "OSC-2026-9999-F1", severity: "none-found", status: "unreviewed", summary: "none" }],
  verdict: "clean-run", auditor: { id: "scratch", name: "Scratch" },
};
const dir = mkdtempSync(join(tmpdir(), "osc-schemetest-"));
let ok = true;
const check = (name, cond) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name); if (!cond) ok = false; };
// "found" = the binary exists (any exit code is fine; only ENOENT means missing).
const have = (bin) => { try { execFileSync(bin, ["--version"], { stdio: "ignore" }); return true; } catch (e) { return e.code !== "ENOENT"; } };

// ---- SSH ----
if (have("ssh-keygen")) {
  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-C", "test@osc", "-f", join(dir, "id")]);
  const pub = readFileSync(join(dir, "id.pub"), "utf8").trim().split(" ").slice(0, 2).join(" ");
  const sig = signAttestation(unsigned, { scheme: "ssh", sshKey: join(dir, "id"), principal: "test@osc" });
  const att = { ...unsigned, signature: sig };
  const keys = [{ type: "ssh", principal: "test@osc", ssh_key: pub }];
  check("ssh sign+verify", verifyAttestation(att, keys).ok);
  check("ssh rejects tamper", !verifyAttestation({ ...att, verdict: "inconclusive" }, keys).ok);
  check("ssh rejects unregistered principal", !verifyAttestation(att, [{ type: "ssh", principal: "other@osc", ssh_key: pub }]).ok);
} else console.log("  SKIP  ssh (ssh-keygen not found)");

// ---- PGP ----
if (have("gpg")) {
  const gnupg = join(dir, "gnupg"); execFileSync("mkdir", ["-p", gnupg]); execFileSync("chmod", ["700", gnupg]);
  const env = { ...process.env, GNUPGHOME: gnupg };
  execFileSync("gpg", ["--batch", "--passphrase", "", "--quick-gen-key", "OSC Test <t@osc>", "ed25519", "sign", "0"], { env, stdio: ["ignore", "ignore", "pipe"] });
  const fpr = execFileSync("gpg", ["--with-colons", "--fingerprint"], { env, encoding: "utf8" }).split("\n").find((l) => l.startsWith("fpr:")).split(":")[9];
  const pubAsc = execFileSync("gpg", ["--armor", "--export", fpr], { env, encoding: "utf8" });
  process.env.GNUPGHOME = gnupg; // signPGP uses default env
  const sig = signAttestation(unsigned, { scheme: "pgp", gpgKey: fpr });
  const att = { ...unsigned, signature: sig };
  const keys = [{ type: "pgp", fingerprint: fpr, public_key: pubAsc }];
  check("pgp principal == fingerprint", sig.principal.toUpperCase() === fpr.toUpperCase());
  check("pgp sign+verify", verifyAttestation(att, keys).ok);
  check("pgp rejects tamper", !verifyAttestation({ ...att, verdict: "inconclusive" }, keys).ok);
  check("pgp rejects unregistered fpr", !verifyAttestation(att, [{ type: "pgp", fingerprint: "0".repeat(40), public_key: pubAsc }]).ok);
} else console.log("  SKIP  pgp (gpg not found)");

console.log(ok ? "SCHEME TESTS PASSED" : "SCHEME TESTS FAILED");
process.exit(ok ? 0 : 1);
