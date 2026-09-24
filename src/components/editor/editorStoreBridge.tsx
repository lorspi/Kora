/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bridge that exposes DocView-owned runtime data (resolved attachment object URLs)
 * to TipTap NodeViews, which render outside DocView's React subtree props.
 * DocView provides the value; NodeViews read it via useEditorAssets().
 */
import { createContext, useContext } from 'react';

export interface EditorAssets {
  /** Map of relative attachment path -> resolved object/remote URL. */
  resolvedUrls: Record<string, string>;
}

const EditorAssetsContext = createContext<EditorAssets>({ resolvedUrls: {} });

export const EditorAssetsProvider = EditorAssetsContext.Provider;

export function useEditorAssets(): EditorAssets {
  return useContext(EditorAssetsContext);
}
