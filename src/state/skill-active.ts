import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { omxStateDir } from '../utils/paths.js';

export const SKILL_ACTIVE_STATE_MODE = 'skill-active';
export const SKILL_ACTIVE_STATE_FILE = `${SKILL_ACTIVE_STATE_MODE}-state.json`;

export const CANONICAL_WORKFLOW_SKILLS = [
  'autopilot',
  'team',
  'ralph',
  'ultrawork',
  'ultraqa',
  'ralplan',
  'deep-interview',
] as const;

export type CanonicalWorkflowSkill = (typeof CANONICAL_WORKFLOW_SKILLS)[number];

export interface SkillActiveEntry {
  skill: string;
  phase?: string;
  active?: boolean;
  activated_at?: string;
  updated_at?: string;
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
}

export interface SkillActiveStateLike {
  version?: number;
  active?: boolean;
  skill?: string;
  keyword?: string;
  phase?: string;
  activated_at?: string;
  updated_at?: string;
  source?: string;
  session_id?: string;
  thread_id?: string;
  turn_id?: string;
  initialized_mode?: string;
  initialized_state_path?: string;
  input_lock?: unknown;
  active_skills?: SkillActiveEntry[];
  [key: string]: unknown;
}

export interface SyncCanonicalSkillStateOptions {
  cwd: string;
  mode: string;
  active: boolean;
  currentPhase?: string;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  nowIso?: string;
  source?: string;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function filterEntriesForSession(
  entries: SkillActiveEntry[],
  sessionId?: string,
): SkillActiveEntry[] {
  const normalizedSessionId = safeString(sessionId).trim();
  if (!normalizedSessionId) return entries;
  return entries.filter((entry) => safeString(entry.session_id).trim() === normalizedSessionId);
}

function normalizeSkillActiveEntry(raw: unknown): SkillActiveEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const skill = safeString((raw as Record<string, unknown>).skill).trim();
  if (!skill) return null;

  return {
    ...raw as Record<string, unknown>,
    skill,
    phase: safeString((raw as Record<string, unknown>).phase).trim() || undefined,
    active: (raw as Record<string, unknown>).active !== false,
    activated_at: safeString((raw as Record<string, unknown>).activated_at).trim() || undefined,
    updated_at: safeString((raw as Record<string, unknown>).updated_at).trim() || undefined,
    session_id: safeString((raw as Record<string, unknown>).session_id).trim() || undefined,
    thread_id: safeString((raw as Record<string, unknown>).thread_id).trim() || undefined,
    turn_id: safeString((raw as Record<string, unknown>).turn_id).trim() || undefined,
  };
}

export function listActiveSkills(raw: unknown): SkillActiveEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const state = raw as SkillActiveStateLike;
  const deduped = new Map<string, SkillActiveEntry>();

  if (Array.isArray(state.active_skills)) {
    for (const candidate of state.active_skills) {
      const normalized = normalizeSkillActiveEntry(candidate);
      if (!normalized || normalized.active === false) continue;
      deduped.set(normalized.skill, normalized);
    }
  }

  const topLevelSkill = safeString(state.skill).trim();
  if (deduped.size === 0 && state.active === true && topLevelSkill) {
    deduped.set(topLevelSkill, {
      skill: topLevelSkill,
      phase: safeString(state.phase).trim() || undefined,
      active: true,
      activated_at: safeString(state.activated_at).trim() || undefined,
      updated_at: safeString(state.updated_at).trim() || undefined,
      session_id: safeString(state.session_id).trim() || undefined,
      thread_id: safeString(state.thread_id).trim() || undefined,
      turn_id: safeString(state.turn_id).trim() || undefined,
    });
  }

  return [...deduped.values()];
}

export function normalizeSkillActiveState(raw: unknown): SkillActiveStateLike | null {
  if (!raw || typeof raw !== 'object') return null;
  const state = raw as SkillActiveStateLike;
  const activeSkills = listActiveSkills(state);
  const primary = activeSkills.find((entry) => entry.skill === safeString(state.skill).trim()) ?? activeSkills[0];
  const skill = safeString(state.skill).trim() || primary?.skill || '';
  if (!skill && activeSkills.length === 0) return null;

  return {
    ...state,
    version: typeof state.version === 'number' ? state.version : 1,
    active: typeof state.active === 'boolean' ? state.active : activeSkills.length > 0,
    skill,
    keyword: safeString(state.keyword).trim(),
    phase: safeString(state.phase).trim() || primary?.phase || '',
    activated_at: safeString(state.activated_at).trim() || primary?.activated_at || '',
    updated_at: safeString(state.updated_at).trim() || primary?.updated_at || '',
    source: safeString(state.source).trim() || undefined,
    session_id: safeString(state.session_id).trim() || primary?.session_id || undefined,
    thread_id: safeString(state.thread_id).trim() || primary?.thread_id || undefined,
    turn_id: safeString(state.turn_id).trim() || primary?.turn_id || undefined,
    active_skills: activeSkills.length > 0 ? activeSkills : undefined,
  };
}

export function getSkillActiveStatePaths(cwd: string, sessionId?: string): {
  rootPath: string;
  sessionPath?: string;
} {
  const rootPath = join(omxStateDir(cwd), SKILL_ACTIVE_STATE_FILE);
  const normalizedSession = safeString(sessionId).trim();
  if (!normalizedSession) return { rootPath };
  return {
    rootPath,
    sessionPath: join(omxStateDir(cwd), 'sessions', normalizedSession, SKILL_ACTIVE_STATE_FILE),
  };
}

export async function readSkillActiveState(path: string): Promise<SkillActiveStateLike | null> {
  try {
    return normalizeSkillActiveState(JSON.parse(await readFile(path, 'utf-8')));
  } catch {
    return null;
  }
}

export async function writeSkillActiveStateCopies(
  cwd: string,
  state: SkillActiveStateLike,
  sessionId?: string,
): Promise<void> {
  const { rootPath, sessionPath } = getSkillActiveStatePaths(cwd, sessionId);
  const payload = JSON.stringify(state, null, 2);

  await mkdir(dirname(rootPath), { recursive: true });
  await writeFile(rootPath, payload);

  if (sessionPath) {
    await mkdir(dirname(sessionPath), { recursive: true });
    await writeFile(sessionPath, payload);
  }
}

export async function readVisibleSkillActiveState(cwd: string, sessionId?: string): Promise<SkillActiveStateLike | null> {
  const { rootPath, sessionPath } = getSkillActiveStatePaths(cwd, sessionId);
  if (sessionPath && existsSync(sessionPath)) {
    return readSkillActiveState(sessionPath);
  }
  if (sessionPath) return null;
  if (!existsSync(rootPath)) return null;
  return readSkillActiveState(rootPath);
}

export function tracksCanonicalWorkflowSkill(mode: string): mode is CanonicalWorkflowSkill {
  return (CANONICAL_WORKFLOW_SKILLS as readonly string[]).includes(mode);
}

export async function syncCanonicalSkillStateForMode(options: SyncCanonicalSkillStateOptions): Promise<void> {
  const {
    cwd,
    mode,
    active,
    currentPhase,
    sessionId,
    threadId,
    turnId,
    nowIso = new Date().toISOString(),
    source = 'state-server',
  } = options;

  if (!tracksCanonicalWorkflowSkill(mode)) return;

  const { rootPath } = getSkillActiveStatePaths(cwd, sessionId);
  const existing = await readSkillActiveState(rootPath);
  if (!existing && !active) return;

  const entries = filterEntriesForSession(listActiveSkills(existing ?? {}), sessionId);
  const filtered = entries.filter((entry) => entry.skill !== mode);
  if (active) {
    filtered.push({
      skill: mode,
      phase: safeString(currentPhase).trim() || undefined,
      active: true,
      activated_at: entries.find((entry) => entry.skill === mode)?.activated_at || nowIso,
      updated_at: nowIso,
      session_id: safeString(sessionId).trim() || undefined,
      thread_id: safeString(threadId).trim() || undefined,
      turn_id: safeString(turnId).trim() || undefined,
    });
  }

  const currentPrimary = safeString(existing?.skill).trim();
  const primaryEntry = filtered.find((entry) => entry.skill === currentPrimary) ?? filtered[0];
  const nextState: SkillActiveStateLike = {
    ...(existing ?? {}),
    version: 1,
    active: filtered.length > 0,
    skill: primaryEntry?.skill || currentPrimary || mode,
    keyword: safeString(existing?.keyword).trim(),
    phase: primaryEntry?.phase || safeString(currentPhase).trim() || safeString(existing?.phase).trim(),
    activated_at: primaryEntry?.activated_at || safeString(existing?.activated_at).trim() || nowIso,
    updated_at: nowIso,
    source: safeString(existing?.source).trim() || source,
    session_id: safeString(sessionId).trim() || safeString(existing?.session_id).trim() || undefined,
    thread_id: safeString(threadId).trim() || safeString(existing?.thread_id).trim() || undefined,
    turn_id: safeString(turnId).trim() || safeString(existing?.turn_id).trim() || undefined,
    active_skills: filtered.length > 0 ? filtered : [],
  };

  await writeSkillActiveStateCopies(cwd, nextState, sessionId);
}
