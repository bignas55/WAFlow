import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

/**
 * Hook for managing toast notifications
 * Automatically generates IDs and removes toasts after timeout
 *
 * Example:
 *   const { toasts, addToast, removeToast } = useToast();
 *
 *   // Show success toast
 *   addToast("User created successfully", "success");
 *
 *   // Show error toast
 *   addToast("Failed to create user", "error");
 *
 *   // Render toasts
 *   <ToastContainer toasts={toasts} onRemove={removeToast} />
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = Date.now().toString();
      const toast: Toast = { id, type, message };

      setToasts(prev => [...prev, toast]);

      // Auto-remove after duration
      if (duration > 0) {
        const timer = setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);

        return () => clearTimeout(timer);
      }

      return () => removeToast(id);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback(
    (message: string, duration?: number) => addToast(message, "success", duration),
    [addToast]
  );

  const error = useCallback(
    (message: string, duration?: number) => addToast(message, "error", duration),
    [addToast]
  );

  const info = useCallback(
    (message: string, duration?: number) => addToast(message, "info", duration),
    [addToast]
  );

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
  };
}
