# Apohara Guard

Isolation primitives + ML-subprocess sandbox patterns for the
[Apohara PROBANT](https://github.com/SuarezPM/apohara-probant) ecosystem.

Part of the cross-AI code verification trinity submitted to TechEx 2026:

- **[apohara-probant](https://github.com/SuarezPM/apohara-probant)** — Backend + frontend for the 12-vendor adversarial ensemble (Apache-2.0)
- **[apohara-aegis](https://github.com/SuarezPM/apohara-aegis)** — Multi-vendor judge adapters (Apache-2.0)
- **[Apohara_Context_Forge](https://github.com/SuarezPM/Apohara_Context_Forge)** — INV-15 KV-cache isolation + Z3 SMT formal proof paper, Zenodo DOI [10.5281/zenodo.20114594](https://doi.org/10.5281/zenodo.20114594) (Apache-2.0)
- **Apohara Guard** (this repo) — Sandbox + scanner primitives (AGPL-3.0)

## Why AGPL-3.0?

The other three repos ship under Apache-2.0 to lower friction for enterprise adoption of safety tooling. Apohara Guard is specifically AGPL-3.0 so that downstream improvements to the sandbox + scanner detection patterns flow back to the public commons.

## Status

**Hackathon-submission snapshot, 2026-05-18.**

Tracked code surface in this repo (intentionally minimal — see `git ls-files`):

- `src/sandbox/index.ts` — bwrap mount-ns + user-ns + RLIMIT_AS sandbox primitives (3-layer active)
- `src/scanner/index.ts` — content scanner stub
- `tests/sandbox.test.ts` — sandbox primitives test suite
- `docs/research/sandbox-design.md` — design rationale
- `THIRD_PARTY_NOTICES.md` — attribution to RAPTOR + bubblewrap

Honest disclosures (per Apohara `AUDIT.md` culture):

- **Sandbox is 3 active + 2 planned**, not 5 active. The 5-layer kernel sandbox naming was corrected to honest framing in commit `ed1539c`. Landlock LSM + seccomp-bpf require libseccomp bpf-blob generation and are scheduled post-hackathon.
- **Build tooling (package.json, bun.lock, Dockerfile, biome.json) is not yet tracked**. Full local-dev quickstart lands post-hackathon. For now: clone + read the 6 tracked files + cross-reference the design doc.
- **Content scanner is a stub.** Real detection logic, training data attribution, and threat-model boundaries land post-hackathon.

## Cross-references

- INV-15 paper v3.0 (Z3 SMT formal proof, UNSAT in 10.08 ms): [`Apohara_Context_Forge/paper/inv15_paper.pdf`](https://github.com/SuarezPM/Apohara_Context_Forge/blob/main/paper/inv15_paper.pdf)
- Apohara PROBANT submission docs: [`apohara-probant/docs/submissions/`](https://github.com/SuarezPM/apohara-probant/tree/main/docs/submissions)
- Judge FAQ for the trinity: [`apohara-probant/docs/submissions/JUDGE-FAQ.md`](https://github.com/SuarezPM/apohara-probant/blob/main/docs/submissions/JUDGE-FAQ.md)

## License

[GNU Affero General Public License v3.0 only](LICENSE) — AGPL-3.0-only.

## Contact

- Maintainer: Pablo M. Suarez ([@SuarezPM](https://github.com/SuarezPM))
- General: dimensionequix@gmail.com
- Security: dimensionequix+security@gmail.com (see `apohara-probant/SECURITY.md` for the cross-ecosystem disclosure policy)
