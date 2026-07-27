/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Version detection and remote update check.
 *
 * — useVersion() returns the version baked into the JS bundle at build time.
 * — useUpdateCheck() fetches the version.txt from the GitHub repository
 *   to detect new releases. If a newer version exists, surfaces a flag
 *   so the UI can show a download link to GitHub releases.
 *
 * Users running the cloud-hosted version always get the latest build.
 * Users running local releases see a notification when a new version
 * is available for download.
 */

import { useState, useEffect } from 'react';

// GitHub raw URL for version.txt
const REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/lorspi/Kora/main/public/version.txt';

// ── Module-level caches (survive across hook instances within a session) ─────

let cachedRemoteVersion: string | null = null;
let checkedForUpdate = false;

// ── Read the compile-time version ────────────────────────────────────────────

/** Returns the version the *running JS bundle* was built with. */
export function useVersion() {
  return __APP_VERSION__ || '';
}

// ── Remote version check (GitHub) ────────────────────────────────────────────

/**
 * Checks the remote GitHub repository for a newer version of Kora.
 * Compares the local build version against the latest published version.txt.
 *
 * If a newer version is available, `updateAvailable` will be true and
 * `remoteVersion` will contain the new version string.
 *
 * Silently fails if the repo is private, there's no internet, or the
 * fetch fails for any reason.
 */
export function useUpdateCheck() {
  const [localVersion] = useState(__APP_VERSION__ || '');
  const [remoteVersion, setRemoteVersion] = useState(cachedRemoteVersion || '');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (checkedForUpdate) {
      setRemoteVersion(cachedRemoteVersion || '');
      setUpdateAvailable(
        !!cachedRemoteVersion && cachedRemoteVersion !== __APP_VERSION__
      );
      return;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(REMOTE_VERSION_URL, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          checkedForUpdate = true;
          return;
        }
        cachedRemoteVersion = (await res.text()).trim();
        setRemoteVersion(cachedRemoteVersion);

        const hasUpdate = cachedRemoteVersion !== __APP_VERSION__;
        setUpdateAvailable(hasUpdate);
      } catch {
        // No internet or repo is private — no update notification
        if (!cancelled) setUpdateAvailable(false);
      } finally {
        if (!cancelled) checkedForUpdate = true;
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  return {
    localVersion,
    remoteVersion,
    updateAvailable,
  };
}
