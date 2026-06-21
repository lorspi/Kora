/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Version detection for PWA update management.
 *
 * — useVersion() returns the version baked into the JS bundle at build time
 *   (the version the running code was compiled with).
 * — useUpdateCheck() fetches /version.txt from the server and compares it
 *   against the compiled version.  If they differ, a newer build has been
 *   deployed → the hook surfaces updateAvailable and automatically triggers
 *   a full cache-clearing reload after a brief delay.
 *
 * User data (projects, sessions, IndexedDB handles) is never touched.
 */

import { useState, useEffect, useRef } from 'react';

// ── Module-level caches (survives across hook instances within a session) ────

let cachedRemoteVersion: string | null = null;
let checkedForUpdate = false;
let autoUpdateTriggered = false;

// ── Standalone update handler (usable from both manual buttons & auto-trigger) ─

const performUpdate = async () => {
  // 1. Delete every SW-backed cache
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  // 2. Unregister all service workers — the next page load will register
  //    the fresh service-worker.js from the server
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }

  // 3. Reset in-memory flags so the next session starts clean
  cachedRemoteVersion = null;
  checkedForUpdate = false;
  autoUpdateTriggered = false;

  // 4. Hard-navigate with a cache-busting query parameter so the browser
  //    fetches index.html (and therefore all hashed chunks) from the
  //    server instead of its HTTP cache.
  const cacheBuster = __APP_VERSION__
    ? `?v=${encodeURIComponent(__APP_VERSION__)}`
    : `?t=${Date.now()}`;
  window.location.href = cacheBuster;
};

// ── Read the compile-time version ────────────────────────────────────────────

/** Returns the version the *running JS bundle* was built with. */
export function useVersion() {
  return __APP_VERSION__ || '';
}

// ── Update check with auto-reload ────────────────────────────────────────────

export function useUpdateCheck() {
  const [localVersion] = useState(__APP_VERSION__ || '');
  const [remoteVersion, setRemoteVersion] = useState(cachedRemoteVersion || '');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch the deployed /version.txt once per session ───────────────────
  useEffect(() => {
    if (checkedForUpdate) {
      // Already checked on a previous mount — derive state from cache
      setRemoteVersion(cachedRemoteVersion || '');
      setUpdateAvailable(
        !!cachedRemoteVersion && cachedRemoteVersion !== __APP_VERSION__
      );
      return;
    }

    let cancelled = false;

    const check = async () => {
      setChecking(true);
      try {
        const res = await fetch('/version.txt', { cache: 'no-store' });
        if (cancelled) return;
        cachedRemoteVersion = (await res.text()).trim();
        setRemoteVersion(cachedRemoteVersion);

        const hasUpdate = cachedRemoteVersion !== __APP_VERSION__;
        setUpdateAvailable(hasUpdate);
      } catch {
        if (!cancelled) setUpdateAvailable(false);
      } finally {
        if (!cancelled) {
          checkedForUpdate = true;
          setChecking(false);
        }
      }
    };

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Auto-trigger the full update when a newer version is detected ──────
  useEffect(() => {
    if (!updateAvailable || autoUpdateTriggered) return;
    autoUpdateTriggered = true;

    // Give the UI a moment to render the "update available" indicator
    // before forcing the full reload.
    timerRef.current = setTimeout(() => {
      performUpdate();
    }, 3000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateAvailable]);

  return {
    localVersion,
    remoteVersion,
    updateAvailable,
    checking,
    /** Delete caches, unregister SWs, and force a full reload from the server */
    performUpdate,
  };
}
