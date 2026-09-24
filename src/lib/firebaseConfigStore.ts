/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-project persistence of the (public) Firebase config that each team pastes.
 *
 * The Firebase web config (apiKey, authDomain, projectId, appId, ...) is public
 * by design — it ships in every Firebase web app and is safe to store in the
 * browser. Actual data protection comes from Firestore security rules + auth,
 * not from hiding this config. We keep it in localStorage keyed by Kora's
 * internal project id so each linked cloud project remembers its own backend.
 */

import type { FirebaseConfig } from './firebase';

const PREFIX = 'kora-firebase-config-';

interface StoredFirebaseLink {
  config: FirebaseConfig;
  /** Logical space inside the Firebase project (allows multiple Kora spaces). */
  spaceId: string;
}

export function saveFirebaseConfigForProject(projectId: string, config: FirebaseConfig, spaceId = 'default'): void {
  try {
    const payload: StoredFirebaseLink = { config, spaceId };
    localStorage.setItem(PREFIX + projectId, JSON.stringify(payload));
  } catch (e) {
    console.warn('Could not save Firebase config for project', e);
  }
}

export function loadFirebaseConfigForProject(projectId: string): StoredFirebaseLink | null {
  try {
    const raw = localStorage.getItem(PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.config) {
      return { config: parsed.config, spaceId: parsed.spaceId || 'default' };
    }
  } catch (e) {
    console.warn('Could not load Firebase config for project', e);
  }
  return null;
}

export function deleteFirebaseConfigForProject(projectId: string): void {
  try {
    localStorage.removeItem(PREFIX + projectId);
  } catch (e) {
    console.warn('Could not delete Firebase config for project', e);
  }
}
