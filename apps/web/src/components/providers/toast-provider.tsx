'use client';

import { createContext, useContext, type ReactNode } from 'react';

import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastInput,
} from '@/components/motion/animated-toast-stack';

type ToastContextValue = {
  showToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  updateToast: (id: string, patch: Partial<ToastInput>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, showToast, dismissToast, updateToast } =
    useAnimatedToastStack({
      defaultDuration: 3200,
      limit: 5,
    });

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, updateToast }}>
      {children}
      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position="bottom-right"
        placement="fixed"
        maxVisible={4}
      />
    </ToastContext.Provider>
  );
}
