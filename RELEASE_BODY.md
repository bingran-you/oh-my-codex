# oh-my-codex v0.12.2

**Patch release for Windows team worker boot/shutdown safety, postLaunch mode-state shutdown-race recovery, canonical HUD skill-state visibility, and team state preservation on monitor-driven exits**

`0.12.2` follows `0.12.1` with the full `v0.12.1..v0.12.2` patch train: native Windows + psmux team workers now boot and shut down cleanly, postLaunch mode-state cleanup recovers transient shutdown-race JSON without crashing, HUD workflow badges stop outliving their session, and team state is preserved until operators explicitly request shutdown.

## Highlights

- Native Windows + psmux split-pane shutdown no longer kills the leader pane during `omx team shutdown --force`.
- Native Windows team worker panes boot through an explicit PowerShell path instead of POSIX `/bin/sh -lc`, so workers actually report ready.
- `postLaunch` mode-state cleanup now survives transient shutdown races by recovering empty or truncated JSON into a minimal inactive record.
- HUD workflow badges follow canonical session-scoped skill-active state so stale root-only mode state no longer surfaces as a ghost workflow.
- Monitor-detected terminal and failure conditions in the runtime CLI stay report-only; team state is preserved until an explicit shutdown is issued.
- Release metadata and collateral are aligned to `0.12.2`.

## What’s Changed

### Fixes
- preserve the leader pane on native Windows + psmux split-pane shutdown by skipping process-tree prekill when leader/client ancestry overlaps (PR [#1358](https://github.com/Yeachan-Heo/oh-my-codex/pull/1358))
- make `postLaunch` mode-state cleanup recover transient shutdown-race JSON while still warning on structurally complete malformed state (PR [#1360](https://github.com/Yeachan-Heo/oh-my-codex/pull/1360))
- boot native Windows team worker panes through an encoded PowerShell command with env + PATH bootstrap instead of POSIX `/bin/sh -lc` (PR [#1362](https://github.com/Yeachan-Heo/oh-my-codex/pull/1362))
- canonicalize HUD workflow visibility through session-scoped skill-active state and suppress stale root-only mode badges across HUD, overlay, keyword activation, and MCP state (PR [#1367](https://github.com/Yeachan-Heo/oh-my-codex/pull/1367))
- preserve team state until explicit shutdown by keeping monitor-driven runtime-cli exits on the report-only path (PR [#1369](https://github.com/Yeachan-Heo/oh-my-codex/pull/1369))

### Changed
- bump release metadata from `0.12.1` to `0.12.2` across Node/Cargo manifests, changelog, and release collateral

## Verification

- `npm run build`
- `npm run lint`
- `npm test`
- `npm run smoke:packed-install`

## Remaining risk

- This verification is still local; it is not a full GitHub Actions matrix rerun.
- The Windows-specific fixes (#1358, #1362) ship without a live native Windows 11 + psmux smoke run, so post-release monitoring should watch team-worker boot and split-pane shutdown telemetry on Windows.
- The HUD canonicalization change (#1367) touches HUD, overlay, keyword-detector, MCP state, and skill-active paths at once; post-release monitoring should watch for any drift in single-skill readers or multi-workflow badge visibility.

## Contributors

- [@Yeachan-Heo](https://github.com/Yeachan-Heo) (Bellman)

**Full Changelog**: [`v0.12.1...v0.12.2`](https://github.com/Yeachan-Heo/oh-my-codex/compare/v0.12.1...v0.12.2)
