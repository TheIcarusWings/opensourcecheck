// Shared Nostr-signing primitives for OpenSourceCheck.
// Attestations are signed with a Nostr key (BIP-340 schnorr over secp256k1 — the same
// curve as Bitcoin). The signer's identity is their npub; the signature is verifiable by
// anyone offline, and is the SAME key used to publish the attestation on Nostr (layer 3).
//
// Deps: @noble/curves (audited schnorr) and @scure/base (bech32 for npub/nsec).
import { createHash } from "node:crypto";
import { schnorr } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "@noble/curves/abstract/utils";
import { bech32 } from "@scure/base";

// Domain-separation context folded into every signed digest, so an OSC attestation
// signature can never be replayed as a signature over some other Nostr payload.
export const SIG_CONTEXT = "osc-attestation/v0";
export const SIG_ALG = "nostr-schnorr";

// ---- RFC 8785 (JCS) canonicalization: sorted keys, no insignificant whitespace ----
export function canonicalize(value) {
  if (value === null || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
  }
  throw new Error("cannot canonicalize " + typeof value);
}

export function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// 32-byte digest that gets schnorr-signed: sha256(context + "\n" + canonical(unsigned)).
export function attestationDigest(unsigned) {
  const bytes = Buffer.from(SIG_CONTEXT + "\n" + canonicalize(unsigned), "utf8");
  return createHash("sha256").update(bytes).digest(); // Buffer (32 bytes)
}

// ---- NIP-19 bech32 encode/decode (npub / nsec) ----
export function npubToHex(npub) {
  const { prefix, words } = bech32.decode(npub, 1000);
  if (prefix !== "npub") throw new Error(`expected npub, got ${prefix}`);
  const hex = bytesToHex(Uint8Array.from(bech32.fromWords(words)));
  if (hex.length !== 64) throw new Error("npub does not decode to a 32-byte pubkey");
  return hex;
}

export function hexToNpub(hex) {
  return bech32.encode("npub", bech32.toWords(hexToBytes(hex)), 1000);
}

// Accepts an nsec (bech32) OR a raw 64-char hex secret. Returns 32-byte secret Uint8Array.
export function decodeSecret(input) {
  const s = input.trim();
  if (s.startsWith("nsec1")) {
    const { prefix, words } = bech32.decode(s, 1000);
    if (prefix !== "nsec") throw new Error(`expected nsec, got ${prefix}`);
    return Uint8Array.from(bech32.fromWords(words));
  }
  if (/^[0-9a-f]{64}$/i.test(s)) return hexToBytes(s.toLowerCase());
  throw new Error("secret must be an nsec1… or a 64-char hex string");
}

export function pubkeyHexFromSecret(sk) {
  return bytesToHex(schnorr.getPublicKey(sk));
}

// ---- sign / verify over an attestation object (its `signature` field ignored) ----
export function signAttestation(unsigned, sk) {
  const pubHex = pubkeyHexFromSecret(sk);
  const sig = schnorr.sign(attestationDigest(unsigned), sk);
  return {
    ...unsigned,
    signature: { alg: SIG_ALG, principal: hexToNpub(pubHex), value: bytesToHex(sig) },
  };
}

export function verifyAttestationSig(att) {
  const { signature, ...unsigned } = att;
  if (!signature || signature.alg !== SIG_ALG) return { ok: false, reason: `alg must be ${SIG_ALG}` };
  let pubHex;
  try { pubHex = npubToHex(signature.principal); }
  catch (e) { return { ok: false, reason: "bad principal npub: " + e.message }; }
  if (!/^[0-9a-f]{128}$/.test(signature.value || "")) return { ok: false, reason: "signature.value must be 128 hex chars" };
  const ok = schnorr.verify(signature.value, attestationDigest(unsigned), pubHex);
  return ok ? { ok: true, pubHex } : { ok: false, reason: "schnorr signature does not verify" };
}
