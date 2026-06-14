/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

let cachedLocalVersion: string | null = null;
let cachedRemoteVersion: string | null = null;
let checkedForUpdate = false;

export function useVersion() {
  const [version, setVersion] = useState(cachedLocalVersion || '');

  useEffect(() => {
    if (cachedLocalVersion) {
      setVersion(cachedLocalVersion);
      return;
    }
    fetch('/version.txt', { cache: 'no-store' })
      .then(res => res.text())
      .then(text => {
        cachedLocalVersion = text.trim();
        setVersion(cachedLocalVersion);
      })
      .catch(() => setVersion(''));
  }, []);

  return version;
}

export function useUpdateCheck() {
  const [localVersion, setLocalVersion] = useState(cachedLocalVersion || '');
  const [remoteVersion, setRemoteVersion] = useState(cachedRemoteVersion || '');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (checkedForUpdate && cachedLocalVersion && cachedRemoteVersion !== null) {
      setLocalVersion(cachedLocalVersion);
      setRemoteVersion(cachedRemoteVersion || '');
      setUpdateAvailable(
        !!cachedRemoteVersion && !!cachedLocalVersion && cachedRemoteVersion !== cachedLocalVersion
      );
      return;
    }

    const check = async () => {
      setChecking(true);
      try {
        // Load local (cached) version — always bypass HTTP cache
        if (!cachedLocalVersion) {
          const localRes = await fetch('/version.txt', { cache: 'no-store' });
          cachedLocalVersion = (await localRes.text()).trim();
        }
        setLocalVersion(cachedLocalVersion);

        // Load remote version bypassing cache
        const remoteRes = await fetch('/version.txt', { cache: 'no-store' });
        cachedRemoteVersion = (await remoteRes.text()).trim();
        setRemoteVersion(cachedRemoteVersion);

        const hasUpdate = cachedRemoteVersion !== cachedLocalVersion;
        setUpdateAvailable(hasUpdate);
      } catch {
        // If offline or request fails, no update available
        setUpdateAvailable(false);
      } finally {
        checkedForUpdate = true;
        setChecking(false);
      }
    };

    check();
  }, []);

  const performUpdate = async () => {
    // 1. Delete all SW caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }

    // 2. Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(reg => reg.unregister()));
    }

    // 3. Reset in-memory version cache
    cachedLocalVersion = null;
    cachedRemoteVersion = null;
    checkedForUpdate = false;

    // 4. Force browser to fetch fresh version.txt (bust HTTP cache)
    try {
      await fetch('/version.txt', { cache: 'reload' });
    } catch {
      // Ignore — the reload below will pick it up
    }

    // 5. Hard reload bypassing browser cache
    window.location.reload();
  };

  return {
    localVersion,
    remoteVersion,
    updateAvailable,
    checking,
    performUpdate
  };
}
