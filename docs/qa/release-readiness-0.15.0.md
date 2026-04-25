# Release Readiness Verdict - 0.15.0

Date: 2026-04-25
Target version: **0.15.0**
Candidate worktree branch: `worker-1/release-0.15.0-prep`
Candidate source branch: `dev` / `origin/dev`
Candidate source SHA before release-prep edits: `b5b6d13134eb86ecda2d9021cc83c0995f943ebe`
Release-prep commit SHA: `TBD after commit`
Reachable base tag from candidate source: `v0.14.3`
Compare link: [`v0.14.3...v0.15.0`](https://github.com/Yeachan-Heo/oh-my-codex/compare/v0.14.3...v0.15.0)

## Base / range evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Worktree branch before release-prep branch | `git status --short --branch` reported `## HEAD (no branch)` at `b5b6d13134eb86ecda2d9021cc83c0995f943ebe`; release prep then created `worker-1/release-0.15.0-prep` locally. | PASS |
| Candidate source SHA | `git rev-parse HEAD` before edits returned `b5b6d13134eb86ecda2d9021cc83c0995f943ebe`. | PASS |
| Latest reachable tag | `git describe --tags --abbrev=0` returned `v0.14.3`. | PASS |
| `v0.14.3` ancestry | `git merge-base --is-ancestor v0.14.3 HEAD` returned exit code `0`; `git rev-parse v0.14.3^{}` returned `56c93fd3daed9f6043f0bbb65476d355d47083c5`. | PASS |
| `v0.14.4` ref and ancestry | `git rev-parse v0.14.4^{}` returned `b1f684d706d384a94570023fe51ed5ed751066fb`, but `git merge-base --is-ancestor v0.14.4 HEAD` returned exit code `1`. | PASS: tag exists but is not a valid reachable compare base |

## Scope

`0.15.0` is a minor release candidate covering plugin delivery/Codex App compatibility, Visual Ralph, setup install-mode behavior, native agent/model routing, hook/runtime hardening, Windows/tmux question handling, CI hang protection, Rust compatibility, docs, and release collateral.

## Changed execution paths reviewed

- `package.json`, `package-lock.json`, `Cargo.toml`, `Cargo.lock` — release metadata aligned to `0.15.0`.
- `CHANGELOG.md`, `RELEASE_BODY.md`, `docs/release-notes-0.15.0.md`, `docs/qa/release-readiness-0.15.0.md` — release collateral prepared with verified `v0.14.3` base-range note.
- Plugin/setup/Codex App surfaces — plugin mirror, plugin descriptors, install-mode setup, package bin/layout, and App-safe runtime routing are covered by the required verification gates below.
- Native agent/model routing — native-agent verification and generated docs/model table checks are covered by the required verification gates below.
- Runtime/question/CI/Rust surfaces — compiled test, explore, sparkshell, packed install, and Cargo workspace gates are tracked below.

## Verification evidence

| Gate | Command | Result | Notes |
| --- | --- | --- | --- |
| TypeScript build | `npm run build` | PASS | Rebuilt `dist/` after release metadata/collateral edits and after the packed-install smoke fix. |
| Lint | `npm run lint` | PASS | `Checked 553 files ... No fixes applied.` |
| No-unused typecheck | `npm run check:no-unused` | PASS | Completed with exit code `0`. |
| Native agent generation check | `npm run verify:native-agents` | PASS | `verified 20 installable native agents and 33 setup prompt assets`. |
| Plugin bundle / mirror check | `npm run verify:plugin-bundle` | PASS | Initially failed because plugin manifest still said `0.14.4`; fixed with `npm run sync:plugin`, then check passed for 29 canonical skill directories and plugin metadata. |
| Plugin mirror sync check | `npm run sync:plugin:check` | PASS | Passed after mirror sync updated `plugins/oh-my-codex/.codex-plugin/plugin.json` to `0.15.0`. |
| Full Node test suite | `npm test` | NOT COMPLETE | Full compiled node lane was exercised through `npm run test:ci:compiled`; it continued after failures and was stopped after surfacing the blockers below. Treat as blocked until CI/local environment-specific failures are resolved or waived. |
| Compiled CI test lane | `npm run test:ci:compiled` | FAIL | Surfaced failures in `omx ask`, `resolveExploreHarnessCommand`, `exploreCommand`, detached tmux launcher sequencing, notify fallback/leader-side dispatch, cross-worktree heartbeat, and team message delivery smoke tests. Many failures show live macOS `/private/var` vs `/var` tmp path canonicalization, native harness hydration/platform, tmux/session-environment, and bridge visibility assumptions. |
| Explore tests | `npm run test:explore` | FAIL | Rust harness unit tests passed (30/30), routing/guidance tests passed, but 4 `dist/cli/__tests__/explore.test.js` tests failed: packaged native hydration, project CODEX_HOME `/private/var` vs `/var`, and two prompt/env-node E2E path-escape assertions caused by tmpdir symlink canonicalization. |
| Sparkshell tests | `npm run test:sparkshell` | PASS | Rust unit/integration/registry tests passed: 33 + 12 + 5 tests. |
| Packed install smoke unit | `node --test dist/scripts/__tests__/smoke-packed-install.test.js` | PASS | Added regression coverage for prepack logs before npm pack JSON; 7/7 tests passed. |
| Packed install smoke | `npm run smoke:packed-install` | PASS | Initially failed parsing `[sync-plugin-mirror]` prepack output as JSON; fixed parser to read the final npm-pack JSON array, reran, and got `packed install smoke: PASS`. |
| Rust workspace tests | `cargo test --workspace` | PASS | Workspace tests passed for `omx-explore-harness`, `omx-mux`, `omx-runtime`, `omx-runtime-core`, and `omx-sparkshell`. |

## Known limits / skipped checks

- External push, GitHub PR creation, GitHub CI, release tag creation, npm publish, and GitHub release publication are intentionally out of scope for this prep task.
- Manual cross-OS checks are not yet run; Windows/tmux coverage currently depends on automated regression suites unless a maintainer runs manual OS validation.
- A release-prep blocker fix was made for packed-install smoke parsing: `npm pack --json` can include prepack `sync-plugin-mirror` log lines before the final JSON array.

## Verdict

**Blocked on remaining test failures.** Release metadata, plugin mirror sync, collateral, build/typecheck/lint, packed install smoke, sparkshell, and Rust workspace gates are prepared, but `npm run test:ci:compiled` / `npm run test:explore` still fail in this macOS tmux worktree. Do not tag or publish `v0.15.0` until those blockers are fixed, reproduced as environment-only and waived, or pass in CI.
