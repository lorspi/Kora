/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// App-wide tooltips (same style as Nori). Any element with a data-tooltip attribute shows it
// on hover; data-shortcut adds key caps ("Ctrl+K", alternatives separated by " / ") and
// data-tooltip-title a bold heading above the text.

const SHOW_DELAY = 450;
// Once a tooltip is visible, moving to a neighbour shows its tooltip right away
const SWITCH_WINDOW = 300;
const GAP = 6;
const MARGIN = 8;

interface TooltipState {
  el: HTMLElement;
  text: string;
  title: string | null;
  shortcut: string | null;
}

const readTooltip = (el: HTMLElement): TooltipState | null => {
  const text = el.getAttribute('data-tooltip');
  if (!text) return null;
  return { el, text, title: el.getAttribute('data-tooltip-title'), shortcut: el.getAttribute('data-shortcut') };
};

// On Mac the Ctrl shortcuts are also read with Cmd
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Key caps for a shortcut: "Ctrl+Shift+Z / Ctrl+Y" -> [["Ctrl","Shift","Z"], ["Ctrl","Y"]]
export const ShortcutKeys: React.FC<{ shortcut: string; className?: string }> = ({ shortcut, className = '' }) => {
  const alternatives = shortcut.split(' / ').map((alt) =>
    alt
      .split(/\+(?!$)/)
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => (IS_MAC && k === 'Ctrl' ? '⌘' : k))
  );
  return (
    <span className={`flex items-center gap-1 shrink-0 ${className}`}>
      {alternatives.map((keys, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="opacity-60 px-0.5">o</span>}
          {keys.map((key, j) => (
            <kbd
              key={j}
              className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-[5px] bg-[#e4e4e7] text-[#18181b] font-body text-[10px] font-semibold leading-none"
            >
              {key}
            </kbd>
          ))}
        </React.Fragment>
      ))}
    </span>
  );
};

export const TooltipLayer: React.FC = () => {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenAtRef = useRef(0);
  const tipRef = useRef<TooltipState | null>(null);
  tipRef.current = tip;

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const hide = () => {
      clearTimer();
      if (tipRef.current) hiddenAtRef.current = Date.now();
      setTip(null);
      setPos(null);
    };

    const handleOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[data-tooltip]') as HTMLElement | null;
      if (el === tipRef.current?.el) return;
      if (!el) {
        hide();
        return;
      }
      const next = readTooltip(el);
      if (!next) return;
      clearTimer();
      const quick = tipRef.current || Date.now() - hiddenAtRef.current < SWITCH_WINDOW;
      if (quick) {
        setPos(null);
        setTip(next);
      } else {
        if (tipRef.current) setTip(null);
        timerRef.current = setTimeout(() => {
          setPos(null);
          setTip(readTooltip(el));
        }, SHOW_DELAY);
      }
    };

    const handleOut = (e: PointerEvent) => {
      // Leaving the window
      if (!e.relatedTarget) hide();
    };

    window.addEventListener('pointerover', handleOver, true);
    window.addEventListener('pointerout', handleOut, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, true);
    window.addEventListener('keydown', hide, true);
    window.addEventListener('dragstart', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimer();
      window.removeEventListener('pointerover', handleOver, true);
      window.removeEventListener('pointerout', handleOut, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('keydown', hide, true);
      window.removeEventListener('dragstart', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // Follow text changes on the hovered element and hide it if it goes away
  useEffect(() => {
    if (!tip) return;
    const observer = new MutationObserver(() => {
      if (!tip.el.isConnected) {
        setTip(null);
        return;
      }
      const next = readTooltip(tip.el);
      if (!next) setTip(null);
      else if (next.text !== tip.text || next.title !== tip.title || next.shortcut !== tip.shortcut) setTip(next);
    });
    observer.observe(tip.el, { attributes: true, attributeFilter: ['data-tooltip', 'data-tooltip-title', 'data-shortcut'] });
    const parent = tip.el.parentNode;
    if (parent) observer.observe(parent, { childList: true });
    return () => observer.disconnect();
  }, [tip]);

  // Below the element and centred; above it when there is no room; always inside the window
  useLayoutEffect(() => {
    if (!tip || !boxRef.current) return;
    const target = tip.el.getBoundingClientRect();
    const box = boxRef.current.getBoundingClientRect();
    let top = target.bottom + GAP;
    if (top + box.height > window.innerHeight - MARGIN) top = target.top - GAP - box.height;
    let left = target.left + target.width / 2 - box.width / 2;
    left = Math.max(MARGIN, Math.min(window.innerWidth - MARGIN - box.width, left));
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [tip]);

  if (!tip) return null;

  return (
    <div
      ref={boxRef}
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
      className="fixed z-10000 pointer-events-none max-w-xs flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-[#27272a] dark:bg-[#3f3f46] text-white text-[11px] font-body font-medium leading-snug shadow-card-hover whitespace-pre-line animate-tooltip-in"
    >
      {tip.title ? (
        <span className="flex flex-col gap-1 py-0.5">
          <span className="font-bold text-[12px]">{tip.title}</span>
          <span className="font-normal text-white/75">{tip.text}</span>
        </span>
      ) : (
        <span>{tip.text}</span>
      )}
      {tip.shortcut && <ShortcutKeys shortcut={tip.shortcut} />}
    </div>
  );
};
