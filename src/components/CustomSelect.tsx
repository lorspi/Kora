/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Size variant. 'sm' for compact table usage, 'md' (default) for forms. */
  size?: 'sm' | 'md';
  /** Optional: render the selected value differently (e.g. with badges) */
  renderValue?: (option: SelectOption) => React.ReactNode;
  /** Optional: render each option differently */
  renderOption?: (option: SelectOption, selected: boolean) => React.ReactNode;
}

export default function CustomSelect({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = 'Seleccionar...',
  size = 'md',
  renderValue,
  renderOption,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find(o => o.value === value);

  // Close on outside click — checks both the trigger AND the portal dropdown
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insideDropdown = listRef.current?.contains(target);
      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setSelectedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % options.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + options.length) % options.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && options[selectedIndex]) {
          onChange(options[selectedIndex].value);
          setOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  }, [open, selectedIndex, options, onChange]);

  // Scroll selected option into view
  useEffect(() => {
    if (!open || selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLButtonElement>('[data-option-index]');
    const target = items[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, open]);

  // Reset index when options change
  useEffect(() => {
    if (!open) setSelectedIndex(-1);
  }, [open]);

  // Calculate dropdown position via portal to body
  useEffect(() => {
    if (!open || !containerRef.current) {
      setDropdownStyle(null);
      return;
    }

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const estimatedHeight = Math.min(options.length * 36 + 16, 230);
      const gap = 4;

      // Decide flip direction
      const spaceBelow = vh - rect.bottom - gap;
      const flipUp = spaceBelow < estimatedHeight;

      // Preferred position relative to viewport
      const preferredTop = flipUp ? rect.top - estimatedHeight - gap : rect.bottom + gap;
      // Clamp vertically
      const top = Math.max(4, Math.min(preferredTop, vh - estimatedHeight - 4));

      const width = Math.max(rect.width, 80);
      let left = rect.left;
      // Clamp horizontally
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);

      setDropdownStyle({ top, left, width });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, options.length]);

  const toggleOpen = useCallback(() => {
    if (disabled) return;
    setOpen(prev => !prev);
  }, [disabled]);

  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={handleKeyDown}
        className={`
          w-full flex items-center justify-between gap-2
          bg-card border border-border rounded-xl
          text-foreground
          shadow-card
          focus:outline-none focus:ring-1 focus:ring-ring
          transition-colors cursor-pointer
          ${disabled ? 'opacity-35 cursor-not-allowed pointer-events-none' : 'hover:bg-accent'}
          ${open ? 'ring-1 ring-ring' : ''}
          ${size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'}
        `}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 text-left truncate">
          {renderValue && selected
            ? renderValue(selected)
            : selected
              ? selected.label
              : <span className="text-muted-foreground">{placeholder}</span>
          }
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel — portal to body to escape overflow:hidden AND transform ancestors */}
      {open && options.length > 0 && dropdownStyle && createPortal(
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'fixed',
            top: dropdownStyle.top,
            left: dropdownStyle.left,
            width: dropdownStyle.width,
            zIndex: 9999,
          }}
          className="bg-card border border-border rounded-xl shadow-card-hover py-1 max-h-[220px] overflow-y-auto"
        >
          {options.map((option, idx) => {
            const isSelected = option.value === value;
            const isHighlighted = idx === selectedIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-index={idx}
                onClick={() => handleOptionClick(option.value)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-left text-xs
                  transition-colors cursor-pointer
                  ${isSelected
                    ? 'bg-accent text-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }
                  ${isHighlighted && !isSelected ? 'bg-accent/50' : ''}
                `}
              >
                {renderOption
                  ? renderOption(option, isSelected)
                  : option.label
                }
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
