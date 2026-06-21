/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Eye, EyeOff } from 'lucide-react';

type FontScale = 'sm' | 'md' | 'lg' | 'xl';

const FONT_SCALE_KEY = 'kora-font-scale';
const HIGH_CONTRAST_KEY = 'kora-high-contrast';

const FONT_SCALE_LABELS: Record<FontScale, string> = {
  sm: 'Pequeño',
  md: 'Normal',
  lg: 'Grande',
  xl: 'Extra Grande',
};

const FONT_SCALE_VALUES: FontScale[] = ['sm', 'md', 'lg', 'xl'];

function applyFontScale(scale: FontScale) {
  const root = document.documentElement;
  root.classList.remove('text-scale-sm', 'text-scale-lg', 'text-scale-xl');
  if (scale !== 'md') {
    root.classList.add(`text-scale-${scale}`);
  }
}

function applyHighContrast(enabled: boolean) {
  const root = document.documentElement;
  root.classList.toggle('high-contrast', enabled);
}

export default function AccessibilitySection() {
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    try {
      return (localStorage.getItem(FONT_SCALE_KEY) as FontScale) || 'md';
    } catch {
      return 'md';
    }
  });

  const [highContrast, setHighContrast] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIGH_CONTRAST_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    applyFontScale(fontScale);
    try {
      localStorage.setItem(FONT_SCALE_KEY, fontScale);
    } catch {}
  }, [fontScale]);

  useEffect(() => {
    applyHighContrast(highContrast);
    try {
      localStorage.setItem(HIGH_CONTRAST_KEY, highContrast ? 'true' : 'false');
    } catch {}
  }, [highContrast]);

  const increaseFont = useCallback(() => {
    setFontScale(prev => {
      const idx = FONT_SCALE_VALUES.indexOf(prev);
      return FONT_SCALE_VALUES[Math.min(idx + 1, FONT_SCALE_VALUES.length - 1)];
    });
  }, []);

  const decreaseFont = useCallback(() => {
    setFontScale(prev => {
      const idx = FONT_SCALE_VALUES.indexOf(prev);
      return FONT_SCALE_VALUES[Math.max(idx - 1, 0)];
    });
  }, []);

  const currentIdx = FONT_SCALE_VALUES.indexOf(fontScale);
  const isMin = currentIdx === 0;
  const isMax = currentIdx === FONT_SCALE_VALUES.length - 1;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-card transition-all duration-300 hover:shadow-card-hover">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-bento-yellow-light text-bento-yellow flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="16" cy="4" r="1"/>
            <path d="m18 19 1-7-6 1"/>
            <path d="m5 8 3-3 5.5 3-2.36 3.5"/>
            <path d="M4.24 14.5a5 5 0 0 0 6.88 6"/>
            <path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground font-heading">Accesibilidad</h3>
          <p className="text-[10px] text-muted-foreground">Ajusta la visualización de la interfaz</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Font Size Control */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-foreground">Tamaño de fuente</span>
            <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
              {FONT_SCALE_LABELS[fontScale]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={decreaseFont}
              disabled={isMin}
              className="w-9 h-9 rounded-lg bg-secondary hover:bg-accent border border-border flex items-center justify-center text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Reducir fuente"
              aria-label="Reducir tamaño de fuente"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            {/* Visual scale indicator */}
            <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-bento-yellow rounded-full transition-all duration-300"
                style={{ width: `${((currentIdx) / (FONT_SCALE_VALUES.length - 1)) * 100}%` }}
              />
            </div>

            <button
              onClick={increaseFont}
              disabled={isMax}
              className="w-9 h-9 rounded-lg bg-secondary hover:bg-accent border border-border flex items-center justify-center text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="Aumentar fuente"
              aria-label="Aumentar tamaño de fuente"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* High Contrast Toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Alto contraste</span>
            <span className="text-[10px] text-muted-foreground">
              {highContrast ? 'Activado' : 'Desactivado'}
            </span>
          </div>
          <button
            onClick={() => setHighContrast(prev => !prev)}
            className={`relative w-11 h-6 rounded-full transition-colors duration-300 cursor-pointer ${
              highContrast ? 'bg-bento-yellow' : 'bg-muted-foreground/30'
            }`}
            role="switch"
            aria-checked={highContrast}
            aria-label="Alternar alto contraste"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 flex items-center justify-center ${
                highContrast ? 'translate-x-5' : 'translate-x-0'
              }`}
            >
              {highContrast ? (
                <Eye className="w-3 h-3 text-bento-yellow" />
              ) : (
                <EyeOff className="w-3 h-3 text-muted-foreground" />
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
