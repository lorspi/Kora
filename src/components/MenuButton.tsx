import React, { useEffect, useRef, useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';

export interface MenuButtonItem {
  label: string;
  description?: string;
  Icon: React.ElementType;
  onSelect: () => void;
  // Draws a divider above the item
  separatorBefore?: boolean;
}

interface MenuButtonProps {
  label: string;
  Icon: React.ElementType;
  items: MenuButtonItem[];
  primary?: boolean;
  title?: string;
}

// Toolbar button that opens a menu of actions, each with its description below the label.
// Closes on selection, outside click or Escape.
export function MenuButton({ label, Icon, items, primary = false, title }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        data-tooltip={open ? undefined : title}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-8 pl-3 pr-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
          primary
            ? 'bg-bento-blue border-bento-blue text-white hover:bg-bento-blue/90 shadow-card'
            : `bg-card border-border text-foreground hover:bg-accent ${open ? 'bg-accent' : ''}`
        }`}
      >
        <Icon className={`w-4 h-4 ${primary ? 'text-white' : 'text-bento-blue'}`} />
        {label}
        <CaretDown className={`w-3 h-3 ml-0.5 transition-transform ${open ? 'rotate-180' : ''} ${primary ? 'text-white/80' : 'text-muted-foreground'}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 min-w-60 bg-popover border border-border rounded-xl shadow-card-hover py-1 z-50 text-foreground animate-fade-in"
        >
          {items.map(({ label: itemLabel, description, Icon: ItemIcon, onSelect, separatorBefore }) => (
            <React.Fragment key={itemLabel}>
              {separatorBefore && <div className="my-1 border-t border-border" />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect();
                }}
                className="w-full px-3 py-1.5 flex items-start gap-2.5 hover:bg-accent text-left cursor-pointer"
              >
                <ItemIcon className="w-4 h-4 mt-0.5 shrink-0 text-bento-blue" />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{itemLabel}</span>
                  {description && <span className="block text-[10px] text-muted-foreground leading-snug">{description}</span>}
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
