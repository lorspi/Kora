/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

let cachedVersion: string | null = null;

export function useVersion() {
  const [version, setVersion] = useState(cachedVersion || '');

  useEffect(() => {
    if (cachedVersion) {
      setVersion(cachedVersion);
      return;
    }
    fetch('/version.txt')
      .then(res => res.text())
      .then(text => {
        cachedVersion = text.trim();
        setVersion(cachedVersion);
      })
      .catch(() => setVersion(''));
  }, []);

  return version;
}
