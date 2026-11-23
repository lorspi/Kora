/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-project persistence of the Cloudflare backend link (Worker address, access
 * token and space). Unlike the public Firebase config, the token is a credential:
 * it stays only in this browser's localStorage, keyed by Kora's internal project
 * id, and is sent only to the team's own Worker.
 */

import type { CloudflareLink } from './cloudflare';

const PREFIX = 'kora-cloudflare-link-';

export function saveCloudflareLinkForProject(projectId: string, link: CloudflareLink): void {
  try {
    localStorage.setItem(PREFIX + projectId, JSON.stringify(link));
  } catch (e) {
    console.warn('Could not save Cloudflare link for project', e);
  }
}

export function loadCloudflareLinkForProject(projectId: string): CloudflareLink | null {
  try {
    const raw = localStorage.getItem(PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.url === 'string' && typeof parsed.token === 'string') {
      return { url: parsed.url, token: parsed.token, spaceId: parsed.spaceId || 'default' };
    }
  } catch (e) {
    console.warn('Could not load Cloudflare link for project', e);
  }
  return null;
}

export function deleteCloudflareLinkForProject(projectId: string): void {
  try {
    localStorage.removeItem(PREFIX + projectId);
  } catch (e) {
    console.warn('Could not delete Cloudflare link for project', e);
  }
}
