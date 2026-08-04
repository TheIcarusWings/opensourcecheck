# Licensing

This repository holds two different kinds of material, and they carry different
licenses. The split is deliberate.

## Code and schema — MIT

Everything that is software: `tools/`, `schema/`, `site/`, and the repository
configuration. The full text is in [LICENSE](./LICENSE), and it is the license
GitHub reports for this repository.

MIT is chosen so anyone can freely reuse the `osc` CLI, the attestation schema, and
the verification logic — including in commercial tooling — without friction. A
verification tool nobody is allowed to embed is a verification tool nobody uses.

## Attestation content — CC BY 4.0

The registry's records: `attestations/`, `transcripts/`, `prompts/`, and the auditor
records in `auditors/`.

Licensed under the Creative Commons Attribution 4.0 International License:
<https://creativecommons.org/licenses/by/4.0/> (full legal text:
<https://creativecommons.org/licenses/by/4.0/legalcode>).

SPDX identifier: `CC-BY-4.0`

You may share and adapt this content for any purpose, including commercially,
provided you give appropriate credit to the attesting auditor.

Attribution is the point, not a formality. An auditor's standing in this registry is
built entirely from the attestations they sign, so stripping the `auditor` and
`signature` fields would remove exactly the thing that makes a record worth anything.
Preserving them is both the license condition and the reason the registry works.

## What this means in practice

| You want to… | License that applies |
| --- | --- |
| Embed or fork the `osc` CLI, schema, or site generator | MIT |
| Quote or republish a finding, transcript, or prompt pack | CC BY 4.0 (credit the auditor) |
| Mirror the whole repository | Both, each applying to its own files |

Contributions are accepted under these same terms: code under MIT, attestation
content under CC BY 4.0.
