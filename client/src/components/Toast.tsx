import { useEffect, useState } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  type: ToastType;
  message: string;
  duration?: number;
  onClose?: () => void;
}

const iconConfig = {
  success: { Icon: CheckCircle, bgColor: "bg-green-500/10", textColor: "text-green-400", borderColor: "border-green-500/30" },
  error: { Icon: AlertCircle, bgColor: "bg-red-500/10", textColor: "text-red-400", borderColor: "border-red-500/30" },
  info: { Icon: Info, bgColor: "bg-blue-500/10", textColor: "text-blue-400", borderColor: "border-blue-500/30" },
};

/**
 * Single toast notification
 * Shows for a limited duration then auto-closes
 */
export function Toast({
  type,
  message,
  duration = 4000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  const config = iconConfig[type];
  const { Icon, bgColor, textColor, borderColor } = config;

  return (
    <div
      className={`fixed bottom-4 right-4 max-w-sm animate-in slide-in-from-bottom-5 fade-in duration-300 z-50`}
    >
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4 flex items-start gap-3`}>
        <Icon className={`${textColor} w-5 h-5 flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`${textColor} text-sm font-medium`}>{message}</p>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-gray-300 flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Toast container for managing multiple toasts
 * Stacks them vertically
 */
export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Array<{ id: string; type: ToastType; message: string }>;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3 max-w-sm">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          type={toast.type}
          message={toast.message}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}
