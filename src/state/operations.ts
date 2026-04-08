import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { withModeRuntimeContext } from './mode-state-context.js';
import {
  getAllScopedStatePaths,
  getReadScopedStateDirs,
  getReadScopedStatePaths,
  getStateDir,
  getStatePath,
  resolveStateScope,
  resolveWorkingDirectoryForState,
  validateSessionId,
  validateStateModeSegment,
} from '../mcp/state-paths.js';
import { ensureCanonicalRalphArtifacts } from '../ralph/persistence.js';
import { RALPH_PHASES, validateAndNormalizeRalphState } from '../ralph/contract.js';

export const SUPPORTED_STATE_READ_MODES = [
  'autopilot',
  'team',
  'ralph',
  'ultrawork',
  'ultraqa',
  'ralplan',
  'deep-interview',
] as const;

export type SupportedStateReadMode = (typeof SUPPORTED_STATE_READ_MODES)[number];
export type StateOperationName =
  | 'state_read'
  | 'state_write'
  | 'state_clear'
  | 'state_list_active'
  | 'state_get_status';

export interface StateOperationResponse {
  payload: unknown;
  isError?: boolean;
}

const stateWriteQueues = new Map<string, Promise<void>>();

async function withStateWriteLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const tail = stateWriteQueues.get(path) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = tail.finally(() => gate);
  stateWriteQueues.set(path, queued);

  await tail.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (stateWriteQueues.get(path) === queued) {
      stateWriteQueues.delete(path);
    }
  }
}

async function writeAtomicFile(path: string, data: string): Promise<void> {
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  await writeFile(tmpPath, data, 'utf-8');
  try {
    await rename(tmpPath, path);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function readModeSupportsStrictValidation(mode: string): mode is SupportedStateReadMode {
  return SUPPORTED_STATE_READ_MODES.includes(mode as SupportedStateReadMode);
}

function validateStrictReadableMode(mode: unknown): string {
  const normalized = validateStateModeSegment(mode);
  if (!readModeSupportsStrictValidation(normalized)) {
    throw new Error(`mode must be one of: ${SUPPORTED_STATE_READ_MODES.join(', ')}`);
  }
  return normalized;
}

async function initializeStateEnvironment(cwd: string, effectiveSessionId?: string): Promise<void> {
  await mkdir(getStateDir(cwd), { recursive: true });
  if (effectiveSessionId) {
    await mkdir(getStateDir(cwd, effectiveSessionId), { recursive: true });
  }
  const { ensureTmuxHookInitialized } = await import('../cli/tmux-hook.js');
  await ensureTmuxHookInitialized(cwd);
}

export async function listStateStatuses(
  cwd: string,
  explicitSessionId?: string,
  mode?: string,
): Promise<Record<string, unknown>> {
  const stateDirs = await getReadScopedStateDirs(cwd, explicitSessionId);
  const statuses: Record<string, unknown> = {};
  const seenModes = new Set<string>();

  for (const stateDir of stateDirs) {
    if (!existsSync(stateDir)) continue;
    const files = await readdir(stateDir);
    for (const file of files) {
      if (!file.endsWith('-state.json')) continue;
      const currentMode = file.replace('-state.json', '');
      if (mode && currentMode !== mode) continue;
      if (seenModes.has(currentMode)) continue;
      seenModes.add(currentMode);
      try {
        const data = JSON.parse(await readFile(join(stateDir, file), 'utf-8'));
        statuses[currentMode] = {
          active: data.active,
          phase: data.current_phase,
          path: join(stateDir, file),
          data,
        };
      } catch {
        statuses[currentMode] = { error: 'malformed state file' };
      }
    }
  }

  return statuses;
}


export async function listActiveStateModes(
  workingDirectory?: string,
  explicitSessionId?: string,
): Promise<string[]> {
  const cwd = resolveWorkingDirectoryForState(workingDirectory);
  const sessionId = validateSessionId(explicitSessionId);
  const statuses = await listStateStatuses(cwd, sessionId);
  return Object.entries(statuses)
    .filter(([, status]) => Boolean((status as { active?: unknown }).active))
    .map(([mode]) => mode);
}

export async function executeStateOperation(
  name: StateOperationName,
  rawArgs: Record<string, unknown> = {},
): Promise<StateOperationResponse> {
  let cwd: string;
  let explicitSessionId: string | undefined;

  try {
    cwd = resolveWorkingDirectoryForState(rawArgs.workingDirectory as string | undefined);
    explicitSessionId = validateSessionId(rawArgs.session_id);
  } catch (error) {
    return {
      payload: { error: (error as Error).message },
      isError: true,
    };
  }

  try {
    const stateScope = await resolveStateScope(cwd, explicitSessionId);
    const effectiveSessionId = stateScope.sessionId;
    await initializeStateEnvironment(cwd, effectiveSessionId);

    switch (name) {
      case 'state_read': {
        const mode = validateStrictReadableMode(rawArgs.mode);
        const paths = await getReadScopedStatePaths(mode, cwd, explicitSessionId);
        const path = paths.find((candidate) => existsSync(candidate));
        if (!path) {
          return { payload: { exists: false, mode } };
        }
        const data = JSON.parse(await readFile(path, 'utf-8'));
        return { payload: data };
      }

      case 'state_write': {
        const mode = validateStateModeSegment(rawArgs.mode);
        const path = getStatePath(mode, cwd, effectiveSessionId);
        const {
          mode: _mode,
          workingDirectory: _workingDirectory,
          session_id: _sessionId,
          state: customState,
          ...fields
        } = rawArgs;
        let validationError: string | null = null;

        await withStateWriteLock(path, async () => {
          let existing: Record<string, unknown> = {};
          if (existsSync(path)) {
            try {
              existing = JSON.parse(await readFile(path, 'utf-8'));
            } catch (error) {
              process.stderr.write(`[state] Failed to parse state file: ${error}\n`);
            }
          }

          const mergedRaw = {
            ...existing,
            ...fields,
            ...((customState as Record<string, unknown>) || {}),
          } as Record<string, unknown>;

          if (
            mode === 'ralph' &&
            effectiveSessionId &&
            typeof mergedRaw.owner_omx_session_id !== 'string'
          ) {
            mergedRaw.owner_omx_session_id = effectiveSessionId;
          }

          if (mode === 'ralph') {
            const originalPhase = mergedRaw.current_phase;
            const validation = validateAndNormalizeRalphState(mergedRaw);
            if (!validation.ok || !validation.state) {
              validationError = validation.error || `ralph.current_phase must be one of: ${RALPH_PHASES.join(', ')}`;
              return;
            }
            if (
              typeof originalPhase === 'string' &&
              typeof validation.state.current_phase === 'string' &&
              validation.state.current_phase !== originalPhase
            ) {
              validation.state.ralph_phase_normalized_from = originalPhase;
            }
            Object.assign(mergedRaw, validation.state);
            await ensureCanonicalRalphArtifacts(cwd, effectiveSessionId);
          }

          const merged = withModeRuntimeContext(existing, mergedRaw);
          await writeAtomicFile(path, JSON.stringify(merged, null, 2));
        });

        if (validationError) {
          return {
            payload: { error: validationError },
            isError: true,
          };
        }

        return { payload: { success: true, mode, path } };
      }

      case 'state_clear': {
        const mode = validateStateModeSegment(rawArgs.mode);
        const allSessions = rawArgs.all_sessions === true;

        if (!allSessions) {
          const path = getStatePath(mode, cwd, effectiveSessionId);
          if (existsSync(path)) {
            await unlink(path);
          }
          return { payload: { cleared: true, mode, path } };
        }

        const removedPaths: string[] = [];
        const paths = await getAllScopedStatePaths(mode, cwd);
        for (const path of paths) {
          if (!existsSync(path)) continue;
          await unlink(path);
          removedPaths.push(path);
        }

        return {
          payload: {
            cleared: true,
            mode,
            all_sessions: true,
            removed: removedPaths.length,
            paths: removedPaths,
            warning: 'all_sessions clears global and session-scoped state files',
          },
        };
      }

      case 'state_list_active': {
        const activeModes = await listActiveStateModes(cwd, explicitSessionId);
        return { payload: { active_modes: activeModes } };
      }

      case 'state_get_status': {
        const mode = typeof rawArgs.mode === 'string' ? rawArgs.mode.trim() : undefined;
        const statuses = await listStateStatuses(cwd, explicitSessionId, mode || undefined);
        return { payload: { statuses } };
      }
    }
  } catch (error) {
    return {
      payload: { error: (error as Error).message },
      isError: true,
    };
  }
}
