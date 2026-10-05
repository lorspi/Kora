/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CaretDown as ChevronDown, Check } from '@phosphor-icons/react';

export interface DropdownOption<T> {
  value: T;
  label: React.ReactNode;
  // Optional content shown before the label (e.g. a curve thumbnail)
  icon?: React.ReactNode;
  description?: string;
  // Draws a divider above the option
  separatorBefore?: boolean;
}

interface DropdownProps<T> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  // Content of the trigger button; defaults to the selected option's icon and label
  triggerLabel?: React.ReactNode;
  // Decides which option shows the check mark (defaults to strict equality)
  isSelected?: (option: T, value: T) => boolean;
  align?: 'left' | 'right';
  // md (32 px) matches the top bar and dialogs; sm (28 px) matches the Inspector fields
  size?: 'sm' | 'md';
  className?: string;
  menuClassName?: string;
  optionClassName?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

// Button + floating menu with a check on the selected option. Closes on selection,
// outside click or Escape.
export function Dropdown<T>({
  value,
  options,
  onChange,
  triggerLabel,
  isSelected = (option, current) => option === current,
  align = 'right',
  size = 'md',
  className = '',
  menuClassName = 'w-28',
  optionClassName = 'font-mono',
  title,
  ariaLabel,
  disabled = false,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  // The menu opens upwards when it doesn't fit below (end of the window or of a scrolling panel)
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setOpenUp(false);
      return;
    }
    const root = rootRef.current;
    const menu = menuRef.current;
    if (!root || !menu) return;
    // Visible area: the window, narrowed by every ancestor that clips its content
    let top = 0;
    let bottom = window.innerHeight;
    for (let el = root.parentElement; el; el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if (overflowY === 'visible') continue;
      const rect = el.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    const trigger = root.getBoundingClientRect();
    const height = menu.offsetHeight + 4;
    setOpenUp(trigger.bottom + height > bottom && trigger.top - height >= top);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selected = options.find((o) => isSelected(o.value, value));
  const sizeClass = size === 'sm' ? 'h-7 rounded-md' : 'h-8 rounded-lg';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 ${sizeClass} bg-secondary border border-border text-foreground text-[11px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        data-tooltip={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerLabel ?? (
          <span className="flex items-center gap-1.5 min-w-0">
            {selected?.icon}
            <span className="truncate">{selected?.label}</span>
          </span>
        )}
        <ChevronDown className="w-2.5 h-2.5 text-muted-foreground shrink-0 ml-auto" />
      </button>

      {open && !disabled && (
        <div
          ref={menuRef}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'} bg-popover border border-border rounded-xl shadow-card-hover py-1 z-50 text-foreground ${menuClassName}`}
          role="listbox"
        >
          {options.map((option, idx) => {
            const active = isSelected(option.value, value);
            return (
              <React.Fragment key={idx}>
                {option.separatorBefore && <div className="my-1 border-t border-border" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    onChange(option.value);
                  }}
                  data-tooltip={option.description}
                  className={`w-full px-3 py-1 flex items-center justify-between gap-2 hover:bg-accent text-left text-xs ${optionClassName}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {active && <Check className="w-3 h-3 text-bento-blue shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
