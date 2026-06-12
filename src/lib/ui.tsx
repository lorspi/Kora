/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface UIContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    timerRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timerRef.current[id];
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    clearTimeout(timerRef.current[id]);
    delete timerRef.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleConfirmResponse = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      {confirmState && (
        <ConfirmModal state={confirmState} onResponse={handleConfirmResponse} />
      )}
    </UIContext.Provider>
  );
}

// ─── Toast icons ──────────────────────────────────────────────────────────────

const toastConfig: Record<ToastType, { icon: React.ReactNode; classes: string }> = {
  success: {
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
    classes: 'bg-card border-bento-green text-bento-green',
  },
  error: {
    icon: <XCircle className="w-4 h-4 shrink-0" />,
    classes: 'bg-card border-destructive text-destructive',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
    classes: 'bg-card border-bento-yellow text-bento-yellow',
  },
  info: {
    icon: <Info className="w-4 h-4 shrink-0" />,
    classes: 'bg-card border-bento-blue text-bento-blue',
  },
};

// ─── ToastContainer ───────────────────────────────────────────────────────────

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => {
        const { icon, classes } = toastConfig[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 border rounded-xl px-4 py-2.5 shadow-card-hover text-xs font-semibold font-body max-w-xs animate-fade-in ${classes}`}
          >
            {icon}
            <span className="text-foreground flex-1">{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              className="ml-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  state,
  onResponse,
}: {
  state: ConfirmState;
  onResponse: (value: boolean) => void;
}) {
  const { title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'default' } = state;
  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px] animate-fade-in"
      onClick={() => onResponse(false)}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-card-hover w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            {isDanger
              ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              : <Info className="w-4 h-4 text-bento-blue shrink-0" />
            }
            <h2 className="text-sm font-bold text-foreground font-heading">{title}</h2>
          </div>
          <button
            onClick={() => onResponse(false)}
            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <p className="px-5 pb-5 text-xs text-muted-foreground leading-relaxed">{message}</p>

        {/* Actions */}
        <div className="flex gap-2 px-5 pb-5 justify-end">
          <button
            onClick={() => onResponse(false)}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-accent border border-border text-foreground transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onResponse(true)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
              isDanger
                ? 'bg-destructive hover:opacity-90 text-white'
                : 'bg-primary hover:opacity-90 text-primary-foreground'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
