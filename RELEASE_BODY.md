# oh-my-codex v0.12.1

**Patch release for team/runtime hygiene, launch/cleanup follow-through, notify-fallback hardening, and release collateral alignment**

`0.12.1` follows `0.12.0` with the full `v0.12.0..v0.12.1` patch train: clean machine-readable team status output, correct interactive worker PID metadata, launch-safe MCP cleanup, direct-leader launch follow-through, notify-fallback log hardening, tighter operator guidance, and synchronized `0.12.1` release collateral.

## Highlights

- `omx team status --json` no longer risks stray mailbox-delivery stderr noise during stale leader-mail pruning.
- Interactive team workers now record the PID of their actual tmux pane, not a pane-index approximation.
- Orphaned OMX MCP cleanup now protects the live launcher tree, and notify-fallback once-mode logs no longer grow without bound.
- OMX now defaults to direct leader launch outside tmux unless detached tmux is explicitly requested.
- Release metadata and collateral are aligned to `0.12.1`.

## What’s Changed

### Fixes
- avoid duplicate bridge `MarkMailboxDelivered` calls for already-delivered leader system mail
- persist interactive worker PID metadata from the resolved pane id
- preserve live launcher ancestry while reaping orphaned OMX MCP processes
- rotate notify-fallback once-mode logs under the configured size cap

### Changed
- default leader launches to direct mode outside tmux unless `--tmux` explicitly requests detached startup
- tighten the information-architect prompt
- bump release metadata from `0.12.0` to `0.12.1` across Node/Cargo manifests, changelog, and release collateral

## Verification

- `npm run build`
- `npx biome lint src/cli/index.ts src/cli/cleanup.ts src/cli/__tests__/index.test.ts src/cli/__tests__/cleanup.test.ts src/scripts/notify-fallback-watcher.ts src/hooks/__tests__/notify-fallback-watcher.test.ts src/team/runtime.ts src/team/state/mailbox.ts src/team/__tests__/runtime.test.ts src/team/__tests__/state.test.ts package.json`
- `node --test dist/cli/__tests__/cleanup.test.js dist/cli/__tests__/index.test.js dist/cli/__tests__/version-sync-contract.test.js`
- `node --test dist/hooks/__tests__/notify-fallback-watcher.test.js`
- `node --test dist/team/__tests__/state.test.js dist/team/__tests__/runtime.test.js`
- `npm run smoke:packed-install`

## Remaining risk

- This verification is still local; it is not a full GitHub Actions matrix rerun.
- The release still touches live team/runtime and notification surfaces, so post-release monitoring should watch team status output, interactive worker lifecycle telemetry, and notify-fallback behavior.

## Contributors

- [@Yeachan-Heo](https://github.com/Yeachan-Heo) (Bellman)

**Full Changelog**: [`v0.12.0...v0.12.1`](https://github.com/Yeachan-Heo/oh-my-codex/compare/v0.12.0...v0.12.1)
