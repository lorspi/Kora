/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useVersion } from '../hooks/useVersion';

export default function VersionBadge() {
  const version = useVersion();
  if (!version) return null;
  return (
    <span className="fixed bottom-3 right-3 text-[10px] font-mono text-muted-foreground/50 select-none pointer-events-none">
      v{version}
    </span>
  );
}
