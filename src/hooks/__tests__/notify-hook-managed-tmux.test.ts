import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTmuxSessionName } from '../../cli/index.js';
import { resolveManagedSessionContext, verifyManagedPaneTarget } from '../../scripts/notify-hook/managed-tmux.js';
import { writeSessionStart } from '../session.js';

describe('notify-hook managed tmux windows fallback', () => {
  async function withFakeTmux(cwd: string, script: string, run: () => Promise<void>): Promise<void> {
    const fakeBinDir = join(cwd, 'fake-bin');
    const fakeTmuxPath = join(fakeBinDir, 'tmux');
    const previousPath = process.env.PATH;
    await mkdir(fakeBinDir, { recursive: true });
    await writeFile(fakeTmuxPath, script);
    await chmod(fakeTmuxPath, 0o755);
    process.env.PATH = `${fakeBinDir}:${previousPath || ''}`;
    try {
      await run();
    } finally {
      if (typeof previousPath === 'string') process.env.PATH = previousPath;
      else delete process.env.PATH;
    }
  }

  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const originalTmux = process.env.TMUX;
  const originalTmuxPane = process.env.TMUX_PANE;
  const originalTeamWorker = process.env.OMX_TEAM_WORKER;

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    if (originalTmux !== undefined) process.env.TMUX = originalTmux;
    else delete process.env.TMUX;
    if (originalTmuxPane !== undefined) process.env.TMUX_PANE = originalTmuxPane;
    else delete process.env.TMUX_PANE;
    if (originalTeamWorker !== undefined) process.env.OMX_TEAM_WORKER = originalTeamWorker;
    else delete process.env.OMX_TEAM_WORKER;
  });

  it('does not rely on ps ancestry checks on native Windows', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omx-managed-tmux-win32-'));
    try {
      const stateDir = join(cwd, '.omx', 'state');
      const sessionId = 'omx-test-session';
      await mkdir(stateDir, { recursive: true });
      await writeFile(join(stateDir, 'session.json'), JSON.stringify({
        session_id: sessionId,
        started_at: new Date().toISOString(),
        cwd,
        pid: 999999,
        platform: 'win32',
      }, null, 2));

      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      delete process.env.TMUX;
      delete process.env.TMUX_PANE;
      process.env.OMX_TEAM_WORKER = '';

      const result = await resolveManagedSessionContext(cwd, { session_id: sessionId }, { allowTeamWorker: false });
      assert.equal(result.managed, false);
      assert.equal(result.reason, 'stale_session');
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('accepts native payload session ids when session state stores a separate native_session_id', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omx-managed-tmux-native-session-'));
    try {
      const stateDir = join(cwd, '.omx', 'state');
      await mkdir(stateDir, { recursive: true });
      await writeSessionStart(cwd, 'omx-canonical-session');
      const current = JSON.parse(await readFile(join(stateDir, 'session.json'), 'utf-8'));
      await writeFile(join(stateDir, 'session.json'), JSON.stringify({
        ...current,
        native_session_id: 'codex-native-session',
      }, null, 2));

      delete process.env.TMUX;
      delete process.env.TMUX_PANE;
      process.env.OMX_TEAM_WORKER = '';

      const result = await resolveManagedSessionContext(cwd, { session_id: 'codex-native-session' }, { allowTeamWorker: false });
      assert.equal(result.managed, true);
      assert.equal(result.invocationSessionId, 'codex-native-session');
      assert.equal(result.canonicalSessionId, 'omx-canonical-session');
      assert.equal(result.nativeSessionId, 'codex-native-session');
      assert.match(result.expectedTmuxSessionName, /omx-canonical-session|canonical-session/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('accepts symlinked cwd aliases for the same managed session', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omx-managed-tmux-cwd-alias-'));
    const aliasCwd = `${cwd}-alias`;
    try {
      await symlink(cwd, aliasCwd, process.platform === 'win32' ? 'junction' : 'dir');
      await writeSessionStart(cwd, 'omx-alias-session');

      delete process.env.TMUX;
      delete process.env.TMUX_PANE;
      process.env.OMX_TEAM_WORKER = '';

      const result = await resolveManagedSessionContext(aliasCwd, { session_id: 'omx-alias-session' }, { allowTeamWorker: false });
      assert.equal(result.managed, true);
      assert.match(result.reason, /ancestry_match$/);
      assert.equal(result.canonicalSessionId, 'omx-alias-session');
      assert.equal(result.expectedTmuxSessionName, buildTmuxSessionName(cwd, 'omx-alias-session'));
    } finally {
      await rm(aliasCwd, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('verifies managed pane targets when invoked from a cwd alias for the same session', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'omx-managed-tmux-pane-alias-'));
    const aliasCwd = `${cwd}-alias`;
    const sessionId = 'omx-alias-session';
    try {
      await symlink(cwd, aliasCwd, process.platform === 'win32' ? 'junction' : 'dir');
      await writeSessionStart(cwd, sessionId);

      delete process.env.TMUX;
      delete process.env.TMUX_PANE;
      process.env.OMX_TEAM_WORKER = '';

      const managedSessionName = buildTmuxSessionName(cwd, sessionId);
      await withFakeTmux(cwd, `#!/usr/bin/env bash
set -eu
cmd="$1"
shift || true
if [[ "$cmd" == "display-message" ]]; then
  target=""
  format=""
  while (($#)); do
    case "$1" in
      -p) shift ;;
      -t) target="$2"; shift 2 ;;
      *) format="$1"; shift ;;
    esac
  done
  if [[ "$target" == "%42" && "$format" == "#S" ]]; then
    echo "${managedSessionName}"
    exit 0
  fi
fi
echo "unsupported tmux call: $cmd $*" >&2
exit 1
`, async () => {
        const verdict = await verifyManagedPaneTarget('%42', aliasCwd, { session_id: sessionId }, { allowTeamWorker: false });
        assert.equal(verdict.ok, true);
        assert.equal(verdict.reason, 'ok');
        assert.equal(verdict.paneSessionName, managedSessionName);
        assert.equal(verdict.managedContext.expectedTmuxSessionName, managedSessionName);
      });
    } finally {
      await rm(aliasCwd, { recursive: true, force: true });
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
