#!/usr/bin/env node
// Static site generator for OpenSourceCheck.
// Zero dependencies. Reads the registry (attestations/, auditors/) and emits a static
// site into site/dist/. Deterministic: no clock/network reads, so builds are reproducible.
//   node site/build.mjs
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site", "dist");

// ---------- data ----------
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
const attestations = walk(join(ROOT, "attestations")).map((p) => JSON.parse(readFileSync(p, "utf8")));
const auditors = Object.fromEntries(
  (existsSync(join(ROOT, "auditors")) ? readdirSync(join(ROOT, "auditors")) : [])
    .filter((f) => f.endsWith(".json") && f !== "TEMPLATE.json")
    .map((f) => { const a = JSON.parse(readFileSync(join(ROOT, "auditors", f), "utf8")); return [a.id, a]; })
);

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const short = (c) => (c || "").slice(0, 10);
const repoName = (url) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\.git$/, "");
const SEV_ORDER = ["critical", "high", "medium", "low", "info", "none-found"];
const sevRank = (s) => SEV_ORDER.indexOf(s);

function topSeverity(att) {
  const real = att.findings.filter((f) => f.severity !== "none-found");
  if (!real.length) return "none-found";
  return real.sort((a, b) => sevRank(a.severity) - sevRank(b.severity))[0].severity;
}

// `base` is the relative prefix to the site root ("" for root pages, "../" for a/ and t/).
const PAGE = (title, body, base = "") => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head><body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site"><a class="brand" href="${base}index.html">OpenSource<span>Check</span></a>
<nav><a href="${base}index.html">Registry</a><a href="${base}auditors.html">Auditors</a><a href="${base}about.html">About</a>
<a href="https://github.com/TheIcarusWings/opensourcecheck">Source</a></nav></header>
<main id="main">${body}</main>
<footer><p>OpenSourceCheck records what was <em>checked</em> and what came back. It never asserts code is safe — a clean AI run can miss real bugs. Every entry is a signed, human-validated attestation; verify offline with <code>node tools/osc/osc.mjs verify --all</code>.</p></footer>
</body></html>`;

const CSS = `
:root{--bg:#0d0f14;--panel:#151922;--line:#232a38;--fg:#e8ecf3;--dim:#8b96a8;--accent:#f7931a;
/* Severity hues are tuned for comparable luminance so "critical" never reads quieter than
   "medium" on a dark surface. --info must stay distinct from --dim: one color, one meaning. */
--crit:#ff8a8a;--high:#ff9b3d;--med:#f7c948;--low:#5bc0eb;--info:#7dabdc;--none:#3ecf8e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.skip-link{position:absolute;inset-inline-start:-999px;top:0}
.skip-link:focus{inset-inline-start:16px;top:12px;z-index:20;background:var(--panel);
color:var(--fg);padding:10px 14px;border:1px solid var(--line);border-radius:8px}
header.site{display:flex;flex-wrap:wrap;gap:8px 18px;justify-content:space-between;align-items:center;
padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;
background:rgba(13,15,20,.85);backdrop-filter:blur(8px)}
.brand{font-weight:700;font-size:19px;color:var(--fg)}.brand span{color:var(--accent)}
nav{display:flex;flex-wrap:wrap;gap:4px 20px}
nav a{color:var(--dim);font-size:14px;padding:4px 0}nav a:hover{color:var(--fg)}
main{max-width:1060px;margin:0 auto;padding:36px 24px 60px}
.hero{padding:22px 0 30px;border-bottom:1px solid var(--line);margin-bottom:28px}
/* Headings and prose can contain unbreakable tokens (repo URLs, 40-char SHAs, npubs),
   so they must be allowed to break rather than forcing the page to scroll sideways. */
.hero h1{font-size:clamp(24px,5vw,30px);line-height:1.15;margin:0 0 10px;letter-spacing:-.4px;
text-wrap:balance;overflow-wrap:break-word}
.hero p{color:var(--dim);max-width:70ch;margin:0 0 8px;text-wrap:pretty}
.disclaimer{background:#1c1408;border:1px solid #3a2a0e;border-left:3px solid var(--accent);
padding:12px 16px;border-radius:8px;color:#f0d9b0;font-size:13.5px;margin-top:16px;max-width:70ch}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);margin:34px 0 14px}
/* Wide data tables scroll inside their own container instead of forcing the page to scroll. */
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;min-width:620px;border-collapse:collapse;font-size:14px}
th{text-align:left;color:var(--dim);font-weight:600;font-size:12px;text-transform:uppercase;
letter-spacing:.05em;padding:0 12px 10px;border-bottom:1px solid var(--line)}
td{padding:13px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:hover td{background:var(--panel)}
.proj{font-weight:600}.proj a{color:var(--fg)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;color:var(--dim);
overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:600;
text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.sev-critical{background:rgba(255,138,138,.2);color:var(--crit);box-shadow:inset 0 0 0 1px rgba(255,138,138,.35)}
.sev-high{background:rgba(255,155,61,.15);color:var(--high)}
.sev-medium{background:rgba(247,201,72,.14);color:var(--med)}
.sev-low{background:rgba(91,192,235,.14);color:var(--low)}
.sev-info{background:rgba(125,171,220,.14);color:var(--info)}
.sev-none-found{background:rgba(62,207,142,.13);color:var(--none)}
.verdict{font-size:12.5px;color:var(--dim)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:0 0 18px}
.card p,.finding p{max-width:70ch;text-wrap:pretty;overflow-wrap:anywhere}
.kv{display:grid;grid-template-columns:minmax(120px,170px) minmax(0,1fr);gap:8px 18px;font-size:14px;margin:14px 0}
.kv dt{color:var(--dim)}.kv dd{margin:0;overflow-wrap:anywhere}
.finding{border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:12px 0;background:#11151d}
.finding h3{margin:0 0 6px;font-size:15px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.status{font-size:11px;color:var(--dim);border:1px solid var(--line);padding:1px 7px;border-radius:6px}
.muted{color:var(--dim)}
.pill{display:inline-block;font-size:12px;color:var(--dim);border:1px solid var(--line);
border-radius:6px;padding:1px 8px;white-space:nowrap}
footer{border-top:1px solid var(--line);color:var(--dim);font-size:13px;padding:26px 24px;max-width:1060px;margin:0 auto}
footer em{color:var(--fg);font-style:normal}
.count{display:inline-flex;gap:6px;flex-wrap:wrap}
@media (max-width:640px){
  main{padding:24px 16px 48px}
  .card{padding:18px 16px;border-radius:12px}
  .kv{grid-template-columns:minmax(0,1fr);gap:2px 0}
  .kv dt{margin-top:10px;font-size:12.5px}
  footer{padding:22px 16px}
}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;

// ---------- pages ----------
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "a"), { recursive: true });
mkdirSync(join(OUT, "t"), { recursive: true });

// group by repo, newest first
const byRepo = {};
for (const a of attestations) (byRepo[a.target.repo] ??= []).push(a);
for (const k in byRepo) byRepo[k].sort((x, y) => (y.run.date).localeCompare(x.run.date));
const repos = Object.entries(byRepo).sort((a, b) => b[1][0].run.date.localeCompare(a[1][0].run.date));

const slug = (repo) => repoName(repo).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
// Escaped text with <wbr> hints after URL punctuation, so a long repo path prefers to break
// at "/" or "." rather than mid-word. Safe because esc() output contains no raw markup.
const breakable = (s) => esc(s).replace(/([/.])/g, "$1<wbr>");
const sevBadge = (s) => `<span class="badge sev-${s}">${s}</span>`;
const SCHEME_LABEL = { "nostr-schnorr": "nostr", "ssh-ed25519": "ssh", "pgp": "pgp" };
const schemeBadge = (alg) => `<span class="pill">signed: ${esc(SCHEME_LABEL[alg] || alg)}</span>`;
// A human label for any auditor key entry, regardless of type.
const keyLabel = (k) => k.npub || k.principal || k.fingerprint || k.ssh_key || "(key)";

// --- index / coverage map ---
const rows = repos.map(([repo, atts]) => {
  const latest = atts[0];
  const top = topSeverity(latest);
  const nReal = atts.reduce((n, a) => n + a.findings.filter((f) => f.severity !== "none-found").length, 0);
  return `<tr>
    <td class="proj"><a href="t/${esc(slug(repo))}.html">${esc(repoName(repo))}</a>
      <div class="mono">@ ${esc(short(latest.target.commit))}${latest.target.subpath ? " · " + esc(latest.target.subpath) : ""}</div></td>
    <td>${sevBadge(top)}<div class="verdict">${esc(latest.verdict)}</div></td>
    <td class="mono">${esc(latest.run.model)}</td>
    <td class="mono">${esc(latest.run.date)}</td>
    <td>${atts.length} run${atts.length > 1 ? "s" : ""}<div class="verdict">${nReal} finding${nReal === 1 ? "" : "s"}</div></td>
  </tr>`;
}).join("\n");

const totalReal = attestations.reduce((n, a) => n + a.findings.filter((f) => f.severity !== "none-found").length, 0);
const indexBody = `
<section class="hero">
  <h1>A public registry of AI security audits for open source</h1>
  <p>After the July 2026 Coldcard hack — ~$89M drained through a five-year-old software-PRNG seed bug in open-source firmware — one fact is inescapable: attackers already run frontier models against public code. OpenSourceCheck is where defenders publish their audit runs in the open: signed, human-validated, and reproducible.</p>
  <div class="disclaimer"><strong>Read this first.</strong> An entry means a model was run over a stated scope and a human triaged what it reported. It is <strong>not</strong> a safety certificate. A clean run can miss real bugs — Coldcard proved exactly that.</div>
</section>
<h2>Coverage map — ${repos.length} project${repos.length === 1 ? "" : "s"}, ${attestations.length} attestation${attestations.length === 1 ? "" : "s"}, ${totalReal} finding${totalReal === 1 ? "" : "s"}</h2>
<div class="table-wrap"><table>
<thead><tr><th>Project · last audited commit</th><th>Latest verdict</th><th>Model</th><th>Last checked</th><th>Coverage</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
writeFileSync(join(OUT, "index.html"), PAGE("OpenSourceCheck — AI audit registry", indexBody));

// --- per-attestation detail pages ---
for (const a of attestations) {
  const au = auditors[a.auditor.id] || {};
  const isDemo = au.role === "demo";
  const findings = a.findings.map((f) => `
    <div class="finding">
      <h3>${sevBadge(f.severity)} <span>${esc(f.ref)}</span> <span class="status">${esc(f.status)}</span></h3>
      <p>${esc(f.summary)}</p>
      ${f.location ? `<div class="mono">${esc(f.location)}${f.cwe ? " · " + esc(f.cwe) : ""}</div>` : ""}
      ${f.validator ? `<p class="muted">Validated by <strong>${esc(f.validator)}</strong>${f.validator_notes ? " — " + esc(f.validator_notes) : ""}</p>` : ""}
      ${f.body_sha256 ? `<p class="muted">Withheld pending disclosure · body sha256 <span class="mono">${esc(short(f.body_sha256))}…</span></p>` : ""}
    </div>`).join("");
  const body = `
  <section class="hero"><h1>${esc(a.id)} · <a href="../t/${esc(slug(a.target.repo))}.html">${breakable(repoName(a.target.repo))}</a></h1>
    <p>${sevBadge(topSeverity(a))} <span class="pill">${esc(a.verdict)}</span> <span class="pill">${esc(a.run.model)}</span> <span class="pill">${esc(a.run.date)}</span> ${schemeBadge(a.signature.alg)}</p>
    ${isDemo ? `<div class="disclaimer"><strong>Demo attestation.</strong> Signed with the throwaway registry demo key — reproducibility example only. Do not trust its verdict.</div>` : ""}
  </section>
  <div class="card"><dl class="kv">
    <dt>Repository</dt><dd><a href="${esc(a.target.repo)}">${esc(repoName(a.target.repo))}</a></dd>
    <dt>Commit</dt><dd class="mono">${esc(a.target.commit)}</dd>
    ${a.target.subpath ? `<dt>Scope path</dt><dd class="mono">${esc(a.target.subpath)}</dd>` : ""}
    <dt>Model</dt><dd class="mono">${esc(a.run.model)}</dd>
    <dt>Harness</dt><dd class="mono">${esc(a.run.harness)}</dd>
    <dt>Prompts</dt><dd class="mono">${esc(a.run.prompts_ref)}</dd>
    ${a.run.runs_count ? `<dt>Independent runs</dt><dd>${esc(a.run.runs_count)}</dd>` : ""}
    ${a.run.transcript_sha256 ? `<dt>Transcript sha256</dt><dd class="mono">${esc(a.run.transcript_sha256)}</dd>` : ""}
    <dt>Auditor</dt><dd>${esc(a.auditor.name)} <span class="mono">(${esc(a.auditor.id)})</span></dd>
    <dt>Signature</dt><dd class="mono">${esc(a.signature.alg)} · ${esc(a.signature.principal)}</dd>
  </dl>
  <p class="muted"><strong>Scope.</strong> ${esc(a.run.scope)}</p></div>
  <h2>Findings</h2>${findings}`;
  writeFileSync(join(OUT, "a", `${a.id}.html`), PAGE(`${a.id} — OpenSourceCheck`, body, "../"));
}

// --- per-target pages (all attestations for one repo) ---
for (const [repo, atts] of repos) {
  const rows = atts.map((a) => `<tr>
    <td class="proj"><a href="../a/${esc(a.id)}.html">${esc(a.id)}</a>
      <div class="mono">@ ${esc(short(a.target.commit))}${a.target.subpath ? " · " + esc(a.target.subpath) : ""}</div></td>
    <td>${sevBadge(topSeverity(a))}<div class="verdict">${esc(a.verdict)}</div></td>
    <td class="mono">${esc(a.run.model)}</td>
    <td class="mono">${esc(a.run.date)}</td>
    <td class="mono">${esc(a.auditor.id)}</td></tr>`).join("\n");
  const body = `<section class="hero"><h1>${breakable(repoName(repo))}</h1>
    <p><a href="${esc(repo)}">${breakable(repo)}</a></p>
    <p class="muted">${atts.length} attestation${atts.length === 1 ? "" : "s"} in the registry for this project. Each is one audit run at an exact commit — none is a safety guarantee.</p></section>
    <div class="table-wrap"><table><thead><tr><th>Attestation</th><th>Verdict</th><th>Model</th><th>Date</th><th>Auditor</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
  writeFileSync(join(OUT, "t", `${slug(repo)}.html`), PAGE(`${repoName(repo)} — OpenSourceCheck`, body, "../"));
}

// --- about / methodology page ---
const aboutBody = `<section class="hero"><h1>About OpenSourceCheck</h1>
  <p>A public, git-native registry of LLM-assisted security-review runs of open-source projects, Bitcoin-first. Every entry is a signed, human-validated, reproducible attestation.</p>
  <div class="disclaimer"><strong>What an entry means.</strong> A model was run over a stated scope and a human triaged what it reported. It is <strong>not</strong> a safety certificate — a clean run can miss real bugs, as the 2026 Coldcard seed-entropy hack showed.</div></section>
  <h2>How to read an attestation</h2>
  <div class="card"><dl class="kv">
    <dt>target</dt><dd>the repo and the <em>exact commit</em> that was reviewed (never a branch)</dd>
    <dt>run</dt><dd>the exact model, harness, prompt pack, and a hash of the full transcript — so the run can be re-done and compared</dd>
    <dt>findings</dt><dd>each with a severity and a human-triage <em>status</em>; raw model output stays <span class="mono">unreviewed</span> until a named validator confirms it</dd>
    <dt>verdict</dt><dd><span class="mono">findings-validated</span>, <span class="mono">clean-run</span> (ran to completion, nothing actionable in scope — a first-class result), or <span class="mono">inconclusive</span></dd>
    <dt>signature</dt><dd>a Nostr (schnorr), SSH, or PGP signature over the canonical attestation, verifiable fully offline</dd>
  </dl></div>
  <h2>Verify any entry yourself</h2>
  <div class="card"><p class="mono">git clone https://github.com/TheIcarusWings/opensourcecheck.git<br>cd opensourcecheck &amp;&amp; npm ci<br>node tools/osc/osc.mjs verify --all</p>
  <p class="muted">Verification trusts no server: it checks each signature against the auditor's registered key.</p></div>
  <h2>Responsible disclosure</h2>
  <div class="card"><p>Findings of severity <strong>medium or higher in live software</strong> are published as <span class="mono">withheld-pending-disclosure</span> — only a <span class="mono">body_sha256</span> hash-commitment is shown (proving priority without leaking the bug) until a fix ships. See the disclosure and governance policies in the repository.</p></div>`;
writeFileSync(join(OUT, "about.html"), PAGE("About — OpenSourceCheck", aboutBody));

// --- auditors page ---
const auditorRows = Object.values(auditors).map((au) => {
  const mine = attestations.filter((a) => a.auditor.id === au.id);
  const validated = mine.reduce((n, a) => n + a.findings.filter((f) => f.status === "validated").length, 0);
  const keys = (au.keys || []).map((k) => `<div class="mono">${esc(keyLabel(k))}</div>`).join("");
  return `<tr><td class="proj">${esc(au.name)} <div class="mono">${esc(au.id)}${au.role === "demo" ? " · demo key" : ""}</div></td>
    <td>${mine.length}</td><td>${validated}</td>
    <td>${keys}</td></tr>`;
}).join("");
const auditorsBody = `<section class="hero"><h1>Auditors</h1>
  <p>Anyone with a registered signing key may submit attestations. Trust is a web of trust, not a gate — weight each auditor by their track record. Registered keys below (npub, SSH principal, or PGP fingerprint) can be cross-checked out of band.</p></section>
  <div class="table-wrap"><table><thead><tr><th>Auditor</th><th>Attestations</th><th>Validated findings</th><th>Registered keys</th></tr></thead>
  <tbody>${auditorRows}</tbody></table></div>`;
writeFileSync(join(OUT, "auditors.html"), PAGE("Auditors — OpenSourceCheck", auditorsBody));

// --- JSON index for programmatic consumers ---
writeFileSync(join(OUT, "index.json"), JSON.stringify({
  generated_by: "site/build.mjs",
  attestations: attestations.map((a) => ({ id: a.id, repo: a.target.repo, commit: a.target.commit,
    date: a.run.date, model: a.run.model, verdict: a.verdict, top_severity: topSeverity(a) })),
}, null, 2));

console.log(`Built ${attestations.length} attestation page(s), ${repos.length} project(s), ${Object.keys(auditors).length} auditor(s) → site/dist/`);
