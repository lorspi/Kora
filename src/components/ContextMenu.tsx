import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ContextMenuItem =
  | {
      label: string;
      onSelect: () => void;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
    }
  | 'separator';

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the viewport
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.min(x, window.innerWidth - width - 8),
      top: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-48 py-1 rounded-lg border border-border bg-card shadow-lg text-xs select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) =>
        item === 'separator' ? (
          <div key={`sep-${idx}`} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={`w-full px-3 py-1.5 flex items-center justify-between gap-4 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none ${
              item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent'
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="font-mono text-[10px] text-muted-foreground">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
};
