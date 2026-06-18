/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-project saved session persistence for the multi-project browser.
 */

const SAVED_SESSIONS_KEY = 'kora-saved-sessions';

export type SavedSessions = Record<string, { username: string; savedAt: number }>;

export function loadSavedSessions(): SavedSessions {
  try {
    const raw = localStorage.getItem(SAVED_SESSIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not load saved sessions', e);
  }
  return {};
}

export function saveSavedSessions(sessions: SavedSessions) {
  try {
    localStorage.setItem(SAVED_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (e) {
    console.warn('Could not save saved sessions', e);
  }
}

export function saveSessionForProject(projectId: string, username: string) {
  const sessions = loadSavedSessions();
  sessions[projectId] = { username, savedAt: Date.now() };
  saveSavedSessions(sessions);
}

export function removeSessionForProject(projectId: string) {
  const sessions = loadSavedSessions();
  delete sessions[projectId];
  saveSavedSessions(sessions);
}
